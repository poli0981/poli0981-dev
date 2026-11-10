# Changelog

Notable changes to poli0981.dev. The site deploys continuously from `main`; tags mark
milestones. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Content changes (posts, stories, albums) live in [`poli0981/content`](https://github.com/poli0981/content)
and are not listed here.

## [Unreleased]

## [2.2.0] — 2026-11-10

### Added

- **Accessibility statement.** A new page, `/legal/accessibility` (Vietnamese and English), says
  what the site aims for (WCAG 2.2 AA, as a guide — it has not been audited), what is in place, how
  it is tested, what is known not to work and how to report a barrier: a new address,
  accessibility@poli0981.dev, or the "Report a bug" button. [`ACCESSIBILITY.md`](ACCESSIBILITY.md)
  is the repository's copy, with the notes for contributors; there is an accessibility issue
  template and a pull request template with the checklist.
- **Accessibility gate in CI.** `npm run test:a11y` runs in the required `build` check: axe-core
  over every page in the sitemap and over the menu, search, photo viewer, report dialog, reading
  settings and legal notice while open, then keyboard, reflow and forced-colours tests
  (`tests/a11y/`, Playwright driving the runner's Chrome). Lighthouse stays advisory.
- Windows High Contrast (`forced-colors`): the search field and its active result keep a visible
  indicator, the scrollbar switch shows its knob and state, and the chosen reading option is
  filled. `prefers-contrast: more` strengthens hairlines and drops the film grain.

### Changed

- The current page is marked by more than colour: an underline in the header and in the legal
  sidebar, a bar along the top of the current tab on phones. The chosen reading option is bold and
  double-ruled.
- Footer social icons are 44 px targets (the icons keep their size); the row is a little wider.
- On a phone the legal notice rests on top of the tab bar instead of covering it.
- Below 384 px (Vietnamese pages) or 404 px (English pages) the language switch shows `EN` / `VI`
  instead of the full name, and below 352 px the header drops the "SkullMute" wordmark.
- Dependencies: Tailwind CSS 4.3.5. New dev dependencies: `playwright` 1.65 and
  `@axe-core/playwright` 4.14, both older than the three-day cooldown and without install scripts.

### Fixed

- The header was wider than the screen on narrow phones — it needs 378 px in Vietnamese and 400 px
  in English — so pages scrolled sideways at 360 px, and English pages did on a 390 px iPhone. Pages
  now reflow down to 320 px; a long URL in a legal page no longer widens it either.
- Focus could land underneath the mobile tab bar, the legal notice or the story reader's bar. The
  page's scroll padding now accounts for all three.
- Esc in the story reader's "Aa" panel dropped focus to the top of the page; it returns to the
  button. Pressing play on a video keeps focus on the player.
- Names: the three "Play video" buttons on the gaming page each carry their video's title; the
  search's "Esc" button is named "Esc — Close"; the "Social" and "Legal" navs that shared a name
  with the footer's (dev and gaming pages, menu sheet, legal sidebar) have their own.
- Headings no longer skip from h1 to h3 on the blog, tag, project and gallery lists. Project,
  gallery and tag breadcrumbs are navigation landmarks, and the legal notice is a landmark.
- Links inside the Q&A contact list are underlined, not told apart by colour alone.
- The report form ties its "too short" message to the text box and returns focus there. The photo
  viewer announces the caption when you move to another photo, and no longer reads it three times.
- The sitemap listed seven `/admin/` URLs that only exist on the admin host.
- The four FrameLedger screenshots have text alternatives (content repository).

## [2.1.2] — 2026-11-09

### Security

- Lint tooling runs on minimatch 11.0.5 instead of 10.2.5, which carried a denial of service
  through crafted glob patterns (GHSA-g3hv-75wg-m249). ESLint and typescript-eslint still ask for
  minimatch 10, so an `overrides` entry in `package.json` holds 11 until they move; they only call
  `new Minimatch(…).match()` and `minimatch()`, which 11 keeps.
- The OSV scan ignores deepmerge's prototype-poisoning advisory (GHSA-gcqx-w48m-w2h4) until
  2027-02-09, in the new `osv-scanner.toml`. No fixed release exists, and the only copy merges this
  repo's own Svelte config at build time; nothing from a visitor reaches it. These two advisories
  had kept the weekly scan, and every Dependabot PR, red since 2026-11-02.

### Changed

- Dependencies: Astro 7.4.7, @astrojs/cloudflare 14.4.6, @astrojs/mdx 8.1.3, @astrojs/svelte
  9.1.2, Svelte 5.57.3, Tailwind CSS 4.3.4, jose 6.2.15, marked 18.1.3 and Pagefind 1.6.0; Wrangler
  4.158, ESLint 10.14, typescript-eslint 8.72.1, knip 6.44 and the SonarCloud scan action 8.4.0.
  Releases younger than three days were held back, as Dependabot's cooldown does.
- knip no longer needs `cloudflare` in `ignoreDependencies`; it now reads `cloudflare:workers`
  imports as a runtime module.

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

[Unreleased]: https://github.com/poli0981/poli0981-dev/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/poli0981/poli0981-dev/compare/v2.1.2...v2.2.0
[2.1.2]: https://github.com/poli0981/poli0981-dev/compare/v2.1.1...v2.1.2
[2.1.1]: https://github.com/poli0981/poli0981-dev/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/poli0981/poli0981-dev/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/poli0981/poli0981-dev/releases/tag/v2.0.0
[1.x]: https://github.com/poli0981/poli0981-dev/releases/tag/v1-launch
