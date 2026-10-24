// `astro:env/server` for unit tests. Every secret starts unset; a test sets what it needs
// with setServerEnv(), and modules that imported the names see the change (ES live bindings).

export let TURNSTILE_SECRET: string | undefined;
export let GITHUB_ISSUES_TOKEN: string | undefined;
export let DISCORD_WEBHOOK_BUG: string | undefined;
export let GITHUB_CONTENT_TOKEN: string | undefined;
export let GITHUB_PUBLISH_TOKEN: string | undefined;
export let ADMIN_EMAILS: string | undefined;
export let GATE_SECRET: string | undefined;

export interface ServerEnv {
  TURNSTILE_SECRET?: string;
  GITHUB_ISSUES_TOKEN?: string;
  DISCORD_WEBHOOK_BUG?: string;
  GITHUB_CONTENT_TOKEN?: string;
  GITHUB_PUBLISH_TOKEN?: string;
  ADMIN_EMAILS?: string;
  GATE_SECRET?: string;
}

/** Replace the whole server env: names not given become unset. */
export function setServerEnv(values: ServerEnv = {}): void {
  TURNSTILE_SECRET = values.TURNSTILE_SECRET;
  GITHUB_ISSUES_TOKEN = values.GITHUB_ISSUES_TOKEN;
  DISCORD_WEBHOOK_BUG = values.DISCORD_WEBHOOK_BUG;
  GITHUB_CONTENT_TOKEN = values.GITHUB_CONTENT_TOKEN;
  GITHUB_PUBLISH_TOKEN = values.GITHUB_PUBLISH_TOKEN;
  ADMIN_EMAILS = values.ADMIN_EMAILS;
  GATE_SECRET = values.GATE_SECRET;
}
