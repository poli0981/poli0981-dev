// The widgets cron's data sources: fetch, normalize, and mirror the pictures into KV so the
// site can serve them from its own origin (/ext-img — see src/lib/ext-img.ts). Kept apart
// from index.ts so the logic is unit-testable without the scheduled() entry point.
import { EXT_IMG_KV_PREFIX } from "../../../src/lib/ext-img";
import type {
  Feed,
  GameItem,
  GhItem,
  SourceStatus,
  VideoItem,
  WidgetsStatus,
} from "../../../src/lib/widgets-types";

export type Source = "yt" | "steam" | "gh";

/**
 * This worker's bindings. Spelled out rather than the generated global `Env`: the unit tests
 * import these modules from the site's TypeScript project, whose `Env` is the site's.
 */
export interface WidgetsEnv {
  KV: KVNamespace;
  /** wrangler.jsonc var. */
  YT_CHANNEL_ID: string;
  /** Secrets (`wrangler secret put`). */
  STEAM_API_KEY: string;
  STEAM_ID64: string;
  DISCORD_WEBHOOK_CI?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const UA = "poli0981-widgets (+https://poli0981.dev)";
/** A slow upstream must not stall the whole run. */
const TIMEOUT_MS = 10_000;
/** Mirrored pictures outlive several missed runs, then expire on their own. */
const IMAGE_TTL_SECONDS = 14 * 24 * 60 * 60;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const get = (url: string, accept?: string) =>
  fetch(url, {
    headers: { "user-agent": UA, ...(accept ? { accept } : {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

export function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&"); // amp last so entities above aren't double-decoded
}

/** The newest three videos of a channel's Atom feed (thumb filled in by mirroring). */
export function parseYouTube(xml: string): VideoItem[] {
  const items: VideoItem[] = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  for (let m = entryRe.exec(xml); m !== null && items.length < 3; m = entryRe.exec(xml)) {
    const block = m[1];
    const id = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(block)?.[1];
    const titleRaw = /<title>([\s\S]*?)<\/title>/.exec(block)?.[1];
    const published = /<published>([^<]+)<\/published>/.exec(block)?.[1];
    if (id === undefined || titleRaw === undefined || published === undefined) continue;
    items.push({ id, title: decodeXml(titleRaw).trim(), thumb: "", published });
  }
  return items;
}

interface SteamGame {
  appid: number;
  name?: string;
  playtime_2weeks?: number;
  img_icon_url?: string;
}
export interface SteamResp {
  response?: { total_count?: number; games?: SteamGame[] };
}

/** Recently played games (icon filled in by mirroring). */
export function normalizeSteam(data: SteamResp): (GameItem & { iconHash: string | null })[] {
  return (data.response?.games ?? []).map((g) => ({
    appid: g.appid,
    name: g.name ?? "N/A",
    playtime2w: g.playtime_2weeks ?? 0,
    icon: "",
    iconHash: g.img_icon_url && /^[0-9a-f]{40}$/.test(g.img_icon_url) ? g.img_icon_url : null,
  }));
}

export interface GhEvent {
  type?: string;
  repo?: { name?: string };
  created_at?: string;
  payload?: { commits?: unknown[]; release?: { tag_name?: string } };
}

/** The three newest pushes/releases from a public event list. */
export function normalizeGitHub(events: GhEvent[]): GhItem[] {
  const items: GhItem[] = [];
  for (const e of events) {
    if (items.length >= 3) break;
    if (e.type !== "PushEvent" && e.type !== "ReleaseEvent") continue;
    const detail =
      e.type === "PushEvent"
        ? `${e.payload?.commits?.length ?? 0} commits`
        : (e.payload?.release?.tag_name ?? "release");
    items.push({ type: e.type, repo: e.repo?.name ?? "N/A", ts: e.created_at ?? "", detail });
  }
  return items;
}

/**
 * Copy one picture into KV under `widgets:img:<key>`; true when it is there afterwards.
 * Failures are quiet (the widget just shows no picture) — the feed itself still updates.
 */
export async function mirrorImage(kv: KVNamespace, key: string, url: string): Promise<boolean> {
  try {
    const res = await get(url);
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!res.ok || !IMAGE_TYPES.has(type)) return false;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return false;
    await kv.put(`${EXT_IMG_KV_PREFIX}${key}`, bytes, {
      expirationTtl: IMAGE_TTL_SECONDS,
      metadata: { type },
    });
    return true;
  } catch {
    return false;
  }
}

export async function fetchYouTube(env: WidgetsEnv): Promise<VideoItem[]> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(env.YT_CHANNEL_ID)}`;
  const res = await get(url);
  if (!res.ok) throw new Error(`youtube ${res.status}`);
  const items = parseYouTube(await res.text());
  return Promise.all(
    items.map(async (item) => {
      const thumb = `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;
      const ok = /^[\w-]{11}$/.test(item.id) && (await mirrorImage(env.KV, `yt:${item.id}`, thumb));
      return { ...item, thumb: ok ? `/ext-img/yt/${item.id}` : "" };
    }),
  );
}

export async function fetchSteam(env: WidgetsEnv): Promise<GameItem[]> {
  const url =
    `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/` +
    `?key=${encodeURIComponent(env.STEAM_API_KEY)}&steamid=${encodeURIComponent(env.STEAM_ID64)}&count=3`;
  const res = await get(url);
  if (!res.ok) throw new Error(`steam ${res.status}`);
  const games = normalizeSteam((await res.json()) as SteamResp);
  return Promise.all(
    games.map(async ({ iconHash, ...game }) => {
      if (!iconHash) return game;
      const source = `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${iconHash}.jpg`;
      const ok = await mirrorImage(env.KV, `steam:${game.appid}:${iconHash}`, source);
      return { ...game, icon: ok ? `/ext-img/steam/${game.appid}/${iconHash}` : "" };
    }),
  );
}

export async function fetchGitHub(): Promise<GhItem[]> {
  const res = await get(
    "https://api.github.com/users/poli0981/events/public?per_page=10",
    "application/vnd.github+json",
  );
  if (!res.ok) throw new Error(`github ${res.status}`);
  return normalizeGitHub((await res.json()) as GhEvent[]);
}

/** Status of a source whose refresh failed, from the age of the feed it kept. */
export function staleStatus(previous: Feed<unknown> | null, now: number): SourceStatus {
  if (previous === null) return "na";
  return now - Date.parse(previous.updated) <= DAY_MS ? "stale" : "na";
}

/**
 * Refresh one source: on success overwrite KV (no TTL) and mark `ok`; on failure keep the
 * old value and mark `stale` (or `na` if the kept value is >24h old or missing).
 */
export async function refresh<T>(
  kv: KVNamespace,
  key: string,
  src: Source,
  status: WidgetsStatus,
  now: string,
  fetcher: () => Promise<T[]>,
): Promise<{ ok: boolean; error?: unknown }> {
  const prev = await kv.get<Feed<T>>(key, "json");
  try {
    const feed: Feed<T> = { updated: now, items: await fetcher() };
    await kv.put(key, JSON.stringify(feed));
    status[src] = "ok";
    return { ok: true };
  } catch (error) {
    status[src] = staleStatus(prev, Date.parse(now));
    return { ok: false, error };
  }
}
