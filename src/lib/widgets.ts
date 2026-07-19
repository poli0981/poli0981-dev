import { env } from "cloudflare:workers";

// Shared widget types. The cron worker (workers/widgets/src/index.ts) writes KV values in
// exactly these shapes; it keeps its own copy of these interfaces because it is a separate
// TS project — the KV JSON shape is the real cross-boundary contract, keep the two in sync.

type SourceStatus = "ok" | "stale" | "na";

export interface VideoItem {
  id: string;
  title: string;
  thumb: string;
  published: string;
}
export interface GameItem {
  appid: number;
  name: string;
  playtime2w: number; // minutes
  icon: string;
}
export interface GhItem {
  type: string;
  repo: string;
  ts: string;
  detail: string;
}
export interface Feed<T> {
  updated: string;
  items: T[];
}
export interface WidgetsStatus {
  yt: SourceStatus;
  steam: SourceStatus;
  gh: SourceStatus;
  lastRun: string;
}
export interface WidgetsPayload {
  yt: Feed<VideoItem> | null;
  steam: Feed<GameItem> | null;
  gh: Feed<GhItem> | null;
  status: WidgetsStatus | null;
}

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
