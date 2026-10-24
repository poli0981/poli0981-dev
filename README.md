# poli0981.dev

[![CI](https://github.com/poli0981/poli0981-dev/actions/workflows/ci.yml/badge.svg)](https://github.com/poli0981/poli0981-dev/actions/workflows/ci.yml)
[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=poli0981_poli0981-dev&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=poli0981_poli0981-dev)
[![License: GPL-3.0](https://img.shields.io/badge/code-GPL--3.0-blue)](LICENSE)

The personal site of Kokone (SkullMute) — dev portfolio, blog, short fiction and a hub for
the SkullMute channel, in Vietnamese and English. Live at **[poli0981.dev](https://poli0981.dev)**.

> Trang cá nhân của Kokone (SkullMute): dự án, blog, truyện ngắn và kênh SkullMute — song ngữ
> Việt/Anh. Tài liệu thiết kế đầy đủ (tiếng Việt) nằm trong [`poli0981.dev-docs/`](poli0981.dev-docs/00_INDEX.md).

## Stack

| Layer     | Choice                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Framework | [Astro 7](https://astro.build) (static-first) with Svelte 5 islands                                                           |
| Styling   | Tailwind CSS 4, design tokens in `src/styles/global.css` ("Glacier Teal" palette)                                             |
| Hosting   | Cloudflare Workers + Static Assets; KV, R2, Images, Rate Limiting, Access, Turnstile                                          |
| Content   | Markdown/MDX in [`poli0981/content`](https://github.com/poli0981/content) (git submodule `src/content`)                       |
| Search    | Pagefind (built after `astro build`)                                                                                          |
| Tooling   | Node 26 · TypeScript 7 (`tsc`) next to TypeScript 6 (astro check, typescript-eslint) · `node:test` · ESLint · Prettier · knip |
| Quality   | SonarCloud quality gate · CodeQL · OSV-Scanner · Snyk · Dependabot (3-day cooldown)                                           |

## How it fits together

```
visitor ─▶ Cloudflare edge ─▶ src/worker.ts (every request, pages included)
            www → apex · IP denylist (KV) · admin host split · /media (R2) · /ext-img (KV)
            Turnstile gate (48-hour pass) · static pages from ASSETS · the rest → Astro app
                                                                      ├─ /api/report, /api/gate, /api/widgets, /api/health
                                                                      └─ admin.poli0981.dev (Cloudflare Access + JWT check)
workers/widgets (cron, every 45 min) ─▶ YouTube / Steam / GitHub ─▶ KV (data + mirrored images)
```

Almost every page is prerendered. The Worker entry runs first for every route so the bot gate,
the denylist and the security headers also cover static pages. Details:
[`02_ARCHITECTURE.md`](poli0981.dev-docs/02_ARCHITECTURE.md) and [`06_SECURITY.md`](poli0981.dev-docs/06_SECURITY.md).

## Getting started

Requirements: Node 26 (`.nvmrc`) and npm 11. The content submodule is public, so a plain clone works.

```bash
git clone --recurse-submodules https://github.com/poli0981/poli0981-dev.git
cd poli0981-dev
npm ci --ignore-scripts && npm run check-install-scripts
npx lefthook install
npm run types && npm run types:widgets
npm run dev
```

`npm run dev` runs Astro on workerd with local bindings. The admin works locally with a stand-in
identity (`dev@localhost`); saving content needs a `GITHUB_CONTENT_TOKEN` in `.dev.vars`.

## Commands

| Command                                                  | What it does                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run dev`                                            | Dev server (workerd, local KV/R2)                                                              |
| `npm run build`                                          | `astro build` → OG images → Pagefind index → CSP hash check                                    |
| `npm run preview`                                        | Serve the build                                                                                |
| `npm run check`                                          | `astro check` (TypeScript 6 language service)                                                  |
| `npm run typecheck`                                      | `tsc` from TypeScript 7 for the site and the widgets worker                                    |
| `npm run lint` · `npm run format:check` · `npm run knip` | ESLint · Prettier · unused files/exports                                                       |
| `npm test` · `npm run test:coverage`                     | `node:test` suites; coverage writes `coverage/lcov.info` (80% line floor)                      |
| `npm run smoke`                                          | Runs the built Worker with `wrangler dev` and probes pages, headers, the gate and the denylist |
| `npm run new:post`                                       | Scaffold a post or story from `docs/templates/`                                                |
| `npm run check-exif` · `npm run strip-exif`              | Refuse / remove GPS and camera metadata in images                                              |
| `npm run gen-notices`                                    | Regenerate `THIRD-PARTY-NOTICES.md` (CI checks it)                                             |

## Deploying

Cloudflare **Workers Builds** builds every push: `main` runs `npx wrangler deploy`, any other
branch only `npx wrangler versions upload` (a preview version that takes no traffic). After a
merge, `https://poli0981.dev/api/health` reports the running version and commit. The widgets
worker deploys by hand: `npx wrangler deploy --config workers/widgets/wrangler.jsonc`.
Setup from scratch: [`07_CLOUDFLARE_SETUP.md`](poli0981.dev-docs/07_CLOUDFLARE_SETUP.md);
pipeline: [`08_CI_CD.md`](poli0981.dev-docs/08_CI_CD.md); changes per release: [`CHANGELOG.md`](CHANGELOG.md).

## Admin

`admin.poli0981.dev` is the owner's editor: write and edit posts (commits to the content repo),
upload images (transformed once into AVIF/WebP and stored in R2), manage gallery albums,
publish (opens a submodule-bump PR that CI must pass), review an audit log and manage the IP
denylist. It sits behind Cloudflare Access, and the Worker independently verifies the Access
JWT (≤ 24 hours old) and an email allowlist on every request.

## Security

Please report vulnerabilities privately — see [`SECURITY.md`](SECURITY.md). Bug reports from the
site's "Report a bug" button land in a private repository, not in this one's issues.

## License

- **Code**: [GPL-3.0-only](LICENSE).
- **Content** (posts, stories, photographs — the `poli0981/content` submodule, `src/assets/`,
  uploaded media): **all rights reserved**, see [`CONTENT-LICENSE.md`](CONTENT-LICENSE.md).
- Third-party packages and fonts: [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
- How AI was used to build the site: [`/legal/ai-usage`](https://poli0981.dev/legal/ai-usage/).
