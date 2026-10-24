// src/middleware.ts: admin access + CSRF, per-group API rate limits, response headers.
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { setWorkerEnv } from "./support/stubs/cloudflare-workers.ts";
import { captureLogs, fakeAssets, FakeRateLimiter, mockFetch } from "./support/fakes.ts";
import { onRequest } from "../src/middleware.ts";

type Locals = { admin?: { email: string } };

function context(
  url: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
  routePattern?: string,
) {
  const request = new Request(url, {
    ...init,
    headers: { "cf-connecting-ip": "198.51.100.7", ...init.headers },
  });
  const rewrites: string[] = [];
  return {
    request,
    url: new URL(url),
    routePattern: routePattern ?? new URL(url).pathname,
    locals: {} as Locals,
    rewrites,
    rewrite: async (path: string) => {
      rewrites.push(path);
      return new Response(`rewritten to ${path}`);
    },
  };
}

const next = async () =>
  new Response("from the route", { headers: { "content-type": "text/plain" } });

type Ctx = ReturnType<typeof context>;
const call = (ctx: Ctx, handler = next) =>
  (onRequest as unknown as (c: Ctx, n: () => Promise<Response>) => Promise<Response>)(ctx, handler);

beforeEach(() => {
  globalThis.$env.DEV = false;
  setWorkerEnv({
    ASSETS: fakeAssets({ "/429/": { body: "429 page" }, "/403/": { body: "403 page" } }),
  });
});

describe("middleware: admin", () => {
  it("refuses admin routes without a Cloudflare Access identity", async () => {
    const { result, logs } = await captureLogs(() =>
      call(context("https://admin.poli0981.dev/admin/")),
    );
    assert.equal(result.status, 403);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(logs[0]?.event, "admin.access_denied");
  });

  it("uses a stand-in identity under astro dev and hardens admin responses", async () => {
    globalThis.$env.DEV = true;
    const ctx = context("https://admin.poli0981.dev/admin/");
    const response = await call(ctx);
    assert.equal(await response.text(), "from the route");
    assert.deepEqual(ctx.locals.admin, { email: "dev@localhost" });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
  });

  it("refuses state-changing admin requests from another origin (CSRF)", async () => {
    globalThis.$env.DEV = true;
    const crossSite = context("https://admin.poli0981.dev/api/admin/content", {
      method: "PUT",
      headers: { "sec-fetch-site": "same-site", origin: "https://poli0981.dev" },
    });
    assert.equal((await call(crossSite)).status, 403);
    const noOrigin = context("https://admin.poli0981.dev/api/admin/content", { method: "DELETE" });
    assert.equal((await call(noOrigin)).status, 403);
    const sameOrigin = context("https://admin.poli0981.dev/api/admin/content", {
      method: "PUT",
      headers: { "sec-fetch-site": "same-origin", origin: "https://admin.poli0981.dev" },
    });
    assert.equal(await (await call(sameOrigin)).text(), "from the route");
  });

  it("verifies a real Access JWT against the team's keys", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
    const team = "https://middleware-team.cloudflareaccess.com";
    const fetched = mockFetch(() => new Response(JSON.stringify({ keys: [jwk] })));
    try {
      setWorkerEnv({ ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: "aud-1" });
      const token = await new SignJWT({ email: "Owner@Example.com" })
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(team)
        .setAudience("aud-1")
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey);
      const ctx = context("https://admin.poli0981.dev/admin/", {
        headers: { "cf-access-jwt-assertion": token },
      });
      const response = await call(ctx);
      assert.equal(response.status, 200);
      assert.deepEqual(ctx.locals.admin, { email: "owner@example.com" });
    } finally {
      fetched.restore();
    }
  });
});

describe("middleware: rate limits", () => {
  it("answers 429 with Retry-After once a group's budget is spent", async () => {
    setWorkerEnv({
      ASSETS: fakeAssets({ "/429/": { body: "429 page" } }),
      RL_REPORT: new FakeRateLimiter(1),
    });
    assert.equal(
      (await call(context("https://poli0981.dev/api/report", { method: "POST" }))).status,
      200,
    );
    const { result, logs } = await captureLogs(() =>
      call(context("https://poli0981.dev/api/report", { method: "POST" })),
    );
    assert.equal(result.status, 429);
    assert.equal(result.headers.get("retry-after"), "60");
    assert.equal(await result.text(), "429 page");
    assert.equal(logs[0]?.event, "ratelimit.exceeded");
    assert.equal(logs[0]?.group, "report");
  });

  it("never limits the widgets endpoint and falls back to rewrite() without ASSETS", async () => {
    const limiter = new FakeRateLimiter(0);
    setWorkerEnv({ RL_API: limiter });
    assert.equal((await call(context("https://poli0981.dev/api/widgets"))).status, 200);
    const ctx = context("https://poli0981.dev/api/health");
    const response = await call(ctx);
    assert.equal(response.status, 429);
    assert.deepEqual(ctx.rewrites, ["/429/"]);
  });

  it("limits signed-in admins per account, not per address", async () => {
    globalThis.$env.DEV = true;
    const limiter = new FakeRateLimiter(5);
    setWorkerEnv({ RL_ADMIN: limiter });
    await call(context("https://admin.poli0981.dev/api/admin/content"));
    assert.deepEqual([...limiter.counts.keys()], ["admin:user:dev@localhost"]);
  });
});

describe("middleware: public routes", () => {
  it("passes through with the security headers and no admin hardening", async () => {
    const response = await call(context("https://poli0981.dev/about/"));
    assert.equal(await response.text(), "from the route");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cross-origin-resource-policy"), null);
  });
});
