// `astro:env/client` for unit tests (public, build-inlined values in the real thing).

export let PUBLIC_TURNSTILE_SITE_KEY: string | undefined = "1x00000000000000000000AA";
export let PUBLIC_CF_BEACON = false;

export function setClientEnv(values: {
  PUBLIC_TURNSTILE_SITE_KEY?: string;
  PUBLIC_CF_BEACON?: boolean;
}): void {
  PUBLIC_TURNSTILE_SITE_KEY = values.PUBLIC_TURNSTILE_SITE_KEY;
  PUBLIC_CF_BEACON = values.PUBLIC_CF_BEACON ?? false;
}
