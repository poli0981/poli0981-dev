# 02 — Architecture

## 1. Tổng quan

Site **prerender tĩnh gần như toàn bộ** bằng Astro, deploy lên **Cloudflare Workers + Static Assets**. Một Worker chính (`poli0981-dev`) phục vụ site, admin và vài API route; một Worker phụ (`poli0981-widgets`) chạy cron lấy dữ liệu YouTube/Steam/GitHub vào KV.

```
Khách ──HTTPS──> Cloudflare edge (WAF free, Bot Fight, DDoS auto, Transform Rule x-verified-bot)
                    │
                    ▼
        src/worker.ts — entry của Worker (assets.run_worker_first: mọi trang đều qua đây)
        ├── www → apex (301)
        ├── denylist IP (KV, một khoá "denylist", CIDR + hạn) → trang 403
        ├── tách host: admin.poli0981.dev chỉ /admin*, /api/admin*, /media/*
        ├── /media/*    → R2 poli0981-media (ảnh upload qua admin, cache 1 năm)
        ├── /ext-img/*  → KV widgets:img:* (ảnh widget đã mirror; không gọi Google/Steam)
        ├── cổng Turnstile (vé 48 giờ) → trang xác minh thay <body>
        ├── trang tĩnh → ASSETS (dist/)
        └── còn lại → app Astro (@astrojs/cloudflare/handler)
               ├── middleware: admin (Access JWT + CSRF), rate limit /api, trang lỗi
               ├── /api/report · /api/gate · /api/widgets · /api/health
               └── /admin/* + /api/admin/*  (GitHub API → repo content, R2, Images, KV)
                    ▲ đọc                                  │ ghi
                    KV (widgets:*, denylist, audit:*)  ◄───┘
                    ▲ ghi
        Worker "widgets" (cron 45') ──> YouTube RSS / Steam API / GitHub API (+ mirror ảnh)
```

Mọi response đi ra đều qua `withSecurityHeaders` (`src/lib/security-headers.ts`) và mang log JSON có cấu trúc (`src/lib/log.ts`: `event`, `ray`, `path`… — xem `06` §10).

## 2. Stack (đang dùng tại 2026-10-24)

| Thành phần | Bản | Ghi chú |
|---|---|---|
| Node.js | 26 (`.nvmrc` = `26`, Workers Builds `NODE_VERSION=26`) | engines: `>=26` |
| Astro | ^7.4 | CSP API + Fonts API built-in |
| @astrojs/cloudflare | ^14.4 | target Workers; entry riêng `src/worker.ts` |
| @astrojs/mdx, sitemap, rss | ^8 · ^3 · ^4 | item RSS dựng ở `src/lib/rss.ts` (truyện chỉ mô tả + link) |
| Svelte + @astrojs/svelte | 5 + ^9.1 | islands |
| Tailwind CSS | ^4 | CSS-first, `@theme` |
| Pagefind | ^1 | chạy post-build |
| Wrangler | ^4.152 | dev, types, smoke test, deploy tay |
| TypeScript | **7.0** (`@typescript/native` → `tsc`) + **6.0** (`typescript`) | TS7 kiểm kiểu nhanh (`npm run typecheck`), TS6 cho astro check / typescript-eslint / svelte2tsx (TS 7.0 chưa có JS API). `target`/`lib` = ES2025, `erasableSyntaxOnly` |
| Test | `node:test` của Node 26 | không thêm deps; `module.registerHooks` giả lập `astro:*`/`cloudflare:workers`; coverage lcov cho SonarCloud |
| jose · marked · yaml · zod | ^6 · ^18 · ^2 · ^4 | Access JWT · preview admin · frontmatter · schema |

## 3. Cấu trúc repo

```
poli0981-dev/
├── poli0981.dev-docs/     # suite này
├── docs/templates/        # khung bài mới (npm run new:post)
├── public/                # favicon, robots.txt, security.txt, sw.js, gate.js, skullhop.js
├── scripts/               # gen-og, gen-notices, check-exif/strip-exif, check-csp-hashes,
│                          #   check-install-scripts, smoke-worker, new-post
├── src/
│   ├── worker.ts          # entry: denylist, host, /media, /ext-img, cổng, assets
│   ├── middleware.ts      # admin JWT + CSRF, rate limit /api, trang lỗi
│   ├── assets/            # ảnh qua pipeline Astro (gallery/, covers/)
│   ├── components/        # .astro + islands .svelte
│   │   ├── pages/         # thân trang dùng chung vi/en (route chỉ là wrapper)
│   │   └── admin/         # islands của admin
│   ├── content/           # submodule poli0981/content (xem 04)
│   ├── i18n/              # vi.ts, en.ts, routing.ts
│   ├── layouts/           # Base, Post, StoryReader, Project, Error, Admin
│   ├── lib/               # gate/, admin/, media/, denylist, ext-img, log, version, palette, theme…
│   ├── pages/             # routes + /en/* + api/* + admin/* + 403/404/429/500
│   └── styles/            # global.css (token), prose.css, admin.css
├── tests/                 # node:test + support/ (stub astro:*, fake KV/R2/GitHub…)
├── workers/widgets/       # worker cron riêng (wrangler.jsonc riêng)
├── .github/               # ci.yml, content-bump.yml, lighthouse.yml, osv-scanner.yml, dependabot.yml
├── astro.config.mjs · wrangler.jsonc · sonar-project.properties · lefthook.yml · knip.json
└── LICENSE (GPL-3.0) · CONTENT-LICENSE.md · DISCLAIMER.md · THIRD-PARTY-NOTICES.md · SECURITY.md · CHANGELOG.md
```

## 4. Rendering & routing

- Mặc định **prerender** toàn site. Chạy on-demand trên Worker: `src/pages/api/*`, `src/pages/admin/*` và middleware.
- **i18n** (Astro built-in): `defaultLocale: 'vi'`, `locales: ['vi','en']`, không prefix cho vi → `/blog/...` và `/en/blog/...`. UI string trong `src/i18n/`, nội dung theo `lang` frontmatter (xem 04 §4).
- **Một thân trang cho hai ngôn ngữ**: route vi và en chỉ là wrapper gọi component trong `src/components/pages/` với `locale` (và props từ builder `getStaticPaths` trong `src/lib/pages.ts`).
- Nút đổi ngôn ngữ: trang có bản dịch (`translationKey`) → đúng bản dịch; không có → mục tương ứng của ngôn ngữ kia (`sectionFallbackPath`), không bao giờ 404.
- Truyện: chương thuộc series → `/truyen/<series>/<slug>/`; truyện lẻ (không có thư mục series) → `/truyen/<slug>/`.
- 404: `src/pages/404.astro`; cấu hình assets `not_found_handling: "404-page"`.

## 5. Worker "site" — wrangler.jsonc (rút gọn)

```jsonc
{
  "name": "poli0981-dev",
  "compatibility_date": "2026-10-15",
  "compatibility_flags": ["nodejs_compat"],
  "main": "./src/worker.ts",
  "workers_dev": false, "preview_urls": false,
  "assets": { "binding": "ASSETS", "directory": "./dist", "not_found_handling": "404-page",
              "html_handling": "auto-trailing-slash", "run_worker_first": ["/*", "!/_astro/*", "…"] },
  "kv_namespaces": [{ "binding": "KV", "id": "…" }],
  "ratelimits": [ RL_REPORT 5/60s · RL_GATE 30/60s · RL_ADMIN 120/60s · RL_API 120/60s ],
  "vars": { "GATE_MODE": "on", "ACCESS_TEAM_DOMAIN": "…", "ACCESS_AUD": "…", "REPORT_REPO": "poli0981/site-reports" },
  "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "poli0981-media" }],
  "images": { "binding": "IMAGES" },
  "version_metadata": { "binding": "CF_VERSION_METADATA" },
  "observability": { "enabled": true, "redact_query_string": true,
                     "logs": { "enabled": true, "invocation_logs": true }, "traces": { "enabled": true, "head_sampling_rate": 0.1 } }
}
```

Secrets (đặt bằng `wrangler secret put`, không bao giờ commit — bảng đầy đủ ở `06` §4): `TURNSTILE_SECRET`, `GATE_SECRET`, `GITHUB_ISSUES_TOKEN`, `DISCORD_WEBHOOK_BUG`, `GITHUB_CONTENT_TOKEN`, `GITHUB_PUBLISH_TOKEN`, `ADMIN_EMAILS`.

`/api/health` trả `version` (id bản Worker đang chạy + commit đã build, từ `version_metadata` và `__BUILD_COMMIT__`) — dùng để xác minh deploy từ bên ngoài.

## 6. Worker "widgets" (workers/widgets/)

- Riêng biệt để không đụng entry của site; cron `"*/45 * * * *"`; không có `package.json` (không deps).
- Bind cùng KV namespace (quyền ghi); secrets: `STEAM_API_KEY`, `STEAM_ID64`, `DISCORD_WEBHOOK_CI`.
- Ngoài dữ liệu, worker **mirror ảnh thumbnail/icon vào KV** (`widgets:img:*`, ≤ 2 MB, 14 ngày) để site phục vụ qua `/ext-img/*` — khách không gọi Google/Steam trước khi bấm.
- Deploy tay: `npx wrangler deploy --config workers/widgets/wrangler.jsonc`. Chi tiết: `11_WIDGETS_INTEGRATIONS.md`.

## 7. Setup máy dev (một lần)

```bash
git clone --recurse-submodules https://github.com/poli0981/poli0981-dev.git
cd poli0981-dev
nvm use            # đọc .nvmrc = 26
npm ci --ignore-scripts && npm run check-install-scripts
npx lefthook install
npm run types && npm run types:widgets
npm run dev        # astro dev trên workerd (bindings local); admin dùng danh tính giả dev@localhost
```

Quy tắc gói bên thứ ba: chỉ thêm khi có lý do trong ADR/PR description; mỗi gói mới phải qua `npm audit` + Dependabot theo dõi; `THIRD-PARTY-NOTICES.md` sinh bằng `scripts/gen-notices.mjs` và CI kiểm lệch.

## 8. Chính sách phiên bản & CVE

- Pin `^` trong cùng major; Dependabot mở PR patch/minor hằng tuần (cooldown 3 ngày — `08` §6).
- Trước mỗi lần nâng **major**: đọc upgrade guide chính thức + chạy toàn bộ CI + preview (`17` §2).
- **TypeScript 7**: `@typescript/native` là alias `npm:typescript@7` — Dependabot bỏ qua alias `npm:`, nên nâng tay; `typescript` (bản 6) giữ đến khi TS 7.1 có JS API cho astro check / typescript-eslint / svelte2tsx, lúc đó gộp về một bản.
- Theo dõi CVE liên tục: Dependabot alerts, `npm audit` (CI), OSV-Scanner, Snyk, CodeQL, SonarCloud (`06` §6).

## 9. ADR (Architecture Decision Records — rút gọn)

| # | Quyết định | Lý do chính | Xét lại khi |
|---|---|---|---|
| 01 | Astro thay vì SvelteKit/Next | Content-first, ~0 JS mặc định, Content Collections type-safe, RSS/sitemap first-class | Site biến thành web-app nhiều tương tác |
| 02 | Workers thay vì Pages | Hướng Cloudflare khuyến nghị cho dự án mới; assets request free; 1 nền tảng cho cả site + cron | — |
| 03 | Svelte islands thay vì React | Nhẹ hơn, đã quen từ WXT/BookmarkMagic; tránh kéo React runtime vào site tĩnh | Cần lib chỉ có React |
| 04 | Admin tự viết thay vì Keystatic (10/2026) | Host riêng sau Access + kiểm JWT; token chỉ ghi repo content, xuất bản qua workflow có CI; ảnh qua Images binding → R2; ít deps (`jose`, `yaml`, `marked`) | Cần nhiều người biên tập / phân quyền |
| 05 | Không D1/Sentry | Q&A form bị bỏ; bug report đi thẳng GitHub+Discord; lỗi runtime xem ở Workers Logs (log JSON) | Xuất hiện nhu cầu dữ liệu động thật |
| 06 | GPL-3.0 code / ARR content | Nhất quán hệ sinh thái repo; truyện & ảnh cần bảo hộ chặt | — |
| 07 | Error pages tự phục vụ | Custom Errors của Cloudflare cần zone plan trả phí; site chạy trên Worker nên tự làm được | Nếu một ngày mua Pro vì lý do khác |
| 08 | Logic edge ở worker entry (`src/worker.ts`) | Trang tĩnh được adapter phục vụ trước middleware ⇒ cổng Turnstile, denylist, `/media`, chuyển host, security headers phải nằm ở entry + `assets.run_worker_first` | Adapter có hook chính thức cho trang tĩnh |
| 09 | TypeScript 7 song song TypeScript 6 (10/2026) | `tsc` 7 nhanh hơn nhiều cho kiểm kiểu; công cụ hệ sinh thái chưa chạy được trên TS 7.0 (không có JS API) | TS 7.1 có API mới |
| 10 | `node:test` + SonarCloud thay Vitest (10/2026) | Không thêm deps; Node 26 chạy thẳng TypeScript, `registerHooks` giả lập module ảo; lcov cho quality gate | Cần test component trong DOM thật |
| 11 | Palette Glacier Teal + theme theo hệ điều hành (10/2026) | Tông lạnh theo yêu cầu chủ site; mọi cặp màu kiểm WCAG AA bằng test; một nguồn màu `src/lib/palette.ts` | Đổi nhận diện |
