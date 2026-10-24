// The Worker entry (src/worker.ts): everything every page passes through.
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { setHandler } from "./support/stubs/cloudflare-handler.ts";
import {
  captureLogs,
  fakeAssets,
  fakeContext,
  FakeKV,
  FakeR2,
  installCaches,
  installHTMLRewriter,
  type AssetPage,
} from "./support/fakes.ts";
import worker from "../src/worker.ts";
import { issuePass } from "../src/lib/gate/cookie.ts";
import { resetDenylistMemo } from "../src/lib/denylist.ts";

const HOME = `<!doctype html><html lang="vi"><head><title>Trang chủ</title><script src="/_astro/a.js"></script></head><body><p>real page</p><footer data-site-footer></footer></body></html>`;

const PAGES: Record<string, AssetPage> = {
  "/": { body: HOME },
  "/en/": { body: HOME.replace('lang="vi"', 'lang="en"') },
  "/403/": { status: 200, body: "<html><body>403 page</body></html>" },
  "/data.json": { body: "{}", headers: { "content-type": "application/json" } },
  "/pagefind/pagefind.js": { body: "pagefind", headers: { "content-type": "text/javascript" } },
};

const SECRET = "test-gate-secret";

function makeEnv(overrides: Record<string, unknown> = {}) {
  const kv = new FakeKV();
  const assets = fakeAssets(PAGES);
  const env = {
    KV: kv.asBinding(),
    ASSETS: assets,
    MEDIA: new FakeR2().asBinding(),
    CF_VERSION_METADATA: { id: "v-123", tag: "", timestamp: "2026-10-24T00:00:00Z" },
    ...overrides,
  } as unknown as Env;
  return { env, kv, assets };
}

const gateOn = {
  GATE_MODE: "on",
  GATE_SECRET: SECRET,
  TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
};

// The handler is typed for a workerd request (with `cf`); a plain Request carries the same data.
type WorkerRequest = Parameters<typeof worker.fetch>[0];
const fetchWorker = (req: Request, env: Env, ctx: ExecutionContext) =>
  worker.fetch(req as WorkerRequest, env, ctx);

const request = (url: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
  new Request(url, {
    ...init,
    headers: { "cf-connecting-ip": "198.51.100.7", "x-verified-bot": "false", ...init.headers },
  });

async function run(
  url: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
  overrides = {},
) {
  const { env, kv, assets } = makeEnv(overrides);
  const ctx = fakeContext();
  const response = await fetchWorker(request(url, init), env, ctx as unknown as ExecutionContext);
  await ctx.settle();
  return { response, kv, assets, env };
}

beforeEach(() => {
  resetDenylistMemo();
  installCaches();
  installHTMLRewriter();
  setHandler(null);
  globalThis.$env.DEV = false;
});

describe("worker: routing", () => {
  it("redirects www to the apex, keeping path and query", async () => {
    const { response } = await run("https://www.poli0981.dev/blog/?page=2");
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://poli0981.dev/blog/?page=2");
  });

  it("serves pages straight from ASSETS with the security headers", async () => {
    const { response } = await run("https://poli0981.dev/");
    assert.equal(response.status, 200);
    assert.match(await response.text(), /real page/);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("content-security-policy"), "frame-ancestors 'none'");
  });

  it("keeps the method — HEAD stays HEAD", async () => {
    const { response, assets } = await run("https://poli0981.dev/", { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.equal(assets.requests.at(-1)?.method, "HEAD");
  });

  it("falls through to the Astro app on an asset 404 and for app routes", async () => {
    for (const path of ["/no-such-page/", "/api/health", "/admin/"]) {
      const host = path === "/admin/" ? "admin.poli0981.dev" : "poli0981.dev";
      const { response } = await run(`https://${host}${path}`);
      assert.match(await response.text(), /from the Astro handler/, path);
    }
  });

  it("lets the app handle everything under astro dev", async () => {
    globalThis.$env.DEV = true;
    const { response, assets } = await run("https://poli0981.dev/");
    assert.match(await response.text(), /from the Astro handler/);
    assert.equal(assets.requests.length, 0);
  });

  it("sends the public host's /admin to the admin host", async () => {
    const { response } = await run("https://poli0981.dev/admin/media/");
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://admin.poli0981.dev/admin/media/");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  });

  it("routes /media and /ext-img to their handlers", async () => {
    const media = await run("https://poli0981.dev/media/v1/0123456789abcdef/webp-800");
    assert.equal(media.response.status, 404);
    const picture = await run("https://poli0981.dev/ext-img/yt/abcdefghijk");
    assert.equal(picture.response.status, 404);
    assert.equal(picture.response.headers.get("x-frame-options"), "DENY");
  });

  it("stamps the Ray ID into the 500 page, and only there", async () => {
    const page = `<p>Reference: <span class="ref" id="ref">—</span></p>`;
    const html = { "content-type": "text/html; charset=utf-8" };
    setHandler(async () => new Response(page, { status: 500, headers: html }));
    const ray = { headers: { "cf-ray": "8f1c2a3b4c5d6e7f-SIN" } };
    const failed = await run("https://poli0981.dev/api/health", ray);
    assert.equal(failed.response.status, 500);
    assert.match(await failed.response.text(), /id="ref">8f1c2a3b4c5d6e7f-SIN</);
    const noRay = await run("https://poli0981.dev/api/health");
    assert.match(await noRay.response.text(), /id="ref">—</);

    setHandler(async () => new Response(page, { status: 200, headers: html }));
    const fine = await run("https://poli0981.dev/api/health", ray);
    assert.match(await fine.response.text(), /id="ref">—</);
  });

  it("fails open to the Astro app when edge logic throws", async () => {
    const { env } = makeEnv();
    (env as unknown as { ASSETS: { fetch: () => never } }).ASSETS.fetch = () => {
      throw new Error("assets down");
    };
    const { result, logs } = await captureLogs(() =>
      fetchWorker(
        request("https://poli0981.dev/"),
        env,
        fakeContext() as unknown as ExecutionContext,
      ),
    );
    assert.match(await result.text(), /from the Astro handler/);
    assert.equal(logs[0]?.event, "worker.edge_failed");
    assert.equal(logs[0]?.version, "v-123");
  });
});

describe("worker: IP denylist", () => {
  const listed = (entries: unknown) => async (kv: FakeKV) =>
    kv.put("denylist", JSON.stringify(entries));

  async function runListed(entries: unknown, url = "https://poli0981.dev/", ip = "198.51.100.7") {
    const { env, kv } = makeEnv();
    await listed(entries)(kv);
    resetDenylistMemo(); // each call stands for a fresh isolate reading its own list
    return captureLogs(() =>
      fetchWorker(
        request(url, { headers: { "cf-connecting-ip": ip } }),
        env,
        fakeContext() as unknown as ExecutionContext,
      ),
    );
  }

  it("answers a listed address with the 403 page, uncached — pages included", async () => {
    const { result, logs } = await runListed([{ cidr: "198.51.100.7" }]);
    assert.equal(result.status, 403);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.match(await result.text(), /403 page/);
    assert.equal(logs[0]?.event, "denylist.blocked");
  });

  it("matches CIDR ranges and ignores expired entries", async () => {
    assert.equal((await runListed([{ cidr: "198.51.100.0/24" }])).result.status, 403);
    const expired = [{ cidr: "198.51.100.7", until: "2000-01-01T00:00:00Z" }];
    assert.equal((await runListed(expired)).result.status, 200);
    assert.equal((await runListed([{ cidr: "203.0.113.0/24" }])).result.status, 200);
  });

  it("fails open when KV is unavailable", async () => {
    const { env, kv } = makeEnv();
    kv.failWith = new Error("kv down");
    const { result, logs } = await captureLogs(() =>
      fetchWorker(
        request("https://poli0981.dev/"),
        env,
        fakeContext() as unknown as ExecutionContext,
      ),
    );
    assert.equal(result.status, 200);
    assert.equal(logs[0]?.event, "denylist.unavailable");
  });

  it("does nothing without a client address", async () => {
    const { env } = makeEnv();
    const response = await fetchWorker(
      new Request("https://poli0981.dev/"),
      env,
      fakeContext() as unknown as ExecutionContext,
    );
    assert.equal(response.status, 200);
  });
});

describe("worker: Turnstile gate", () => {
  it("answers a page view without a pass with the gate", async () => {
    const { response } = await run("https://poli0981.dev/", {}, gateOn);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /data-human-check/);
    assert.doesNotMatch(html, /real page/);
    assert.equal(response.headers.get("cache-control"), "no-store, private");
  });

  it("serves the page with a valid pass", async () => {
    const pass = await issuePass(SECRET);
    const { response } = await run(
      "https://poli0981.dev/",
      { headers: { cookie: `__Host-gate=${pass}` } },
      gateOn,
    );
    assert.match(await response.text(), /real page/);
  });

  it("never lets a malformed pass through (the old fail-open bypass)", async () => {
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    for (const signature of ["A", "AAAAA", "A".repeat(43)]) {
      const { response } = await run(
        "https://poli0981.dev/",
        { headers: { cookie: `__Host-gate=v1.${expiry}.x.${signature}` } },
        gateOn,
      );
      assert.match(await response.text(), /data-human-check/, signature);
    }
  });

  it("refuses the search index without a pass and passes non-HTML through", async () => {
    assert.equal(
      (await run("https://poli0981.dev/pagefind/pagefind.js", {}, gateOn)).response.status,
      403,
    );
    const data = await run("https://poli0981.dev/data.json", {}, gateOn);
    assert.equal(data.response.status, 200);
    assert.equal(await data.response.text(), "{}");
  });

  it("lets verified bots and exempt paths through", async () => {
    const bot = await run(
      "https://poli0981.dev/",
      { headers: { "x-verified-bot": "true" } },
      gateOn,
    );
    assert.match(await bot.response.text(), /real page/);
  });

  it("fails open, once logged, while the Transform Rule header is missing", async () => {
    const { env } = makeEnv(gateOn);
    const { result, logs } = await captureLogs(() =>
      fetchWorker(
        new Request("https://poli0981.dev/", { headers: { "cf-connecting-ip": "198.51.100.7" } }),
        env,
        fakeContext() as unknown as ExecutionContext,
      ),
    );
    assert.match(await result.text(), /real page/);
    assert.ok(logs.some((line) => line.event === "gate.unconfigured"));
  });

  it("fails CLOSED when the gate itself breaks", async () => {
    const { env } = makeEnv(gateOn);
    (env as unknown as { ASSETS: { fetch: () => never } }).ASSETS.fetch = () => {
      throw new Error("assets down");
    };
    const { result, logs } = await captureLogs(() =>
      fetchWorker(
        request("https://poli0981.dev/"),
        env,
        fakeContext() as unknown as ExecutionContext,
      ),
    );
    assert.equal(result.status, 503);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(await result.text(), /real page/);
    assert.equal(logs[0]?.event, "gate.failed");
  });
});
