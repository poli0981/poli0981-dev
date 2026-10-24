// Cron worker (every 45 min): fetch YouTube / Steam / GitHub, normalize, mirror the pictures,
// and write `widgets:*` keys to the shared KV namespace. The site reads them via /api/widgets
// and serves the pictures from /ext-img. Deployed by hand:
//   npx wrangler deploy --config workers/widgets/wrangler.jsonc
// Bindings: see WidgetsEnv in ./feeds (KV, the YT_CHANNEL_ID var, STEAM_*/DISCORD_WEBHOOK_CI secrets).
import type { WidgetsStatus } from "../../../src/lib/widgets-types";
import {
  fetchGitHub,
  fetchSteam,
  fetchYouTube,
  refresh,
  type Source,
  type WidgetsEnv,
} from "./feeds";

/** One JSON line per event: Workers Logs indexes every field. */
function log(level: "info" | "error", event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, event, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

async function notifyDiscord(env: WidgetsEnv, content: string): Promise<void> {
  if (!env.DISCORD_WEBHOOK_CI) return;
  try {
    await fetch(env.DISCORD_WEBHOOK_CI, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Alerting is best-effort — never let it throw out of the cron.
  }
}

export default {
  async scheduled(_controller, env): Promise<void> {
    const now = new Date().toISOString();
    const status: WidgetsStatus = { yt: "na", steam: "na", gh: "na", lastRun: now };

    // The three sources are independent: refresh them side by side.
    const sources: [Source, string, () => Promise<unknown[]>][] = [
      ["yt", "widgets:yt", () => fetchYouTube(env)],
      ["steam", "widgets:steam", () => fetchSteam(env)],
      ["gh", "widgets:gh", () => fetchGitHub(env)],
    ];
    const results = await Promise.all(
      sources.map(([src, key, fetcher]) => refresh(env.KV, key, src, status, now, fetcher)),
    );
    results.forEach((result, i) => {
      if (!result.ok) {
        const error = result.error instanceof Error ? result.error.message : String(result.error);
        log("error", "widgets.source_failed", { source: sources[i][0], error });
      }
    });

    await env.KV.put("widgets:status", JSON.stringify(status));
    log("info", "widgets.run", { ...status });

    // A run "fails" only when every source failed (network/worker outage, not one flaky API).
    // Alert once, exactly at the 3rd consecutive fully-failed run.
    const anyOk = results.some((result) => result.ok);
    const fails = Number((await env.KV.get("widgets:fails")) ?? "0");
    if (anyOk) {
      if (fails !== 0) await env.KV.put("widgets:fails", "0");
    } else {
      const next = fails + 1;
      await env.KV.put("widgets:fails", String(next));
      if (next === 3) await notifyDiscord(env, "widgets cron: 3 consecutive fully-failed runs");
    }
  },
} satisfies ExportedHandler<WidgetsEnv>;
