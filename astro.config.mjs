// @ts-check
import { defineConfig, envField, fontProviders } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import svelte from "@astrojs/svelte";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// Error/system pages that must never appear in the sitemap.
const NON_INDEXED = /\/(404|500|403|429|offline)\/?$/;

// The theme must be applied before first paint or the default flashes, so this has to
// be inline and synchronous — which rules out a processed <script> (Astro turns those
// into deferred external modules). `is:inline` would work but Astro never hashes it
// (see core/csp/common.js: trackScriptHashes only covers bundled scripts, client
// directives, island prebuilts, and settings.scripts), leaving it to survive only
// because a <meta> CSP does not govern markup that precedes it — fragile by accident.
// `injectScript("head-inline")` is the one path that is BOTH rendered verbatim inline
// AND hashed from that same string, so the CSP can never drift from the source.
const THEME_BOOTSTRAP = `(()=>{try{const t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch{}})();`;

/** @type {import('astro').AstroIntegration} */
const themeBootstrap = {
  name: "theme-bootstrap",
  hooks: {
    "astro:config:setup": ({ injectScript }) => injectScript("head-inline", THEME_BOOTSTRAP),
  },
};

// https://astro.build/config
export default defineConfig({
  site: "https://poli0981.dev",
  // Default output is "static": every page prerenders unless it opts out with
  // `export const prerender = false` (only api routes + middleware run on-demand).
  output: "static",

  // Astro's prefetch is off by default, but <ClientRouter /> force-enables it with
  // `prefetchAll: true` + a hover strategy. Cloudflare's zone-level Speculation Rules
  // then answers every `Sec-Purpose: prefetch` request to a Worker origin with a 503
  // (`Cf-Speculation-Refused`), so hovering any link logged a failed request. Pin this
  // off so re-adding the router can never silently switch hover-prefetch back on.
  prefetch: false,

  // The @cloudflare/vite-plugin (used by this adapter) runs `astro dev` on workerd and
  // auto-exposes the wrangler.jsonc bindings (KV/ASSETS) + .dev.vars — no platformProxy needed.
  adapter: cloudflare({
    imageService: "compile", // sharp runs at build time (Workers has no runtime sharp)
  }),

  // vi is the default locale and carries NO url prefix; en lives under /en/.
  // Architecture must allow adding `ja` later without a refactor (see src/i18n/routing.ts).
  i18n: {
    defaultLocale: "vi",
    locales: ["vi", "en"],
    routing: { prefixDefaultLocale: false },
  },

  // Bug-report pipeline env (docs 10). All optional so the site builds + degrades
  // gracefully until the owner provisions them (Turnstile keys, a fine-grained GitHub
  // Issues token, and a Discord webhook). The client site key is public + inlined.
  env: {
    schema: {
      PUBLIC_TURNSTILE_SITE_KEY: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      TURNSTILE_SECRET: envField.string({ context: "server", access: "secret", optional: true }),
      GITHUB_ISSUES_TOKEN: envField.string({ context: "server", access: "secret", optional: true }),
      DISCORD_WEBHOOK_BUG: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },

  integrations: [
    themeBootstrap,
    svelte(),
    mdx(),
    sitemap({
      i18n: { defaultLocale: "vi", locales: { vi: "vi", en: "en" } },
      filter: (page) => !NON_INDEXED.test(page),
    }),
  ],

  // Prism (class-based) instead of Shiki: Shiki emits per-token inline styles that
  // violate our CSP. Prism colors code via CSS classes styled in the Prose component.
  markdown: {
    syntaxHighlight: "prism",
  },

  // Tailwind v4 is wired through the Vite plugin (NOT the legacy @astrojs/tailwind).
  vite: { plugins: [tailwindcss()] },

  // Self-hosted fonts via the built-in Fonts API. Subsets include `vietnamese`.
  // Preload is chosen per-<Font> in BaseLayout — exactly the 2 first-paint files.
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Bricolage Grotesque",
      cssVariable: "--ff-display",
      weights: ["500 800"],
      subsets: ["latin", "vietnamese"],
      display: "swap",
    },
    {
      provider: fontProviders.google(),
      name: "Be Vietnam Pro",
      cssVariable: "--ff-body",
      weights: [400, 500, 600],
      subsets: ["latin", "vietnamese"],
      display: "swap",
    },
    {
      provider: fontProviders.google(),
      name: "Literata",
      cssVariable: "--ff-reading",
      weights: ["400 500"],
      styles: ["normal", "italic"],
      subsets: ["latin", "vietnamese"],
      display: "swap",
    },
    {
      provider: fontProviders.google(),
      name: "JetBrains Mono",
      cssVariable: "--ff-mono",
      weights: [400, 700],
      subsets: ["latin", "vietnamese"],
      display: "swap",
    },
  ],

  // Built-in CSP. Astro auto-hashes the <script>/<style> it emits; we add fetch
  // directives here. NOTE: this is delivered as a <meta http-equiv> tag, so
  // `frame-ancestors` is ignored by browsers in meta form — framing protection is
  // enforced with an X-Frame-Options header in middleware instead (see docs 06).
  security: {
    csp: {
      algorithm: "SHA-256",
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https://i.ytimg.com https://media.steampowered.com https://*.steamstatic.com",
        // youtube-nocookie: video facade; challenges.cloudflare.com: Turnstile widget iframe.
        "frame-src https://www.youtube-nocookie.com https://challenges.cloudflare.com",
        // challenges.cloudflare.com: Turnstile client XHRs (siteverify is server-side).
        "connect-src 'self' https://challenges.cloudflare.com",
        "font-src 'self'",
        "base-uri 'none'",
        "form-action 'self'",
        "object-src 'none'",
      ],
      // 'self' keeps dynamically-imported island chunks loadable; 'wasm-unsafe-eval'
      // is pre-baked for Pagefind's WebAssembly; challenges.cloudflare.com loads the
      // Turnstile api.js (bug-report captcha, docs 10).
      scriptDirective: {
        resources: ["'self'", "'wasm-unsafe-eval'", "https://challenges.cloudflare.com"],
      },
      styleDirective: { resources: ["'self'"] },
    },
  },
});
