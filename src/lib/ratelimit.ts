import { env } from "cloudflare:workers";

// Workers Rate Limiting bindings (wrangler.jsonc `ratelimits`), one per /api group so a
// noisy endpoint can't spend another's budget. Anything without its own binding shares
// RL_API. /api/widgets is never limited: its response is identical for every visitor
// and edge-cached (api/widgets.ts), and the home page fetches it on every view.

export const RATE_LIMIT_WINDOW_SECONDS = 60;

type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> };

const BINDING_FOR_GROUP: Record<string, string> = {
  report: "RL_REPORT",
  gate: "RL_GATE",
  admin: "RL_ADMIN",
};

const UNLIMITED_GROUPS = new Set(["widgets"]);

/** "/api/report" → "report"; "/api/" → "api". */
export function apiGroup(pathname: string): string {
  return pathname.split("/")[2] || "api";
}

/**
 * The rate-limit subject for a client address. IPv4 is used as-is; IPv6 is collapsed to
 * its /64 — a single host usually controls a whole /64 and could otherwise rotate
 * through it to dodge the limit. IPv4-mapped IPv6 (::ffff:1.2.3.4) counts as IPv4.
 */
export function clientSubject(ip: string): string {
  if (!ip.includes(":")) return ip;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1];
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = ip.includes("::")
    ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right]
    : left;
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

/** True when the request may proceed. Missing binding (astro dev, prerender) → allow. */
export async function allowRequest(group: string, subject: string): Promise<boolean> {
  if (UNLIMITED_GROUPS.has(group)) return true;
  const name = BINDING_FOR_GROUP[group] ?? "RL_API";
  const limiter = (env as unknown as Record<string, RateLimiter | undefined>)[name];
  if (!limiter) return true;
  const { success } = await limiter.limit({ key: `${group}:${subject}` });
  return success;
}
