// Which requests the Turnstile gate applies to. Pure functions, unit-tested with
// `node --test` (see scripts/test-gate.mjs) — no Workers APIs here.

export type GateMode = "off" | "on" | "force";

export interface GateSettings {
  mode: GateMode;
  secret: string;
}

/**
 * The gate's settings, or null when it is inactive: GATE_MODE must be "on"/"force" and
 * both GATE_SECRET (signs passes) and TURNSTILE_SECRET (verifies challenges) must exist.
 * CI, Lighthouse and branch previews have no secrets, so they are never gated.
 */
export function gateSettings(env: {
  GATE_MODE?: string;
  GATE_SECRET?: string;
  TURNSTILE_SECRET?: string;
}): GateSettings | null {
  const mode = env.GATE_MODE;
  if ((mode !== "on" && mode !== "force") || !env.GATE_SECRET || !env.TURNSTILE_SECRET) {
    return null;
  }
  return { mode, secret: env.GATE_SECRET };
}

/** Never gated: the app's own endpoints, the media CDN and the legal pages (so the
 * privacy policy can be read before passing). Static files the gate must not block are
 * excluded earlier, in wrangler.jsonc `run_worker_first`. */
const EXEMPT_PREFIXES = ["/api/", "/admin", "/media/", "/legal/", "/en/legal/"];

/** Header set by a zone Transform Rule on EVERY request: to_string(cf.client.bot). */
export const VERIFIED_BOT_HEADER = "x-verified-bot";

export type GateDecision = "pass" | "check";

export function gateDecision(
  method: string,
  url: URL,
  headers: Headers,
  mode: GateMode,
): GateDecision | "unconfigured" {
  if (method !== "GET") return "pass";
  if (url.hostname.startsWith("admin.")) return "pass";
  if (EXEMPT_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return "pass";

  const verifiedBot = headers.get(VERIFIED_BOT_HEADER);
  if (verifiedBot === "true") return "pass";
  // The Transform Rule overwrites this header on every request, so a missing header means
  // the rule isn't deployed — and gating then would lock search engines out. Fail open
  // (the caller logs it) unless forced, e.g. for local testing.
  if (verifiedBot === null && mode !== "force") return "unconfigured";
  return "check";
}
