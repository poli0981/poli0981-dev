// Runtime secrets are injected via `wrangler secret put` and are NOT in wrangler.jsonc,
// so `wrangler types` cannot see them. Declared here as an ambient interface merge into
// the generated global `interface Env`. YT_CHANNEL_ID lives in wrangler.jsonc `vars`, so
// it is already on the generated Env — do not duplicate it here.
interface Env {
  STEAM_API_KEY: string;
  STEAM_ID64: string;
  DISCORD_WEBHOOK_CI: string;
}
