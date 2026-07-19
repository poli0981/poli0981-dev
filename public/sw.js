/**
 * Minimal offline-fallback service worker (docs 09 §3). Not a full-site precache:
 * it caches only the offline shell + favicon, serves /offline/ when a navigation
 * fails, and cache-warms immutable /_astro/* assets on first visit.
 *
 * Bump SHELL when the offline page or this file changes so clients update.
 */
const SHELL = "shell-v1";
const OFFLINE = "/offline/";
const PRECACHE = [OFFLINE, "/favicon.svg"];

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
      caches.open(SHELL).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ||
            fetch(request).then((res) => {
              if (res.ok) cache.put(request, res.clone());
              return res;
            }),
        ),
      ),
    );
  }
});
