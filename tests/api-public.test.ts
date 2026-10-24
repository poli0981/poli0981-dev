// The public API routes: /api/gate, /api/report, /api/health, /api/widgets.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { APIContext } from "astro";
import { setServerEnv } from "./support/stubs/astro-env-server.ts";
import { setWorkerEnv } from "./support/stubs/cloudflare-workers.ts";
import {
  captureLogs,
  fakeContext,
  FakeKV,
  installCaches,
  jsonResponse,
  mockFetch,
  type FetchCall,
} from "./support/fakes.ts";
import { POST as gatePost } from "../src/pages/api/gate.ts";
import { POST as reportPost } from "../src/pages/api/report.ts";
import { GET as healthGet } from "../src/pages/api/health.ts";
import { GET as widgetsGet } from "../src/pages/api/widgets.ts";

const ctx = (request: Request, extra: Record<string, unknown> = {}) =>
  ({ request, url: new URL(request.url), locals: {}, ...extra }) as unknown as APIContext;

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TEST_SECRET = "1x0000000000000000000000000000000AA";

let fetched: ReturnType<typeof mockFetch> | null = null;
afterEach(() => fetched?.restore());

function route(handlers: Record<string, (call: FetchCall) => Response>) {
  fetched = mockFetch((call) => {
    for (const [prefix, handler] of Object.entries(handlers)) {
      if (call.url.startsWith(prefix)) return handler(call);
    }
    throw new Error(`unexpected fetch ${call.url}`);
  });
  return fetched;
}

const siteverify = (verdict: Record<string, unknown>) => () =>
  jsonResponse({ success: true, hostname: "poli0981.dev", ...verdict });

describe("POST /api/gate", () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    gatePost(
      ctx(
        new Request("https://poli0981.dev/api/gate", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "sec-fetch-site": "same-origin",
            ...headers,
          },
          body,
        }),
      ),
    ) as Promise<Response>;

  beforeEach(() => setServerEnv({ GATE_SECRET: "gate-secret", TURNSTILE_SECRET: TEST_SECRET }));

  it("is unavailable until both secrets exist", async () => {
    setServerEnv({ GATE_SECRET: "gate-secret" });
    assert.equal((await post("{}")).status, 503);
  });

  it("only answers this origin's gate page", async () => {
    assert.equal((await post("{}", { "sec-fetch-site": "cross-site" })).status, 403);
  });

  it("refuses oversized and malformed bodies", async () => {
    assert.equal((await post(JSON.stringify({ token: "x".repeat(9000) }))).status, 413);
    assert.equal((await post("not json")).status, 400);
    assert.equal((await post(JSON.stringify({ token: 42 }))).status, 400);
  });

  it("trades a solved challenge for the 48-hour pass", async () => {
    const calls = route({ [SITEVERIFY]: siteverify({ action: "gate" }) }).calls;
    const response = await post(JSON.stringify({ token: "solved" }), {
      "cf-connecting-ip": "203.0.113.5",
    });
    assert.equal(response.status, 204);
    assert.match(response.headers.get("set-cookie") ?? "", /^__Host-gate=v1\./);
    assert.match(calls[0].body, /remoteip=203\.0\.113\.5/);
  });

  it("logs and refuses a failed challenge", async () => {
    route({
      [SITEVERIFY]: () =>
        jsonResponse({ success: false, "error-codes": ["invalid-input-response"] }),
    });
    const { result, logs } = await captureLogs(() => post(JSON.stringify({ token: "bad" })));
    assert.equal(result.status, 400);
    assert.deepEqual(await result.json(), {
      error: "turnstile_failed",
      reason: "invalid-input-response",
    });
    assert.equal(logs[0]?.event, "gate.turnstile_failed");
  });
});

describe("POST /api/report", () => {
  const report = {
    description: "The gallery lightbox closes when I press @someone's arrow keys",
    console: [{ ts: "2026-10-24T00:00:00Z", type: "error", message: "boom ``` breakout" }],
    meta: {
      route: "/gallery/`x`/",
      ua: "Test UA",
      viewport: "390x844",
      theme: "dark",
      locale: "vi",
      ref: "abc",
    },
    turnstileToken: "solved",
  };
  const post = (body: string, headers: Record<string, string> = {}) =>
    reportPost(
      ctx(
        new Request("https://poli0981.dev/api/report", {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body,
        }),
      ),
    ) as Promise<Response>;

  beforeEach(() => {
    setServerEnv({
      TURNSTILE_SECRET: TEST_SECRET,
      GITHUB_ISSUES_TOKEN: "issues-token",
      DISCORD_WEBHOOK_BUG: "https://discord.example/webhook",
    });
    setWorkerEnv({ REPORT_REPO: "poli0981/site-reports" });
  });

  it("is unavailable without its secrets, and refuses bad input", async () => {
    setServerEnv({ TURNSTILE_SECRET: TEST_SECRET });
    assert.equal((await post("{}")).status, 503);
    setServerEnv({ TURNSTILE_SECRET: TEST_SECRET, GITHUB_ISSUES_TOKEN: "t" });
    assert.equal((await post("x".repeat(40_000))).status, 413);
    assert.equal((await post("{", { "content-length": "1" })).status, 400);
    assert.equal((await post(JSON.stringify({ ...report, description: "short" }))).status, 400);
  });

  it("files a private issue that can't ping anyone, then notifies Discord", async () => {
    const { calls } = route({
      [SITEVERIFY]: siteverify({ action: "report" }),
      "https://api.github.com/": () => jsonResponse({ html_url: "https://github.com/x/1" }, 201),
      "https://discord.example/": () => new Response(null, { status: 204 }),
    });
    const response = await post(JSON.stringify(report));
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true });

    const issue = calls.find((c) => c.url.startsWith("https://api.github.com/"));
    assert.equal(issue?.url, "https://api.github.com/repos/poli0981/site-reports/issues");
    const body = JSON.parse(issue?.body ?? "{}") as {
      title: string;
      body: string;
      labels: string[];
    };
    assert.match(body.title, /^\[web-report\] /);
    assert.doesNotMatch(body.body, /@someone/); // the mention is broken up
    assert.match(body.body, /- Route: `\/gallery\/'x'\/`/);
    assert.match(body.body, /````\n\[2026-10-24T00:00:00Z\] error: boom ``` breakout\n````/);
    assert.deepEqual(body.labels, ["bug", "from-site"]);

    const discord = calls.find((c) => c.url.startsWith("https://discord.example/"));
    assert.deepEqual(JSON.parse(discord?.body ?? "{}").allowed_mentions, { parse: [] });
  });

  it("still succeeds (degraded) when GitHub fails, and survives Discord failing", async () => {
    route({
      [SITEVERIFY]: siteverify({ action: "report" }),
      "https://api.github.com/": () => jsonResponse({ message: "nope" }, 404),
      "https://discord.example/": () => {
        throw new Error("discord down");
      },
    });
    const { result, logs } = await captureLogs(() => post(JSON.stringify(report)));
    assert.equal(result.status, 202);
    assert.deepEqual(
      logs.map((line) => line.event),
      ["report.github_failed", "report.discord_failed", "report.received"],
    );
  });

  it("falls back to the default repo and survives a GitHub network error", async () => {
    setWorkerEnv({});
    setServerEnv({ TURNSTILE_SECRET: TEST_SECRET, GITHUB_ISSUES_TOKEN: "t" });
    const { calls } = route({
      [SITEVERIFY]: siteverify({ action: "report" }),
      "https://api.github.com/": () => {
        throw new Error("network");
      },
    });
    const { result } = await captureLogs(() => post(JSON.stringify(report)));
    assert.equal(result.status, 202);
    assert.ok(calls.some((c) => c.url.includes("/repos/poli0981/site-reports/issues")));
  });

  it("rejects a token minted for another form (with a real, non-test secret)", async () => {
    setServerEnv({ TURNSTILE_SECRET: "0x4AAAAAAA-real-secret", GITHUB_ISSUES_TOKEN: "t" });
    route({ [SITEVERIFY]: siteverify({ action: "gate" }) });
    const response = await post(JSON.stringify(report));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "turnstile_failed",
      reason: "action-mismatch",
    });
  });
});

describe("GET /api/health", () => {
  it("reports ok and the running version", async () => {
    setWorkerEnv({
      CF_VERSION_METADATA: { id: "v-9", tag: "", timestamp: "2026-10-24T01:02:03Z" },
    });
    const response = (await healthGet(
      ctx(new Request("https://poli0981.dev/api/health")),
    )) as Response;
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      ok: true,
      version: { id: "v-9", tag: null, timestamp: "2026-10-24T01:02:03Z", commit: null },
    });
  });
});

describe("GET /api/widgets", () => {
  it("reads the four KV feeds once, then serves the edge-cached copy", async () => {
    const cache = installCaches();
    const kv = new FakeKV();
    await kv.put("widgets:yt", JSON.stringify({ updated: "t", items: [{ id: "a" }] }));
    await kv.put(
      "widgets:status",
      JSON.stringify({ yt: "ok", steam: "na", gh: "na", lastRun: "t" }),
    );
    setWorkerEnv({ KV: kv.asBinding() });

    const execution = fakeContext();
    const request = new Request("https://poli0981.dev/api/widgets?x=1");
    const first = (await widgetsGet(
      ctx(request, { locals: { cfContext: execution } }),
    )) as Response;
    await execution.settle();
    const body = (await first.json()) as Record<string, unknown>;
    assert.deepEqual(body.yt, { updated: "t", items: [{ id: "a" }] });
    assert.equal(body.steam, null);
    assert.equal(first.headers.get("cache-control"), "public, max-age=300");
    assert.equal(kv.reads.length, 4);
    assert.ok(cache.store.has("https://poli0981.dev/api/widgets"));

    const second = (await widgetsGet(
      ctx(request, { locals: { cfContext: execution } }),
    )) as Response;
    assert.deepEqual(await second.json(), body);
    assert.equal(kv.reads.length, 4); // served from the cache
  });

  it("answers with empty feeds when KV is missing (astro dev)", async () => {
    installCaches();
    setWorkerEnv({});
    const execution = fakeContext();
    const response = (await widgetsGet(
      ctx(new Request("https://poli0981.dev/api/widgets"), { locals: { cfContext: execution } }),
    )) as Response;
    assert.deepEqual(await response.json(), { yt: null, steam: null, gh: null, status: null });
  });
});
