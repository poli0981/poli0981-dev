/**
 * Minimal offline-fallback service worker (docs 09 §3). Not a full-site precache:
 * it caches only the offline shell + favicon, serves /offline/ when a navigation
 * fails, and cache-warms immutable /_astro/* assets on first visit.
 *
 * Bump SHELL when the offline page or this file changes so clients update.
 */
const SHELL = "shell-v3";
const OFFLINE = "/offline/";
// skullhop.js is precached by name rather than warmed like /_astro/*: it only loads on
// the offline page, which nobody visits while online, so warm-on-fetch would never fire
// and the game would 404 in the one situation it exists for.
const PRECACHE = [OFFLINE, "/favicon.svg", "/skullhop.js"];
// Hashed assets from older deploys are never requested again; cap the warm cache so it
// can't grow by a deploy's worth of files forever. Oldest entries go first.
const MAX_WARM_ASSETS = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Drop the oldest warmed /_astro/* entries beyond MAX_WARM_ASSETS (keys keep insert order). */
async function trimWarmAssets(cache) {
  const assets = (await cache.keys()).filter((request) =>
    new URL(request.url).pathname.startsWith("/_astro/"),
  );
  const excess = assets.length - MAX_WARM_ASSETS;
  if (excess > 0)
    await Promise.all(assets.slice(0, excess).map((request) => cache.delete(request)));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page navigations: network-first, fall back to the cached offline shell.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }

  // Immutable, content-hashed assets: cache-first, warmed on first visit (so we
  // never need to know the hashed filenames at build time).
  if (url.pathname.startsWith("/_astro/")) {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) {
          // Keep the worker alive until the copy is stored (and the cache trimmed).
          event.waitUntil(cache.put(request, res.clone()).then(() => trimWarmAssets(cache)));
        }
        return res;
      }),
    );
  }
});
