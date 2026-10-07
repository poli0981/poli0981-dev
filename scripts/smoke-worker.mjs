// Boots the BUILT worker (dist/server/wrangler.json) with `wrangler dev` — local mode, all
// bindings simulated, no Cloudflare credentials — and probes the routes that matter. The
// custom entry (src/worker.ts) fronts every page, so a crash there would take the whole
// static site down; this runs in CI before anything can merge.
//
// Phase 1 runs as configured (gate off), including /media against a seeded local R2
// object. Phase 2 forces the Turnstile gate on with
// Cloudflare's always-pass test secret, so the whole flow — gate page, exemptions,
// /api/gate → pass cookie → real page — is exercised end to end (siteverify is a real
// network call; the test secret accepts any token).
//
// Usage: npm run build && npm run smoke
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const TEST_TURNSTILE_SECRET = "1x0000000000000000000000000000000AA";
const failures = [];

function expect(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${detail}`}`);
  if (!ok) failures.push(name);
}

async function withWorker(port, vars, run) {
  const args = ["wrangler", "dev", "--config", "dist/server/wrangler.json"];
  args.push("--port", String(port), "--ip", "127.0.0.1");
  for (const [key, value] of Object.entries(vars)) args.push("--var", `${key}:${value}`);
  const server = spawn("npx", args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NO_COLOR: "1" },
    detached: true,
  });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  const get = (path, init) => fetch(`${base}${path}`, { redirect: "manual", ...init });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      up = await get("/api/health").then(
        () => true,
        () => sleep(1000).then(() => false),
      );
    }
    if (!up) throw new Error(`wrangler dev did not come up on ${base}`);
    await run(get);
  } catch (error) {
    failures.push(String(error));
    console.error(error, `\n${log.slice(-4000)}`);
  } finally {
    try {
      process.kill(-server.pid, "SIGTERM"); // the whole group: npx → wrangler → workerd
    } catch {
      /* already gone */
    }
  }
}

// Seed one image variant into the local (simulated) R2 bucket for the /media checks.
const MEDIA_KEY = "v1/0123456789abcdef/webp-800";
const seedFile = join(mkdtempSync(join(tmpdir(), "smoke-")), "variant.webp");
writeFileSync(seedFile, Buffer.from("RIFF\0\0\0\0WEBPVP8 smoke-test-bytes"));
execFileSync(
  "npx",
  [
    "wrangler",
    "r2",
    "object",
    "put",
    `poli0981-media/${MEDIA_KEY}`,
    "--file",
    seedFile,
    "--content-type",
    "image/webp",
    "--local",
    "--config",
    "dist/server/wrangler.json",
  ],
  { stdio: "ignore" },
);

const isGate = (html) => html.includes("data-human-check");
const isRealPage = (html) => html.includes('class="site-footer"');
let homeTitle = "";

console.log("— phase 1: as configured (gate off)");
await withWorker(8788, {}, async (get) => {
  const home = await get("/");
  const html = await home.text();
  homeTitle = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
  expect("/ → 200 real page", home.status === 200 && isRealPage(html), `got ${home.status}`);
  expect("/ has nosniff", home.headers.get("x-content-type-options") === "nosniff");
  expect("/ has HSTS", (home.headers.get("strict-transport-security") ?? "").includes("max-age"));
  expect("/ has XFO DENY", home.headers.get("x-frame-options") === "DENY");

  const etag = home.headers.get("etag");
  const revalidated = etag ? await get("/", { headers: { "if-none-match": etag } }) : null;
  expect(
    "/ revalidates to 304",
    revalidated?.status === 304,
    `etag=${etag} got ${revalidated?.status}`,
  );
  expect("HEAD / → 200", (await get("/", { method: "HEAD" })).status === 200);

  expect("/blog → 307 to /blog/", (await get("/blog")).status === 307);
  expect("/blog/ → 200", (await get("/blog/")).status === 200);
  expect("/en/ → 200", (await get("/en/")).status === 200);
  expect("unknown page → 404", (await get("/definitely-not-a-page/")).status === 404);

  const health = await get("/api/health");
  expect("/api/health → 200 json", health.status === 200 && (await health.json()).ok === true);
  expect("/sw.js → 200", (await get("/sw.js")).status === 200);
  const asset = /\/_astro\/[^"']+\.css/.exec(html)?.[0];
  expect(
    "hashed CSS asset → 200",
    asset ? (await get(asset)).status === 200 : false,
    `asset=${asset}`,
  );
  expect("/rss.xml → 200", (await get("/rss.xml")).status === 200);
  expect(
    "/.well-known/security.txt → 200",
    (await get("/.well-known/security.txt")).status === 200,
  );
  expect("/pagefind/ open while gate off", (await get("/pagefind/pagefind.js")).status === 200);

  const media = await get(`/media/${MEDIA_KEY}`);
  const mediaEtag = media.headers.get("etag");
  expect(
    "/media variant → 200 image/webp",
    media.status === 200 && media.headers.get("content-type") === "image/webp",
    `got ${media.status} ${media.headers.get("content-type")}`,
  );
  expect(
    "/media is immutable for a year",
    (media.headers.get("cache-control") ?? "").includes("max-age=31536000, immutable"),
  );
  expect(
    "/media is sandboxed",
    (media.headers.get("content-security-policy") ?? "").includes("sandbox"),
  );
  expect("/media is nosniff", media.headers.get("x-content-type-options") === "nosniff");
  const mediaAgain = mediaEtag
    ? await get(`/media/${MEDIA_KEY}`, { headers: { "if-none-match": mediaEtag } })
    : null;
  expect("/media revalidates to 304", mediaAgain?.status === 304, `got ${mediaAgain?.status}`);
  expect(
    "HEAD /media → 200",
    (await get(`/media/${MEDIA_KEY}`, { method: "HEAD" })).status === 200,
  );
  expect(
    "missing variant → 404",
    (await get("/media/v1/0123456789abcdef/webp-801")).status === 404,
  );
  for (const path of [
    "/media/private/master/0123456789abcdef",
    "/media/v1/%2e%2e/private/master/0123456789abcdef",
    "/media/v2/0123456789abcdef/webp-800",
  ]) {
    expect(`${path} → 404`, (await get(path)).status === 404);
  }
  expect(
    "POST /media → 405",
    (await get(`/media/${MEDIA_KEY}`, { method: "POST" })).status === 405,
  );

  // The admin needs a Cloudflare Access JWT on every request; a build never bypasses it.
  expect("/admin/ without Access → 403", (await get("/admin/")).status === 403);
  expect(
    "/api/admin/content without Access → 403",
    (await get("/api/admin/content")).status === 403,
  );
  const forged = await get("/api/admin/content", {
    headers: { "cf-access-jwt-assertion": "eyJhbGciOiJSUzI1NiJ9.eyJlbWFpbCI6ImFAYi5jIn0.c2ln" },
  });
  expect("/api/admin with a forged JWT → 403", forged.status === 403);
});

console.log("— phase 2: Turnstile gate forced on (test secret)");
await withWorker(
  8789,
  { GATE_MODE: "force", GATE_SECRET: "smoke-test-secret", TURNSTILE_SECRET: TEST_TURNSTILE_SECRET },
  async (get) => {
    const gated = await get("/");
    const html = await gated.text();
    expect("/ without pass → 200 gate", gated.status === 200 && isGate(html) && !isRealPage(html));
    expect(
      "gate keeps the page <title>",
      homeTitle !== "" && html.includes(`<title>${homeTitle}</title>`),
    );
    expect("gate drops JSON-LD", !html.includes("application/ld+json"));
    expect("gate is no-store", (gated.headers.get("cache-control") ?? "").includes("no-store"));
    expect("gate is noindex", gated.headers.get("x-robots-tag") === "noindex");
    expect("gate has no ETag", !gated.headers.has("etag"));

    const bot = await get("/", { headers: { "x-verified-bot": "true" } });
    expect("verified bot → real page", isRealPage(await bot.text()));
    expect("legal page is exempt", isRealPage(await (await get("/legal/privacy/")).text()));
    expect("/rss.xml still 200", (await get("/rss.xml")).status === 200);
    expect("unknown page still 404", (await get("/definitely-not-a-page/")).status === 404);
    expect("HEAD / not gated", (await get("/", { method: "HEAD" })).status === 200);
    expect("/pagefind/ without pass → 403", (await get("/pagefind/pagefind.js")).status === 403);
    expect("/media not gated", (await get(`/media/${MEDIA_KEY}`)).status === 200);

    const crossSite = await get("/api/gate", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
      body: JSON.stringify({ token: "XXXX.DUMMY.TOKEN.XXXX" }),
    });
    expect("cross-site /api/gate → 403", crossSite.status === 403, `got ${crossSite.status}`);

    const verified = await get("/api/gate", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ token: "XXXX.DUMMY.TOKEN.XXXX" }),
    });
    const setCookie = verified.headers.get("set-cookie") ?? "";
    expect(
      "/api/gate → 204 + pass cookie",
      verified.status === 204 && setCookie.startsWith("__Host-gate="),
      `got ${verified.status}`,
    );

    const pass = setCookie.split(";")[0];
    const withPass = await get("/", { headers: { cookie: pass } });
    expect("with pass → real page", isRealPage(await withPass.text()));
    expect(
      "with pass → pagefind 200",
      (await get("/pagefind/pagefind.js", { headers: { cookie: pass } })).status === 200,
    );

    const tampered = `${pass.slice(0, -2)}xx`;
    expect(
      "tampered pass → gate",
      isGate(await (await get("/", { headers: { cookie: tampered } })).text()),
    );
  },
);

if (failures.length) {
  console.error(`\nsmoke test failed (${failures.length}): ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nsmoke test ok");
