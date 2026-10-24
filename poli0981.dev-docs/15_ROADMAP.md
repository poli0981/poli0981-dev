# 15 — Roadmap

Ước lượng theo "buổi tối" (~2–3h). Nguyên tắc quen thuộc: **xong P0 spikes mới viết feature** — spike nào fail thì sửa kế hoạch khi chưa tốn công.

Trạng thái tại 2026-10-24 (v2.0.0): ✅ xong · 🟡 đang làm · ⬜ chưa.

## P0 — Spikes ✅

| # | Spike | Cách làm | Tiêu chí đạt | |
|---|---|---|---|---|
| S1 | **Pipeline sống end-to-end** | Mua domain (07 §1) → scaffold Astro → deploy → gắn custom domain → CI | Push 1 commit ⇒ site đổi trên `poli0981.dev` trong <3 phút | ✅ (Workers Builds) |
| S2 | **Font tiếng Việt** | Fonts API 4 font, subset `latin+vietnamese`; trang test đủ dấu ở mọi weight | Render đúng trên Android + iPhone thật, 2 file first-paint <90KB | ✅ |
| S3 | **Error handling sau edge** | `not_found_handling: "404-page"`; 403/429 từ asset prerender; test qua domain thật | Ma trận `09` §5 pass các dòng 404/403/429 | ✅ |
| S4 | **CSP không vỡ tính năng** | CSP built-in + directive `06` §1; Pagefind, YouTube facade, Turnstile | Console 0 lỗi CSP; search hoạt động (`wasm-unsafe-eval`) | ✅ (`check-csp-hashes` trong build) |

## P1 — Nền móng + nội dung lõi ✅

- Design tokens + Base layout + Header/Footer/TabBar + theme/lang toggle + Waveline.
- Content Collections + schemas + templates; trang: Home, About, Blog (index/bài/tag), Stories (index/reader/ReadingControls/CW), Q&A, Links, Legal ×5 + LegalGateSheet.
- Trang lỗi 404/500/403/429 + headers/denylist/rate-limit.
- Nội dung thật đầu tiên: bài blog + truyện "Đêm không tiếng".

## P2 — Hoàn thiện trải nghiệm ✅

- Pagefind search modal · RSS ×3 · sitemap/hreflang/JSON-LD · OG image tự sinh.
- Gallery + lightbox + strip-exif/check-exif scripts.
- Gaming + Dev/uses; widgets worker (YouTube/Steam/GitHub) + `/api/widgets`.
- Bug report pipeline đầy đủ (10) + issue template.
- Offline service worker + trang /offline.
- Lighthouse CI warn-mode.

## P3 — Gia vị ✅

- Mini-game Skull Hop (09 §4) · `npm run new:post` · trang /now · easter egg konami/ASCII skull trong console.

## P3.5 — Nền tảng & admin (10/2026) ✅

- Cổng Turnstile trước mọi trang (06 §3b) · admin `admin.poli0981.dev` (Access + JWT, R2 media, xuất bản qua workflow) · repo public.
- **v2.0.0**: Node 26 + TypeScript 7 · SonarCloud + test `node:test` (~99% dòng) · vá bypass cookie cổng · denylist CIDR · ảnh widget qua `/ext-img` · log JSON + version trên `/api/health` · báo lỗi vào repo private · palette Glacier Teal + theme theo hệ điều hành · sửa a11y/i18n · admin mới (tổng quan, hoạt động, bảo mật, audit log). Chi tiết: `CHANGELOG.md`.

## P4 — Launch công khai 🟡

- [x] Checklist `06` §8 (security) phần tự động (headers, CSP, cổng)
- [ ] Phần còn lại của `06` §8 + `07` §13 (Cloudflare) + `09` §5 (errors) chạy tay trên production
- [ ] 13 §7 (SEO một lần) xong
- [x] Văn bản legal có ngày hiệu lực (2026-10-24), không còn ghi chú nội bộ
- [ ] Test 2 thiết bị thật + 1 máy lạ (bạn bè) — thu 1 vòng feedback
- [ ] Đăng giới thiệu lên các kênh (dùng notify.py 😄), thêm link site vào bio YouTube/GitHub/Discord

## Hướng đi tiếp (sau v2.0)

| Hướng | Vì sao | Điều kiện |
|---|---|---|
| Gộp TypeScript về một bản 7.x | Bỏ alias `@typescript/native` + TS 6 | TS 7.1 có JS API; astro check / typescript-eslint / svelte2tsx hỗ trợ |
| Workers Builds riêng cho widgets worker | Hết deploy tay | Khi worker có thay đổi thường xuyên hơn |
| Backup định kỳ R2 + KV (denylist, audit) | Ảnh upload chỉ nằm ở R2 | Workflow cron dùng `wrangler r2 object get` / `kv key list` (17 §4) |
| Analytics Engine cho số liệu cổng/báo lỗi | Biết cổng chặn bao nhiêu, báo lỗi đến từ đâu | Không thêm cookie; giữ khớp Privacy Policy |
| Đếm lượt xem bằng Durable Object | Số đọc cho blog/truyện không cần dịch vụ ngoài | Cập nhật Privacy Policy trước |
| RSS full-content cho blog | Người đọc qua RSS | Truyện vẫn chỉ mô tả + link (ARR) |
| Locale `ja` | Seam i18n đã sẵn (`src/i18n/routing.ts`) | Có nội dung thật để dịch |
| Bình luận (Giscus) · trang /support (Ko-fi) | Tương tác/ủng hộ | Đổi D5; mở CSP cho host tương ứng |
