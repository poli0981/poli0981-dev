// `@astrojs/cloudflare/handler` for unit tests: the Astro app behind src/worker.ts. By default
// it answers every request with a recognizable page; tests swap in their own with setHandler().

type Handler = (request: Request, env: unknown, ctx: unknown) => Promise<Response>;

const DEFAULT: Handler = async () =>
  new Response("<!doctype html><title>astro</title><p>from the Astro handler</p>", {
    headers: { "content-type": "text/html; charset=utf-8" },
  });

let current: Handler = DEFAULT;

export function setHandler(handler: Handler | null): void {
  current = handler ?? DEFAULT;
}

export function handle(request: Request, env: unknown, ctx: unknown): Promise<Response> {
  return current(request, env, ctx);
}
