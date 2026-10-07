import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import type {
  Feed,
  VideoItem,
  GameItem,
  GhItem,
  WidgetsStatus,
  WidgetsPayload,
} from "@/lib/widgets";

// On-demand: the widget islands fetch this once per page view. The payload is identical
// for every visitor, so it is not rate-limited (lib/ratelimit) but cached at the edge for
// 5 minutes instead — repeat views in a colo cost one cache read, not four KV reads.
export const prerender = false;

const MAX_AGE = 300;

export const GET: APIRoute = async ({ request, locals }) => {
  // `caches` is typed by the DOM lib here; Workers adds the per-colo `default` cache.
  const cache =
    typeof caches === "undefined" ? undefined : (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(new URL("/api/widgets", request.url), { method: "GET" });
  const hit = await cache?.match(cacheKey);
  // Re-wrap: middleware adds security headers, and cached responses' headers are immutable.
  if (hit) return new Response(hit.body, hit);

  const kv = env.KV as KVNamespace | undefined;
  const payload: WidgetsPayload = { yt: null, steam: null, gh: null, status: null };
  if (kv) {
    const [yt, steam, gh, status] = await Promise.all([
      kv.get<Feed<VideoItem>>("widgets:yt", "json"),
      kv.get<Feed<GameItem>>("widgets:steam", "json"),
      kv.get<Feed<GhItem>>("widgets:gh", "json"),
      kv.get<WidgetsStatus>("widgets:status", "json"),
    ]);
    payload.yt = yt;
    payload.steam = steam;
    payload.gh = gh;
    payload.status = status;
  }
  const res = new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": `public, max-age=${MAX_AGE}` },
  });
  if (cache) locals.cfContext.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
};
