# Changelog

Notable changes to poli0981.dev. The site deploys continuously from `main`; tags mark
milestones. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Content changes (posts, stories, albums) live in [`poli0981/content`](https://github.com/poli0981/content)
and are not listed here.

## [Unreleased]

## [2.1.1] — 2026-10-28

### Fixed

- iPhone: the Waveline is visible again while it rests. Its gradient was sized to the line's
  bounding box, which is 0 px tall for a flat line, and WebKit then draws nothing — the footer,
  the section headings and the error pages showed an empty band where the line belongs. Chrome
  drew it anyway, so only iOS browsers were affected.
- iPhone (Safari 26): the page no longer scrolls into view above the sticky header, under the
  status bar. Safari extends a sticky header's colour up to the screen edge only when the header
  has no `backdrop-filter`; the header, the mobile tab bar and the admin bar dropped the blur
  and are now opaque.

## [2.1.0] — 2026-10-27

### Security

- **Site-wide rate limit.** Every request that reaches the Worker — pages, `/media`, `/ext-img`,
  the search index and the API — now spends one budget per client: 100 requests per 10 seconds
  (IPv6 counted per /64), a new `RL_SITE` binding in `wrangler.jsonc`. Over it, visitors get the
  site's 429 page with `Retry-After: 10` and a 10-second countdown; the stricter per-endpoint
  API limits still apply underneath. Before, only the API groups were limited — pages, images,
  the search index and the widgets endpoint were not. The admin host is exempt (Cloudflare Access
  stands in front of it), and a failing limiter lets requests through without skipping the
  Turnstile gate.
- Setup docs describe the zone WAF rate-limiting rule as the outer layer above it, with the Free
  plan's real limits (path and verified-bot fields, 10-second periods and blocks).

### Added

- `npm run probe:ratelimit` spams a live URL and tells the Worker's 429s apart from the WAF's.
  The CI smoke test now spams the built Worker until the site-wide limit answers.

### Changed

- Faster first paint on phones: every page carries its CSS inline (about 9 KB brotli) instead of
  two render-blocking stylesheets, and the theme toggle and the home page's hero wave hydrate
  when the browser is idle rather than during first paint.
- Lighthouse CI measures through nginx, which gzips responses as Cloudflare's edge compresses them
  in production; the local preview server sends everything uncompressed.

### Fixed

- A missing page under `/en/` gets an English 404 page — English links, recent posts and a
  search over the English index — instead of the Vietnamese one. The Worker now returns the
  asset layer's 404 for every missing page rather than rendering it again through the app.

## [2.0.0] — 2026-10-24

A platform upgrade, a security pass, a new palette and a rebuilt admin
([#98](https://github.com/poli0981/poli0981-dev/pull/98),
[#99](https://github.com/poli0981/poli0981-dev/pull/99),
[#100](https://github.com/poli0981/poli0981-dev/pull/100)).

### Security

- **Turnstile gate bypass fixed** ([#97](https://github.com/poli0981/poli0981-dev/pull/97)): a pass
  cookie with a malformed signature made the check throw and the Worker failed open, serving the
  real page. Decoding is now total, signatures must be exactly 43 characters, and if deciding or
  rendering the gate throws the visitor gets a 503 — never the page behind it.
- Admin: Access tokens older than 24 hours are refused, and `ADMIN_EMAILS` is required (fail
  closed). Every admin action is recorded in a KV audit log (90 days).
- The IP denylist is enforced by the Worker entry for every route, pages included (it only
  covered on-demand routes), supports CIDR ranges and expiry, and is managed from the admin.
- Request bodies are capped (report 32 KB, gate 8 KB, admin JSON 512 KB, uploads 20 MB) and
  every outgoing fetch has a timeout.
- Bug reports go to the private `poli0981/site-reports` repository (the site repo is public);
  `@mentions` in reports are neutralised and Discord pings are disabled.
- Widget thumbnails and game icons are mirrored by the cron worker and served from `/ext-img`, so
  browsers no longer contact Google or Steam before a visitor clicks; `img-src` is `'self'` only.
- `frame-ancestors 'none'` is now sent as a header (it has no effect in a meta CSP).
- CI installs with `--ignore-scripts` and fails on new install scripts; Dependabot waits three days
  before proposing a release; SonarCloud, CodeQL, OSV-Scanner and Snyk run on every PR.

### Added

- Light/dark theme that **follows the OS** by default, with a system → light → dark toggle.
- "Glacier Teal" palette (navy and teal) across the site and admin, checked against WCAG AA by
  `tests/palette.test.ts`.
- Admin: an overview dashboard, an activity page (audit log + content commits), a security page
  (IP denylist, configuration), editor draft autosave with restore, Ctrl/⌘+S, client-side field
  validation, a sandboxed preview, media search and usage, parallel uploads, gallery cover picker,
  drag-and-drop ordering and album deletion, a "session expired" banner.
- Reader routes for one-shot stories (`/truyen/<slug>/`).
- `/api/health` reports the running Worker version and the commit it was built from; the 500 page
  shows the Cloudflare Ray ID, which matches the structured JSON logs in Workers Logs.
- Test suite on `node:test` (about 200 tests, ~99% line coverage of the TypeScript sources) and a
  SonarCloud quality gate.

### Changed

- Node 26; TypeScript 7 (`tsc`) for type checking, alongside TypeScript 6 for tools that need its
  API; ES2025 target. Astro 7.4, @astrojs/cloudflare 14.4, Wrangler 4.152 and current
  dependencies.
- Vietnamese and English pages share one component each (eleven duplicated pages removed).
- The header shows the full navigation from 960 px (it overflowed between 768 and 900 px).
- Workers Builds deploys only `main`; other branches upload preview versions.

### Fixed

- The language switch no longer leads to a 404 on posts whose slugs differ between languages.
- The story reader bar no longer hides behind the sticky header.
- Modal dialogs (the bug-report dialog) were stuck in the top-left corner; lists in posts had no
  bullets — both caused by Tailwind's preflight.
- Callouts in MDX posts rendered unstyled: Astro left their inline styles out of the page's CSP, so
  the browser refused them. The rules moved to the shared prose stylesheet, and the build's CSP
  check now verifies every inline `<style>` (and forbids style attributes) as well as scripts.
- Accessibility: the search is an ARIA combobox, the mobile menu is a modal dialog with a focus
  trap, lightbox focus handling, labelled report dialog, a correct "copied" message, Esc no longer
  dismisses the legal notice from elsewhere, landmark and link labels translated.
- Gallery albums work without JavaScript; contact lines on /qa and the 403 page are real links.
- Widgets: Steam game icons never appeared. The CDN hosts the worker used answer Workers with 403
  for any icon their edge has not cached; the worker now fetches icons from Steam's
  community-assets hosts, which serve Workers, falls back to another CDN, and keeps the copy an
  earlier run stored (games without an icon show their name only)
  ([#101](https://github.com/poli0981/poli0981-dev/pull/101),
  [#102](https://github.com/poli0981/poli0981-dev/pull/102)). An optional read-only `GITHUB_TOKEN`
  keeps the GitHub feed from going stale under the per-IP rate limit Workers share.
- Dozens of smaller issues found by SonarCloud and the new tests (error pages served with the
  wrong status under `astro dev`, regex backtracking, scripts that passed without checking).

## [1.x] — 2026-07 → 2026-10

The public launch is tagged `v1-launch`; the 1.x changes after it were not tagged.

- **2026-07** — Bilingual Astro + Cloudflare Workers site: blog, stories with reading controls and
  content warnings, projects, dev/uses, gaming, Q&A, links, legal pages; Pagefind search; RSS,
  sitemap, JSON-LD and generated OG images; offline page with the Skull Hop mini-game; bug-report
  pipeline (Turnstile → GitHub issue + Discord); widgets cron worker.
- **2026-08** — Content moved to the `poli0981/content` submodule; gallery with real photos; /now
  page; `new:post`; Lighthouse CI; generated third-party notices; CSP hash guard; security.txt; AI
  usage disclosure.
- **2026-10** — Custom Worker entry in front of every page; Workers Rate Limiting; Web Analytics;
  topic email aliases; R2 media; the Turnstile gate; the admin at `admin.poli0981.dev`.

[Unreleased]: https://github.com/poli0981/poli0981-dev/compare/v2.1.1...HEAD
[2.1.1]: https://github.com/poli0981/poli0981-dev/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/poli0981/poli0981-dev/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/poli0981/poli0981-dev/releases/tag/v2.0.0
[1.x]: https://github.com/poli0981/poli0981-dev/releases/tag/v1-launch
