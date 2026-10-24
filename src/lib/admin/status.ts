import { env } from "cloudflare:workers";
import {
  ADMIN_EMAILS,
  DISCORD_WEBHOOK_BUG,
  GATE_SECRET,
  GITHUB_CONTENT_TOKEN,
  GITHUB_ISSUES_TOKEN,
  GITHUB_PUBLISH_TOKEN,
  TURNSTILE_SECRET,
} from "astro:env/server";
import { gateSettings } from "../gate/policy";
import { versionInfo, type VersionInfo } from "../version";

// What the admin's dashboard and security page may show about the deployment: which
// secrets exist (never their values), whether the gate is live, the running version.

export interface ConfigStatus {
  version: VersionInfo;
  gate: { mode: string; active: boolean };
  /** Secret name → set or not. */
  secrets: Record<string, boolean>;
  /** Publishing dispatches with the content token (no GITHUB_PUBLISH_TOKEN). */
  singleToken: boolean;
}

export function configStatus(): ConfigStatus {
  const vars = env as unknown as { GATE_MODE?: string };
  const mode = vars.GATE_MODE ?? "off";
  return {
    version: versionInfo(env as unknown as Parameters<typeof versionInfo>[0]),
    gate: {
      mode,
      active: gateSettings({ GATE_MODE: mode, GATE_SECRET, TURNSTILE_SECRET }) !== null,
    },
    secrets: {
      GITHUB_CONTENT_TOKEN: Boolean(GITHUB_CONTENT_TOKEN),
      GITHUB_PUBLISH_TOKEN: Boolean(GITHUB_PUBLISH_TOKEN),
      GITHUB_ISSUES_TOKEN: Boolean(GITHUB_ISSUES_TOKEN),
      DISCORD_WEBHOOK_BUG: Boolean(DISCORD_WEBHOOK_BUG),
      TURNSTILE_SECRET: Boolean(TURNSTILE_SECRET),
      GATE_SECRET: Boolean(GATE_SECRET),
      ADMIN_EMAILS: Boolean(ADMIN_EMAILS),
    },
    singleToken: Boolean(GITHUB_CONTENT_TOKEN) && !GITHUB_PUBLISH_TOKEN,
  };
}
