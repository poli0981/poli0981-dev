// @ts-check
import { defineConfig, envField, fontProviders } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import svelte from "@astrojs/svelte";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { THEME_BOOTSTRAP } from "./src/lib/theme.ts";

// Error/system pages that must never appear in the sitemap.
const NON_INDEXED = /\/(404|500|403|429|offline)\/?$/;

// Sitemap <lastmod>. Every deploy is a full rebuild, so build time is the truthful
// "as of" for the whole site.
const BUILD_TIME = new Date().toISOString();

// The theme must be applied before first paint or the default flashes, so this has to
// be inline and synchronous — which rules out a processed <script> (Astro turns those
// into deferred external modules). `is:inline` would work but Astro never hashes it
// (see core/csp/common.js: trackScriptHashes only covers bundled scripts, client
// directives, island prebuilts, and settings.scripts), leaving it to survive only
// because a <meta> CSP does not govern markup that precedes it — fragile by accident.
// `injectScript("head-inline")` is the one path that is BOTH rendered verbatim inline
// AND hashed from that same string, so the CSP can never drift from the source.
// It also restores the "hide scrollbar" preference for the same reason (no flash of a
// scrollbar that then disappears). The script itself lives in src/lib/theme.ts, next to
// the rules it shares with ThemeToggle.svelte.

/** @type {import('astro').AstroIntegration} */
const themeBootstrap = {
  name: "theme-bootstrap",
  hooks: {
    "astro:config:setup": ({ injectScript }) => injectScript("head-inline", THEME_BOOTSTRAP),
  },
};

// Cloudflare Web Analytics beacon: only in builds made by Workers Builds for main
// (WORKERS_CI / WORKERS_CI_BRANCH are injected there), so CI, Lighthouse and branch
// previews never report page views. Overridable with PUBLIC_CF_BEACON=true|false.
const CF_BEACON_DEFAULT =
  process.env.WORKERS_CI === "1" && process.env.WORKERS_CI_BRANCH === "main";

// The commit a build was made from (Workers Builds sets WORKERS_CI_COMMIT_SHA, GitHub Actions
// GITHUB_SHA). /api/health reports it next to the Worker version id (src/lib/version.ts), so
// "what is live?" maps straight to a commit.
const BUILD_COMMIT = process.env.WORKERS_CI_COMMIT_SHA ?? process.env.GITHUB_SHA ?? null;

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
      // Admin (admin.poli0981.dev), two fine-grained tokens (src/lib/admin/github.ts):
      // content repo Contents RW, and site repo Actions RW for the publish workflow;
      // plus the email allowlist on top of Access (unset = the admin refuses everyone).
      GITHUB_CONTENT_TOKEN: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      GITHUB_PUBLISH_TOKEN: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      ADMIN_EMAILS: envField.string({ context: "server", access: "secret", optional: true }),
      PUBLIC_CF_BEACON: envField.boolean({
        context: "client",
        access: "public",
        default: CF_BEACON_DEFAULT,
      }),
      // Signs the 48-hour Turnstile-gate pass cookie (src/lib/gate). The gate itself is
      // switched by the GATE_MODE var in wrangler.jsonc and stays off without this secret.
      GATE_SECRET: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },

  integrations: [
    themeBootstrap,
    svelte(),
    mdx(),
    sitemap({
      i18n: { defaultLocale: "vi", locales: { vi: "vi", en: "en" } },
      filter: (page) => !NON_INDEXED.test(page),
      // The sitemap shipped with no <lastmod> at all. Per-page dates would mean
      // threading content dates through the integration; the build timestamp is the
      // honest site-wide answer and is what crawlers use to schedule a recrawl.
      serialize: (item) => ({ ...item, lastmod: BUILD_TIME }),
    }),
  ],

  // Prism (class-based) instead of Shiki: Shiki emits per-token inline styles that
  // violate our CSP. Prism colors code via CSS classes styled in the Prose component.
  markdown: {
    syntaxHighlight: "prism",
  },

  // Tailwind v4 is wired through the Vite plugin (NOT the legacy @astrojs/tailwind).
  vite: {
    plugins: [tailwindcss()],
    define: { __BUILD_COMMIT__: JSON.stringify(BUILD_COMMIT) },
  },

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
        // Widget thumbnails/icons are mirrored into KV and served from /ext-img (lib/ext-img),
        // so no third-party image host is allowed — a page never contacts YouTube or Steam
        // before the visitor presses play.
        "img-src 'self' data:",
        // youtube-nocookie: video facade; challenges.cloudflare.com: Turnstile widget iframe.
        "frame-src https://www.youtube-nocookie.com https://challenges.cloudflare.com",
        // challenges.cloudflare.com: Turnstile client XHRs (siteverify is server-side).
        // cloudflareinsights.com: Web Analytics beacon reports (manual snippet mode).
        "connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com",
        "font-src 'self'",
        "base-uri 'none'",
        "form-action 'self'",
        "object-src 'none'",
      ],
      // 'self' keeps dynamically-imported island chunks loadable; 'wasm-unsafe-eval'
      // is pre-baked for Pagefind's WebAssembly; challenges.cloudflare.com loads the
      // Turnstile api.js (bug-report captcha, docs 10); static.cloudflareinsights.com
      // serves the Web Analytics beacon (src/components/CfBeacon.astro).
      scriptDirective: {
        resources: [
          "'self'",
          "'wasm-unsafe-eval'",
          "https://challenges.cloudflare.com",
          "https://static.cloudflareinsights.com",
        ],
      },
      styleDirective: { resources: ["'self'"] },
    },
  },
});
