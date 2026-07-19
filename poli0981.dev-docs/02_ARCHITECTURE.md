# 02 — Architecture

## 1. Tổng quan

Site **prerender tĩnh gần như toàn bộ** bằng Astro, deploy lên **Cloudflare Workers + Static Assets**. Một Worker chính phục vụ site + vài API route; một Worker phụ (`widgets`) chạy cron lấy dữ liệu YouTube/Steam/GitHub vào KV.

```
Khách ──HTTPS──> Cloudflare edge (WAF free, Bot Fight, DDoS auto)
                    │
                    ▼
        Worker "site" (Astro adapter)
        ├── Static Assets (dist/) ── phần lớn request, FREE
        ├── /api/report ── Turnstile + rate-limit(KV) → GitHub Issue + Discord
        └── middleware ── headers, denylist(KV) → 403, rate-limit → 429
                    ▲ đọc
                    KV (widgets:*, denylist:*, rl:*)
                    ▼ ghi
        Worker "widgets" (cron 45') ──> YouTube RSS / Steam API / GitHub API
```

## 2. Stack chốt (verify 2026-07-17)

| Thành phần | Bản | Ghi chú |
|---|---|---|
| Node.js | 24 LTS (`.nvmrc` = `24`) | engines: `>=24` |
| Astro | ^7.0.9 | CSP API + Fonts API built-in (stable từ v6) |
| @astrojs/cloudflare | ^14 | target Workers |
| @astrojs/mdx, sitemap, rss | mới nhất | |
| Svelte + @astrojs/svelte | ^5 | islands |
| Tailwind CSS | ^4.3 | CSS-first, `@theme` |
| GSAP | ^3.13 | free toàn bộ plugin |
| Pagefind | ^1 | chạy post-build |
| @vite-pwa/astro | mới nhất | chỉ offline fallback |
| Wrangler | ^4 | dev + deploy |
| TypeScript | mới nhất, strict | |

## 3. Cấu trúc repo

```
poli0981.dev/
├── docs/                  # suite này
├── public/                # favicon, robots.txt, security.txt, offline assets
├── scripts/               # strip-exif.mjs, check-exif.mjs, gen-notices.mjs
├── src/
│   ├── assets/            # ảnh qua pipeline Astro (gallery/, covers/)
│   ├── components/        # .astro + islands .svelte
│   ├── content/           # collections (xem 04)
│   ├── i18n/              # vi.ts, en.ts + helper t()
│   ├── layouts/           # Base, Post, StoryReader, Legal
│   ├── middleware.ts      # headers, denylist, rate-limit
│   ├── pages/             # routes + /en/* + api/report.ts + 404/500
│   └── styles/            # global.css (@theme tokens)
├── workers/widgets/       # worker cron riêng (wrangler.jsonc riêng)
├── .github/               # workflows caller, ISSUE_TEMPLATE, dependabot.yml
├── astro.config.mjs · wrangler.jsonc · lefthook.yml · knip.json
└── LICENSE (GPL-3.0) · CONTENT-LICENSE.md · DISCLAIMER.md · THIRD-PARTY-NOTICES.md
```

## 4. Rendering & routing

- Mặc định **prerender: true** toàn site. Chỉ `src/pages/api/*` và middleware chạy on-demand trên Worker.
- **i18n** (Astro built-in): `defaultLocale: 'vi'`, `locales: ['vi','en']`, không prefix cho vi → `/blog/...` và `/en/blog/...`. UI string trong `src/i18n/`, nội dung theo `lang` frontmatter (xem 04 §4).
- View Transitions bật toàn site; fallback bình thường cho trình duyệt cũ.
- 404: `src/pages/404.astro` (+ bản `/en/404`); cấu hình assets `not_found_handling: "404-page"`.

## 5. Worker "site" — wrangler.jsonc (khung)

```jsonc
{
  "name": "poli0981-dev",
  "compatibility_date": "2026-07-01",
  "compatibility_flags": ["nodejs_compat"],
  // "main" + "assets" do `astro add cloudflare` sinh — giữ nguyên giá trị adapter tạo
  "assets": { "binding": "ASSETS", "directory": "./dist" },
  "kv_namespaces": [{ "binding": "KV", "id": "<id>" }],
  "observability": { "enabled": true },
  "routes": [{ "pattern": "poli0981.dev", "custom_domain": true }]
}
```

Secrets (đặt bằng `wrangler secret put`, không bao giờ commit): `TURNSTILE_SECRET`, `GITHUB_ISSUES_TOKEN` (fine-grained PAT, chỉ Issues R/W repo này), `DISCORD_WEBHOOK_BUG`.

## 6. Worker "widgets" (workers/widgets/)

- Riêng biệt để không đụng entry Astro sinh ra; cron `"*/45 * * * *"`.
- Bind cùng KV namespace (quyền ghi); secrets: `STEAM_API_KEY`, `STEAM_ID64`.
- Chi tiết nguồn dữ liệu + schema KV: `11_WIDGETS_INTEGRATIONS.md`.

## 7. Setup dự án (một lần)

```bash
nvm use 24
npm create cloudflare@latest -- poli0981.dev --framework=astro
cd poli0981.dev
npx astro add svelte tailwind mdx sitemap cloudflare
npm i -D pagefind knip lefthook eslint prettier prettier-plugin-astro \
  prettier-plugin-tailwindcss typescript-eslint eslint-plugin-astro eslint-plugin-svelte
npx lefthook install
```

Quy tắc gói bên thứ ba: chỉ thêm khi có lý do trong ADR/PR description; mỗi gói mới phải qua `npm audit` + Dependabot theo dõi; cập nhật `THIRD-PARTY-NOTICES.md` bằng `scripts/gen-notices.mjs` trong CI.

## 8. Chính sách phiên bản & CVE

- Pin `^` trong cùng major; Dependabot mở PR patch/minor hằng tuần.
- Trước mỗi lần nâng **major**: đọc upgrade guide chính thức + chạy toàn bộ CI + preview.
- Nền tảng CVE đã kiểm tra khi chốt stack: chuỗi CVE Astro 2026 (XSS `define:vars`, server-islands, slot-name, SSRF image) đều đã vá trước 7.0.9; các CVE thuộc adapter node/vercel không áp dụng (dùng adapter cloudflare). Quy trình theo dõi tiếp: `06_SECURITY.md` §6.

## 9. ADR (Architecture Decision Records — rút gọn)

| # | Quyết định | Lý do chính | Xét lại khi |
|---|---|---|---|
| 01 | Astro thay vì SvelteKit/Next | Content-first, ~0 JS mặc định, Content Collections type-safe, RSS/sitemap first-class | Site biến thành web-app nhiều tương tác |
| 02 | Workers thay vì Pages | Hướng Cloudflare khuyến nghị cho dự án mới; assets request free; 1 nền tảng cho cả site + cron | — |
| 03 | Svelte islands thay vì React | Nhẹ hơn, đã quen từ WXT/BookmarkMagic; tránh kéo React runtime vào site tĩnh | Cần lib chỉ có React |
| 04 | Không Keystatic (v1) | Ít bề mặt tấn công + ít deps; capture mobile đã có đường khác | Sau 1–2 tháng thấy thật sự cần viết trọn bài từ điện thoại |
| 05 | Không D1/Sentry | Q&A form bị bỏ; bug report đi thẳng GitHub+Discord | Xuất hiện nhu cầu dữ liệu động thật |
| 06 | GPL-3.0 code / ARR content | Nhất quán hệ sinh thái repo; truyện & ảnh cần bảo hộ chặt | Mở public repo → cân nhắc thêm |
| 07 | Error pages tự phục vụ | Custom Errors của Cloudflare cần zone plan trả phí; site chạy trên Worker nên tự làm được | Nếu một ngày mua Pro vì lý do khác |
