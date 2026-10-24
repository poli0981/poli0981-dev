// In-memory stand-ins for the Workers platform pieces the code under test touches: KV, R2,
// the Images binding, the Cache API, ASSETS, rate limiters, HTMLRewriter and fetch. Each
// implements only what the site uses, and records what happened so tests can assert on it.

const encoder = new TextEncoder();

function toBytes(value: ArrayBuffer | ArrayBufferView | string): Uint8Array<ArrayBuffer> {
  if (typeof value === "string") return encoder.encode(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  const view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(view);
}

// ── KV ────────────────────────────────────────────────────────────────────────────────

type KvType = "text" | "json" | "arrayBuffer";
type KvOptions = KvType | { type?: KvType; cacheTtl?: number } | undefined;

export class FakeKV {
  readonly store = new Map<
    string,
    { value: Uint8Array<ArrayBuffer>; metadata?: unknown; ttl?: number }
  >();
  readonly reads: string[] = [];
  /** When set, every operation throws it (a KV outage). */
  failWith: Error | null = null;

  private decode(raw: Uint8Array<ArrayBuffer>, options: KvOptions): unknown {
    const type = typeof options === "string" ? options : (options?.type ?? "text");
    if (type === "arrayBuffer") return raw.buffer.slice(0);
    const text = new TextDecoder().decode(raw);
    return type === "json" ? JSON.parse(text) : text;
  }

  async get(key: string, options?: KvOptions): Promise<unknown> {
    if (this.failWith) throw this.failWith;
    this.reads.push(key);
    const entry = this.store.get(key);
    return entry ? this.decode(entry.value, options) : null;
  }

  async getWithMetadata(
    key: string,
    options?: KvOptions,
  ): Promise<{ value: unknown; metadata: unknown }> {
    if (this.failWith) throw this.failWith;
    this.reads.push(key);
    const entry = this.store.get(key);
    return entry
      ? { value: this.decode(entry.value, options), metadata: entry.metadata ?? null }
      : { value: null, metadata: null };
  }

  async put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView,
    options: { expirationTtl?: number; metadata?: unknown } = {},
  ): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.store.set(key, {
      value: toBytes(value),
      metadata: options.metadata,
      ttl: options.expirationTtl,
    });
  }

  async delete(key: string): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.store.delete(key);
  }

  async list(options: { prefix?: string } = {}): Promise<{
    keys: { name: string; metadata?: unknown }[];
    list_complete: true;
  }> {
    if (this.failWith) throw this.failWith;
    const keys = [...this.store.keys()]
      .filter((name) => name.startsWith(options.prefix ?? ""))
      .sort()
      .map((name) => ({ name, metadata: this.store.get(name)?.metadata }));
    return { keys, list_complete: true };
  }

  text(key: string): string | null {
    const entry = this.store.get(key);
    return entry ? new TextDecoder().decode(entry.value) : null;
  }

  asBinding(): KVNamespace {
    return this as unknown as KVNamespace;
  }
}

// ── R2 ────────────────────────────────────────────────────────────────────────────────

interface R2Entry {
  bytes: Uint8Array<ArrayBuffer>;
  httpMetadata: Record<string, string>;
  customMetadata: Record<string, string>;
  uploaded: Date;
}

function r2Object(key: string, entry: R2Entry) {
  return {
    key,
    size: entry.bytes.byteLength,
    httpEtag: `"etag-${key.length}-${entry.bytes.byteLength}"`,
    httpMetadata: { ...entry.httpMetadata },
    customMetadata: { ...entry.customMetadata },
    uploaded: entry.uploaded,
    get body() {
      return new Response(entry.bytes.slice()).body;
    },
    async arrayBuffer() {
      return entry.bytes.buffer.slice(0);
    },
    async text() {
      return new TextDecoder().decode(entry.bytes);
    },
    async json() {
      return JSON.parse(new TextDecoder().decode(entry.bytes));
    },
  };
}

export class FakeR2 {
  readonly store = new Map<string, R2Entry>();
  readonly deleted: string[] = [];
  /** Page size for list(), small enough that tests exercise the cursor. */
  pageSize = 1000;

  async get(key: string) {
    const entry = this.store.get(key);
    return entry ? r2Object(key, entry) : null;
  }

  async put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string,
    options: {
      httpMetadata?: Record<string, string>;
      customMetadata?: Record<string, string>;
    } = {},
  ): Promise<void> {
    this.store.set(key, {
      bytes: toBytes(value),
      httpMetadata: options.httpMetadata ?? {},
      customMetadata: options.customMetadata ?? {},
      uploaded: new Date("2026-10-01T00:00:00Z"),
    });
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      this.deleted.push(key);
      this.store.delete(key);
    }
  }

  async list(options: { prefix?: string; cursor?: string } = {}) {
    const all = [...this.store.keys()].filter((key) => key.startsWith(options.prefix ?? "")).sort();
    const start = Number(options.cursor ?? "0");
    const page = all.slice(start, start + this.pageSize);
    const truncated = start + this.pageSize < all.length;
    return {
      objects: page.map((key) => r2Object(key, this.store.get(key) as R2Entry)),
      truncated,
      cursor: truncated ? String(start + this.pageSize) : undefined,
    };
  }

  asBinding(): R2Bucket {
    return this as unknown as R2Bucket;
  }
}

// ── Images binding ────────────────────────────────────────────────────────────────────

export class FakeImages {
  /** Size `info()` reports for any input. */
  size = { width: 2400, height: 1600 };
  /** Formats the fake "falls back" from, answering with WebP instead (as Cloudflare may). */
  fallbackFrom = new Set<string>();
  readonly outputs: { width?: number; format: string; quality?: number }[] = [];
  infoFails = false;

  input(_stream: ReadableStream) {
    let width: number | undefined;
    const builder = {
      transform: (options: { width?: number }) => {
        width = options.width;
        return builder;
      },
      output: async (options: { format: string; quality?: number }) => {
        this.outputs.push({ width, format: options.format, quality: options.quality });
        const format = this.fallbackFrom.has(options.format) ? "image/webp" : options.format;
        const bytes = encoder.encode(`${format}:${width ?? "full"}`);
        return { response: () => new Response(bytes), contentType: () => format };
      },
    };
    return builder;
  }

  async info(_stream: ReadableStream) {
    if (this.infoFails) return { format: "image/svg+xml" };
    return { ...this.size, format: "image/webp", fileSize: 1234 };
  }

  asBinding(): ImagesBinding {
    return this as unknown as ImagesBinding;
  }
}

// ── Cache API ─────────────────────────────────────────────────────────────────────────

export class FakeCache {
  readonly store = new Map<string, { body: ArrayBuffer; init: ResponseInit }>();
  readonly deleted: string[] = [];

  private keyOf(request: Request | string): string {
    return typeof request === "string" ? request : request.url;
  }

  async match(request: Request | string): Promise<Response | undefined> {
    const hit = this.store.get(this.keyOf(request));
    return hit ? new Response(hit.body.slice(0), hit.init) : undefined;
  }

  async put(request: Request | string, response: Response): Promise<void> {
    this.store.set(this.keyOf(request), {
      body: await response.arrayBuffer(),
      init: { status: response.status, headers: [...response.headers] },
    });
  }

  async delete(request: Request | string): Promise<boolean> {
    this.deleted.push(this.keyOf(request));
    return this.store.delete(this.keyOf(request));
  }
}

/** Install `caches.default` for code that reads the Workers Cache API. */
export function installCaches(cache = new FakeCache()): FakeCache {
  (globalThis as unknown as { caches: { default: FakeCache } }).caches = { default: cache };
  return cache;
}

// ── ExecutionContext ──────────────────────────────────────────────────────────────────

export function fakeContext() {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil(promise: Promise<unknown>) {
      pending.push(promise);
    },
    passThroughOnException() {},
    props: {},
    /** Wait for everything handed to waitUntil(). */
    settle: () => Promise.all(pending),
  };
}

// ── ASSETS ────────────────────────────────────────────────────────────────────────────

export interface AssetPage {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}

/** The static-asset binding: pathname → page; anything else is a 404. */
export function fakeAssets(pages: Record<string, AssetPage>) {
  const requests: Request[] = [];
  return {
    requests,
    async fetch(input: Request | URL | string): Promise<Response> {
      const request = input instanceof Request ? input : new Request(String(input));
      requests.push(request);
      const page = pages[new URL(request.url).pathname];
      if (!page)
        return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
      return new Response(request.method === "HEAD" ? null : (page.body ?? ""), {
        status: page.status ?? 200,
        headers: page.headers ?? { "content-type": "text/html; charset=utf-8" },
      });
    },
  };
}

// ── Rate limiter ──────────────────────────────────────────────────────────────────────

export class FakeRateLimiter {
  readonly counts = new Map<string, number>();
  readonly limitPerKey: number;

  constructor(limitPerKey: number) {
    this.limitPerKey = limitPerKey;
  }

  async limit({ key }: { key: string }): Promise<{ success: boolean }> {
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return { success: count <= this.limitPerKey };
  }
}

// ── fetch ─────────────────────────────────────────────────────────────────────────────

export interface FetchCall {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

type Route = (call: FetchCall) => Response | Promise<Response>;

/**
 * Replace global fetch for the duration of a test. `route` answers every call (throw from it
 * to simulate a network error); `calls` records what was sent. Call `restore()` afterwards.
 */
export function mockFetch(route: Route) {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    // Browser code fetches relative URLs; resolve them like a page at `location` would.
    const base =
      (globalThis as { location?: { href: string } }).location?.href ?? "http://localhost/";
    const request = new Request(
      input instanceof Request ? input : new URL(String(input), base),
      init,
    );
    const body = init?.body instanceof FormData ? formText(init.body) : await request.text();
    const call = { url: request.url, method: request.method, headers: request.headers, body };
    calls.push(call);
    return route(call);
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function formText(form: FormData): string {
  return [...form.entries()].map(([key, value]) => `${key}=${String(value)}`).join("&");
}

export const jsonResponse = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

// ── HTMLRewriter ──────────────────────────────────────────────────────────────────────

interface ElementHandlers {
  element?: (element: FakeElement) => void;
}

interface FakeElement {
  getAttribute(name: string): string | null;
  remove(): void;
  setInnerContent(content: string, options?: { html: boolean }): void;
}

/**
 * Just enough of workerd's HTMLRewriter for src/lib/gate/render.ts: the selectors it uses
 * (`html`, `head script[src]`, `link[rel="modulepreload"]`, `script[type="application/ld+json"]`,
 * `body`) applied to the whole document with string surgery.
 */
export class FakeHTMLRewriter {
  private readonly handlers: [string, ElementHandlers][] = [];

  on(selector: string, handlers: ElementHandlers): this {
    this.handlers.push([selector, handlers]);
    return this;
  }

  transform(response: Response): Response {
    const run = async () => {
      let html = await response.text();
      for (const [selector, { element }] of this.handlers) {
        if (!element) continue;
        html = applySelector(html, selector, element);
      }
      return html;
    };
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(await run()));
        controller.close();
      },
    });
    return new Response(stream, response);
  }
}

function applySelector(
  html: string,
  selector: string,
  handler: (element: FakeElement) => void,
): string {
  const attribute = (tag: string, name: string) =>
    new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
  const replaceTags = (pattern: RegExp, within?: [number, number]) =>
    html.replace(pattern, (tag, offset: number) => {
      if (within && (offset < within[0] || offset > within[1])) return tag;
      let removed = false;
      handler({
        getAttribute: (name) => attribute(tag, name),
        remove: () => {
          removed = true;
        },
        setInnerContent: () => {},
      });
      return removed ? "" : tag;
    });

  switch (selector) {
    case "html": {
      const tag = /<html[^>]*>/.exec(html)?.[0] ?? "";
      handler({ getAttribute: (name) => attribute(tag, name), remove() {}, setInnerContent() {} });
      return html;
    }
    case "head script[src]": {
      const head: [number, number] = [html.indexOf("<head"), html.indexOf("</head>")];
      return replaceTags(/<script\b[^>]*\ssrc="[^"]*"[^>]*><\/script>/g, head);
    }
    case 'link[rel="modulepreload"]':
      return replaceTags(/<link\b[^>]*rel="modulepreload"[^>]*>/g);
    case 'script[type="application/ld+json"]':
      return replaceTags(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g);
    case "body":
      return html.replace(
        /(<body[^>]*>)[\s\S]*(<\/body>)/,
        (_match, open: string, close: string) => {
          let inner = "";
          handler({
            getAttribute: () => null,
            remove() {},
            setInnerContent: (content) => {
              inner = content;
            },
          });
          return `${open}${inner}${close}`;
        },
      );
    default:
      throw new Error(`FakeHTMLRewriter: unsupported selector ${selector}`);
  }
}

export function installHTMLRewriter(): void {
  (globalThis as unknown as { HTMLRewriter: typeof FakeHTMLRewriter }).HTMLRewriter =
    FakeHTMLRewriter;
}

// ── Console capture ───────────────────────────────────────────────────────────────────

/** Collect the structured log lines (src/lib/log.ts) emitted while `fn` runs. */
export async function captureLogs<T>(
  fn: () => Promise<T> | T,
): Promise<{ result: T; logs: Record<string, unknown>[] }> {
  const logs: Record<string, unknown>[] = [];
  const originals = { log: console.log, warn: console.warn, error: console.error };
  const collect = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && first.startsWith("{")) {
      try {
        logs.push(JSON.parse(first) as Record<string, unknown>);
        return;
      } catch {
        // not one of ours — fall through and drop it
      }
    }
  };
  console.log = collect;
  console.warn = collect;
  console.error = collect;
  try {
    const result = await fn();
    return { result, logs };
  } finally {
    Object.assign(console, originals);
  }
}
