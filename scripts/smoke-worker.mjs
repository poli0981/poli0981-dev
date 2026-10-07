// Boots the BUILT worker (dist/server/wrangler.json) with `wrangler dev` — local mode, all
// bindings simulated, no Cloudflare credentials — and probes the routes that matter. The
// custom entry (src/worker.ts) fronts every page, so a crash there would take the whole
// static site down; this runs in CI before anything can merge.
//
// Usage: npm run build && node scripts/smoke-worker.mjs
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.SMOKE_PORT ?? 8788);
const BASE = `http://127.0.0.1:${PORT}`;

const server = spawn(
  "npx",
  [
    "wrangler",
    "dev",
    "--config",
    "dist/server/wrangler.json",
    "--port",
    String(PORT),
    "--ip",
    "127.0.0.1",
  ],
  { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NO_COLOR: "1" }, detached: true },
);
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));

const stop = () => {
  try {
    process.kill(-server.pid, "SIGTERM"); // the whole group: npx → wrangler → workerd
  } catch {
    /* already gone */
  }
};

async function ready() {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`${BASE}/api/health`);
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error(`wrangler dev did not come up on ${BASE}\n${log}`);
}

const failures = [];
function expect(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${detail}`}`);
  if (!ok) failures.push(name);
}

try {
  await ready();
  const get = (path, init) => fetch(`${BASE}${path}`, { redirect: "manual", ...init });

  const home = await get("/");
  const html = await home.text();
  expect("/ → 200 html", home.status === 200 && html.includes("<html"), `got ${home.status}`);
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

  const head = await get("/", { method: "HEAD" });
  expect("HEAD / → 200", head.status === 200, `got ${head.status}`);

  const noSlash = await get("/blog");
  expect("/blog → 307 to /blog/", noSlash.status === 307, `got ${noSlash.status}`);
  expect("/blog/ → 200", (await get("/blog/")).status === 200);
  expect("/en/ → 200", (await get("/en/")).status === 200);

  const missing = await get("/definitely-not-a-page/");
  expect("unknown page → 404", missing.status === 404, `got ${missing.status}`);

  const health = await get("/api/health");
  expect("/api/health → 200 json", health.status === 200 && (await health.json()).ok === true);

  const sw = await get("/sw.js");
  expect("/sw.js → 200", sw.status === 200, `got ${sw.status}`);

  const asset = /\/_astro\/[^"']+\.css/.exec(html)?.[0];
  const css = asset ? await get(asset) : null;
  expect("hashed CSS asset → 200", css?.status === 200, `asset=${asset} got ${css?.status}`);

  expect("/rss.xml → 200", (await get("/rss.xml")).status === 200);
  expect(
    "/.well-known/security.txt → 200",
    (await get("/.well-known/security.txt")).status === 200,
  );
} catch (error) {
  failures.push(String(error));
  console.error(error);
} finally {
  stop();
}

if (failures.length) {
  console.error(`\nsmoke test failed (${failures.length}):\n${log.slice(-4000)}`);
  process.exit(1);
}
console.log("\nsmoke test ok");
