import { env } from "cloudflare:workers";
import type {
  Feed,
  GameItem,
  GhItem,
  VideoItem,
  WidgetsPayload,
  WidgetsStatus,
} from "./widgets-types";

// The KV shapes are shared with the cron worker through ./widgets-types.
export type {
  Feed,
  GameItem,
  GhItem,
  VideoItem,
  WidgetsPayload,
  WidgetsStatus,
} from "./widgets-types";

/**
 * Build-time snapshot read. During `astro build` the KV binding is Miniflare-local and
 * empty (and absent under plain `astro dev`), so this is best-effort and normally returns
 * nulls in production — the runtime island fetch of /api/widgets is the real data path.
 */
export async function getWidgetSnapshot(): Promise<WidgetsPayload> {
  const empty: WidgetsPayload = { yt: null, steam: null, gh: null, status: null };
  const kv = env.KV as KVNamespace | undefined;
  if (!kv) return empty;
  const [yt, steam, gh, status] = await Promise.all([
    kv.get<Feed<VideoItem>>("widgets:yt", "json"),
    kv.get<Feed<GameItem>>("widgets:steam", "json"),
    kv.get<Feed<GhItem>>("widgets:gh", "json"),
    kv.get<WidgetsStatus>("widgets:status", "json"),
  ]);
  return { yt, steam, gh, status };
}
