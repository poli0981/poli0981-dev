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

// On-demand so middleware runs (rate-limits /api/* at 5/60s/IP). The island fetches this
// once per page view and the 5-minute cache covers repeat views, so it stays under the limit.
export const prerender = false;

export const GET: APIRoute = async () => {
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
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
  });
};
