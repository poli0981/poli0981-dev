// Cron worker (every 45 min): fetch YouTube / Steam / GitHub, normalize, and write
// `widgets:*` keys to the shared KV namespace. The site reads these via /api/widgets.
// Deployed manually (see plan). Env = KV + YT_CHANNEL_ID (vars) + STEAM_*/DISCORD (secrets).

type SourceStatus = "ok" | "stale" | "na";
type Source = "yt" | "steam" | "gh";

interface VideoItem {
  id: string;
  title: string;
  thumb: string;
  published: string;
}
interface GameItem {
  appid: number;
  name: string;
  playtime2w: number; // minutes (Steam-native unit; the UI converts to hours)
  icon: string;
}
interface GhItem {
  type: string;
  repo: string;
  ts: string;
  detail: string;
}
interface Feed<T> {
  updated: string;
  items: T[];
}
interface WidgetsStatus {
  yt: SourceStatus;
  steam: SourceStatus;
  gh: SourceStatus;
  lastRun: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const UA = "poli0981-widgets (+https://poli0981.dev)";

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&"); // amp last so entities above aren't double-decoded
}

function parseYouTube(xml: string): VideoItem[] {
  const items: VideoItem[] = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  for (let m = entryRe.exec(xml); m !== null && items.length < 3; m = entryRe.exec(xml)) {
    const block = m[1];
    const id = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(block)?.[1];
    const titleRaw = /<title>([\s\S]*?)<\/title>/.exec(block)?.[1];
    const published = /<published>([^<]+)<\/published>/.exec(block)?.[1];
    if (id === undefined || titleRaw === undefined || published === undefined) continue;
    items.push({
      id,
      title: decodeXml(titleRaw).trim(),
      thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      published,
    });
  }
  return items;
}

async function fetchYouTube(env: Env): Promise<VideoItem[]> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${env.YT_CHANNEL_ID}`;
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`youtube ${res.status}`);
  return parseYouTube(await res.text());
}

interface SteamGame {
  appid: number;
  name?: string;
  playtime_2weeks?: number;
  img_icon_url?: string;
}
interface SteamResp {
  response?: { total_count?: number; games?: SteamGame[] };
}

async function fetchSteam(env: Env): Promise<GameItem[]> {
  const url =
    `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/` +
    `?key=${env.STEAM_API_KEY}&steamid=${env.STEAM_ID64}&count=3`;
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`steam ${res.status}`);
  const data = (await res.json()) as SteamResp;
  const games = data.response?.games ?? [];
  return games.map((g) => ({
    appid: g.appid,
    name: g.name ?? "N/A",
    playtime2w: g.playtime_2weeks ?? 0,
    icon:
      g.img_icon_url !== undefined && g.img_icon_url !== ""
        ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
        : "",
  }));
}

interface GhEvent {
  type?: string;
  repo?: { name?: string };
  created_at?: string;
  payload?: { commits?: unknown[]; release?: { tag_name?: string } };
}

async function fetchGitHub(): Promise<GhItem[]> {
  const res = await fetch("https://api.github.com/users/poli0981/events/public?per_page=10", {
    headers: { "user-agent": UA, accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`github ${res.status}`);
  const events = (await res.json()) as GhEvent[];
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

// Refresh one source: on success overwrite KV (no TTL) and mark `ok`; on failure keep the
// old value and mark `stale` (or `na` if the kept value is >24h old or missing).
async function refresh<T>(
  env: Env,
  key: string,
  src: Source,
  status: WidgetsStatus,
  now: string,
  fetcher: () => Promise<T[]>,
): Promise<boolean> {
  const prev = await env.KV.get<Feed<T>>(key, "json");
  try {
    const feed: Feed<T> = { updated: now, items: await fetcher() };
    await env.KV.put(key, JSON.stringify(feed));
    status[src] = "ok";
    return true;
  } catch {
    if (prev !== null) {
      const ageMs = Date.now() - Date.parse(prev.updated);
      status[src] = ageMs <= DAY_MS ? "stale" : "na";
    } else {
      status[src] = "na";
    }
    return false;
  }
}

async function notifyDiscord(env: Env, content: string): Promise<void> {
  try {
    await fetch(env.DISCORD_WEBHOOK_CI, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch {
    // Alerting is best-effort — never let it throw out of the cron.
  }
}

export default {
  async scheduled(_controller, env): Promise<void> {
    const now = new Date().toISOString();
    const status: WidgetsStatus = { yt: "na", steam: "na", gh: "na", lastRun: now };

    const ytOk = await refresh(env, "widgets:yt", "yt", status, now, () => fetchYouTube(env));
    const steamOk = await refresh(env, "widgets:steam", "steam", status, now, () =>
      fetchSteam(env),
    );
    const ghOk = await refresh(env, "widgets:gh", "gh", status, now, fetchGitHub);

    await env.KV.put("widgets:status", JSON.stringify(status));

    // A run "fails" only when every source failed (network/worker outage, not one flaky API).
    // Alert once, exactly at the 3rd consecutive fully-failed run.
    const anyOk = ytOk || steamOk || ghOk;
    const fails = Number((await env.KV.get("widgets:fails")) ?? "0");
    if (anyOk) {
      if (fails !== 0) await env.KV.put("widgets:fails", "0");
    } else {
      const next = fails + 1;
      await env.KV.put("widgets:fails", String(next));
      if (next === 3) await notifyDiscord(env, "widgets cron: 3 consecutive fully-failed runs");
    }
  },
} satisfies ExportedHandler<Env>;
