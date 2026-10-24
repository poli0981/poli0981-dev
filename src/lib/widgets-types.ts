// The KV JSON contract between the widgets cron worker (writer, workers/widgets) and the
// site (reader, /api/widgets). Types only, imported by both TypeScript projects — one
// definition, so the two sides can't drift apart.

export type SourceStatus = "ok" | "stale" | "na";

export interface VideoItem {
  id: string;
  title: string;
  /** A same-origin /ext-img path (older feeds: the i.ytimg.com URL; "" when unavailable). */
  thumb: string;
  published: string;
}

export interface GameItem {
  appid: number;
  name: string;
  playtime2w: number; // minutes (Steam-native unit; the UI converts to hours)
  /** A same-origin /ext-img path (older feeds: the Steam CDN URL; "" when there is none). */
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
