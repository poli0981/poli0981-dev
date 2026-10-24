// Boots the BUILT worker (dist/server/wrangler.json) with `wrangler dev` — local mode, all
// bindings simulated, no Cloudflare credentials — and probes the routes that matter. The
// custom entry (src/worker.ts) fronts every page, so a crash there would take the whole
// static site down; this runs in CI before anything can merge.
//
// Phase 1 runs as configured (gate off), including /media and /ext-img against objects
// seeded into the local R2 bucket and KV namespace. Phase 2 forces the Turnstile gate on
// with Cloudflare's always-pass test secret, so the whole flow — gate page, exemptions,
// /api/gate → pass cookie → real page — is exercised end to end (siteverify is a real
// network call; the test secret accepts any token). Phase 3 lists the client's address in
// the KV denylist and expects 403s everywhere, pages included.
//
// Usage: npm run build && npm run smoke   (works on Linux, macOS and Windows)
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

// wrangler runs through this Node binary and its own CLI file — never looked up on PATH.
// (`spawn("npx")` needed a shell on Windows, and a PATH lookup is a command the environment
// can swap.)
const require = createRequire(import.meta.url);
const wranglerPkgPath = require.resolve("wrangler/package.json");
const WRANGLER = join(dirname(wranglerPkgPath), require(wranglerPkgPath).bin.wrangler);
const CONFIG = ["--config", "dist/server/wrangler.json"];

const TEST_TURNSTILE_SECRET = "1x0000000000000000000000000000000AA";
// The whole run; CI's job timeout is only the outer bound.
const DEADLINE_MS = 10 * 60 * 1000;
const failures = [];

setTimeout(() => {
  console.error(`smoke test timed out after ${DEADLINE_MS / 60000} minutes`);
  process.exit(1);
}, DEADLINE_MS).unref();

function expect(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${detail}`}`);
  if (!ok) failures.push(name);
}

/** Run a wrangler subcommand to completion, showing its output only when it fails. */
function wrangler(args) {
  try {
    execFileSync(process.execPath, [WRANGLER, ...args], { stdio: "pipe", encoding: "utf8" });
  } catch (error) {
    console.error(`wrangler ${args.join(" ")} failed:\n${error.stdout ?? ""}${error.stderr ?? ""}`);
    throw error;
  }
}

/**
 * A `wrangler kv key …` command against the local KV binding. The binding has both an `id`
 * and a `preview_id`, and wrangler makes you pick one; run it against both so the seed is
 * there whichever namespace local dev reads.
 */
function kv(args) {
  for (const preview of ["--preview", "--preview=false"]) {
    wrangler(["kv", "key", ...args, "--binding", "KV", "--local", preview, ...CONFIG]);
  }
}

/** Stop `wrangler dev` and the workerd it started. */
function stop(server) {
  if (server.exitCode !== null) return;
  try {
    if (process.platform === "win32") {
      // /T ends the whole tree (wrangler → workerd). Absolute path: no PATH lookup.
      const taskkill = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe");
      execFileSync(taskkill, ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-server.pid, "SIGTERM"); // the whole process group
    }
  } catch {
    /* already gone */
  }
}

/** A GET whose path is sent byte for byte — fetch() would normalize `%2e%2e` away first. */
function rawStatus(port, path) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.setTimeout(15000, () => req.destroy(new Error(`timeout: ${path}`)));
    req.on("error", reject);
    req.end();
  });
}

async function withWorker(port, vars, run) {
  const args = [WRANGLER, "dev", ...CONFIG, "--port", String(port), "--ip", "127.0.0.1"];
  for (const [key, value] of Object.entries(vars)) args.push("--var", `${key}:${value}`);
  const server = spawn(process.execPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NO_COLOR: "1" },
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  const get = (path, init) =>
    fetch(`${base}${path}`, { redirect: "manual", signal: AbortSignal.timeout(15000), ...init });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      up = await get("/api/health").then(
        () => true,
        () => sleep(1000).then(() => false),
      );
    }
    if (!up) throw new Error(`wrangler dev did not come up on ${base}`);
    await run(get, port);
  } catch (error) {
    failures.push(String(error));
    console.error(error, `\n${log.slice(-4000)}`);
  } finally {
    stop(server);
  }
}

// Seed one image variant into the local (simulated) R2 bucket for the /media checks, and
// one mirrored widget picture into local KV for /ext-img.
const MEDIA_KEY = "v1/0123456789abcdef/webp-800";
const YT_ID = "smokeTest_1";
const tmp = mkdtempSync(join(tmpdir(), "smoke-"));
const seedFile = join(tmp, "variant.webp");
writeFileSync(seedFile, Buffer.from("RIFF\0\0\0\0WEBPVP8 smoke-test-bytes"));
wrangler([
  "r2",
  "object",
  "put",
  `poli0981-media/${MEDIA_KEY}`,
  "--file",
  seedFile,
  "--content-type",
  "image/webp",
  "--local",
  ...CONFIG,
]);
kv(["put", `widgets:img:yt:${YT_ID}`, "--path", seedFile, "--metadata", '{"type":"image/jpeg"}']);

// "Real page" = the site footer is there (the gate page swaps the whole <body>).
const isGate = (html) => html.includes("data-human-check");
const isRealPage = (html) => html.includes("data-site-footer");
let homeTitle = "";

console.log("— phase 1: as configured (gate off)");
await withWorker(8788, {}, async (get, port) => {
  const home = await get("/");
  const html = await home.text();
  homeTitle = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
  expect("/ → 200 real page", home.status === 200 && isRealPage(html), `got ${home.status}`);
  expect("/ has nosniff", home.headers.get("x-content-type-options") === "nosniff");
  expect("/ has HSTS", (home.headers.get("strict-transport-security") ?? "").includes("max-age"));
  expect("/ has XFO DENY", home.headers.get("x-frame-options") === "DENY");
  expect(
    "/ forbids framing via CSP header",
    (home.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'"),
  );

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
  for (const [path, lang] of [
    ["/definitely-not-a-page/", "vi"],
    ["/en/definitely-not-a-page/", "en"],
  ]) {
    const missing = await get(path);
    const body = await missing.text();
    expect(
      `${path} → 404 page in ${lang}`,
      missing.status === 404 && body.includes(`<html lang="${lang}"`),
      `got ${missing.status}`,
    );
  }

  const health = await get("/api/health");
  const healthBody = health.status === 200 ? await health.json() : {};
  expect("/api/health → 200 json", healthBody.ok === true);
  expect("/api/health reports the version", "version" in healthBody);
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
  const mediaCsp = media.headers.get("content-security-policy") ?? "";
  expect(
    "/media variant → 200 image/webp",
    media.status === 200 && media.headers.get("content-type") === "image/webp",
    `got ${media.status} ${media.headers.get("content-type")}`,
  );
  expect(
    "/media is immutable for a year",
    (media.headers.get("cache-control") ?? "").includes("max-age=31536000, immutable"),
  );
  expect("/media is sandboxed", mediaCsp.includes("sandbox"), mediaCsp);
  expect("/media keeps frame-ancestors too", mediaCsp.includes("frame-ancestors"), mediaCsp);
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
    expect(`${path} → 404`, (await rawStatus(port, path)) === 404);
  }
  expect(
    "POST /media → 405",
    (await get(`/media/${MEDIA_KEY}`, { method: "POST" })).status === 405,
  );

  const picture = await get(`/ext-img/yt/${YT_ID}`);
  expect(
    "/ext-img mirrored picture → 200 image/jpeg",
    picture.status === 200 && picture.headers.get("content-type") === "image/jpeg",
    `got ${picture.status} ${picture.headers.get("content-type")}`,
  );
  expect(
    "/ext-img is sandboxed",
    (picture.headers.get("content-security-policy") ?? "").includes("sandbox"),
  );
  expect("/ext-img unknown picture → 404", (await get("/ext-img/yt/notMirrored")).status === 404);
  expect(
    "/ext-img never proxies arbitrary URLs",
    (await rawStatus(port, "/ext-img/https://example.com/x.png")) === 404,
  );
  expect(
    "POST /ext-img → 405",
    (await get(`/ext-img/yt/${YT_ID}`, { method: "POST" })).status === 405,
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

    // A pass whose signature `atob` can't decode used to throw past the gate into the
    // worker's fail-open path and serve the real page.
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    for (const value of [
      `v1.${expiry}.x.A`,
      `v1.${expiry}.x.AAAAA`,
      `v1.${expiry}.x.${"A".repeat(43)}`,
    ]) {
      const forgedPass = await get("/", { headers: { cookie: `__Host-gate=${value}` } });
      const forgedHtml = await forgedPass.text();
      expect(
        `malformed pass ${value.slice(-6)} → still the gate`,
        isGate(forgedHtml) && !isRealPage(forgedHtml),
      );
    }

    const crossSite = await get("/api/gate", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
      body: JSON.stringify({ token: "XXXX.DUMMY.TOKEN.XXXX" }),
    });
    expect("cross-site /api/gate → 403", crossSite.status === 403, `got ${crossSite.status}`);

    const oversized = await get("/api/gate", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ token: "x".repeat(20000) }),
    });
    expect("oversized /api/gate body → 413", oversized.status === 413, `got ${oversized.status}`);

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

console.log("— phase 3: client address on the KV denylist");
// workerd sees the smoke test as 127.0.0.1; list it (and its IPv6 twin) for this phase only.
const LISTED = JSON.stringify([
  { cidr: "127.0.0.1", reason: "smoke test" },
  { cidr: "::1/128", reason: "smoke test" },
]);
kv(["put", "denylist", LISTED]);
try {
  await withWorker(8790, {}, async (get) => {
    const page = await get("/");
    expect("denylisted → 403 on a page", page.status === 403, `got ${page.status}`);
    expect("denylisted 403 is no-store", page.headers.get("cache-control") === "no-store");
    expect(
      "denylisted → 403 on the API",
      (await get("/api/report", { method: "POST" })).status === 403,
    );
    expect("denylisted → 403 on /media", (await get(`/media/${MEDIA_KEY}`)).status === 403);
  });
} finally {
  kv(["delete", "denylist"]);
  rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\nsmoke test failed (${failures.length}): ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nsmoke test ok");
process.exit(0);
