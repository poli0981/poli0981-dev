import { MEDIA_VERSION } from "../media";
import { withSecurityHeaders } from "../security-headers";

// GET/HEAD /media/v1/<id>/<format>-<width> — public image variants from R2 (binding
// MEDIA). Variants are immutable: content-addressed ids, and a new pipeline version gets
// a new prefix (MEDIA_VERSION) instead of overwriting. So they are cached for a year at
// the edge (this colo's Cache API) and in browsers, and an image is never re-transformed:
// the transform happened once, at upload, and the result lives in R2.
//
// Only keys matching the exact variant pattern are reachable; the private prefixes
// (metadata-free masters, per-image metadata) can't be requested at all.

const VARIANT_PATH = new RegExp(`^/media/(${MEDIA_VERSION}/[0-9a-f]{16}/(?:avif|webp)-\\d{2,4})$`);
const YEAR = 60 * 60 * 24 * 365;

function notFound(): Response {
  return withSecurityHeaders(
    new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    }),
  );
}

export async function serveMedia(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return withSecurityHeaders(
      new Response(null, { status: 405, headers: { allow: "GET, HEAD" } }),
    );
  }
  const url = new URL(request.url);
  const key = VARIANT_PATH.exec(url.pathname)?.[1];
  if (!key) return notFound();

  // Query strings are ignored: one cache entry per variant.
  const cacheKey = new Request(`${url.origin}${url.pathname}`, { method: "GET" });
  const cache = (caches as unknown as { default: Cache }).default;
  let response = await cache.match(cacheKey);

  if (!response) {
    const object = await env.MEDIA.get(key);
    if (!object) return notFound();
    const headers = new Headers({
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": `public, max-age=${YEAR}, immutable`,
      etag: object.httpEtag,
      "content-length": String(object.size),
      // An image never needs to run anything, even if someone uploads a polyglot.
      "content-security-policy": "default-src 'none'; sandbox",
    });
    response = new Response(object.body, { headers });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }

  const etag = response.headers.get("etag");
  const ifNoneMatch = request.headers.get("if-none-match");
  if (etag && ifNoneMatch && ifNoneMatch.split(",").some((tag) => tag.trim() === etag)) {
    return withSecurityHeaders(
      new Response(null, {
        status: 304,
        headers: { etag, "cache-control": response.headers.get("cache-control") ?? "" },
      }),
    );
  }
  if (request.method === "HEAD") {
    return withSecurityHeaders(new Response(null, { status: 200, headers: response.headers }));
  }
  return withSecurityHeaders(response);
}
