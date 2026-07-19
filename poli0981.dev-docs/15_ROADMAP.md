# 15 — Roadmap

Ước lượng theo "buổi tối" (~2–3h). Nguyên tắc quen thuộc: **xong P0 spikes mới viết feature** — spike nào fail thì sửa kế hoạch khi chưa tốn công.

## P0 — Spikes (làm trước tiên, ~3–4 buổi)

| # | Spike | Cách làm | Tiêu chí đạt |
|---|---|---|---|
| S1 | **Pipeline sống end-to-end** | Mua domain (07 §1) → scaffold `create-cloudflare` Astro → `wrangler deploy` → gắn custom domain → caller CI/deploy stub chạy | Push 1 commit ⇒ site đổi trên `poli0981.dev` trong <3 phút |
| S2 | **Font tiếng Việt** | Cấu hình Fonts API 4 font, subset `latin+vietnamese`; trang test chứa chuỗi đủ dấu ("ắ ằ ẳ ẵ ặ ế ệ ễ ỡ ợ ự ữ Đ…") ở mọi weight | Render đúng trên Android + iPhone thật, không fallback lệch baseline, tổng 2 file first-paint <90KB |
| S3 | **Error handling sau edge** | Set `not_found_handling: "404-page"`; middleware trả 403/429 từ asset prerender; test qua domain thật (không phải localhost) | Ma trận `09` §5 pass các dòng 404/403/429 |
| S4 | **CSP không vỡ tính năng** | Bật CSP built-in + directive `06` §1; chạy thử View Transitions, 1 animation GSAP, Pagefind search, YouTube facade | Console 0 lỗi CSP; search hoạt động (nhớ `wasm-unsafe-eval`) |

## P1 — Nền móng + nội dung lõi (~6–8 buổi)

- Design tokens + Base layout + Header/Footer/TabBar + theme/lang toggle + Waveline.
- Content Collections + schemas + templates; trang: Home (chưa widget), About, Blog (index/bài/tag), Stories (index/reader/ReadingControls/CW), Q&A, Links, Legal ×5 + LegalGateSheet.
- Trang lỗi 404/500/403/429 + middleware headers/denylist/rate-limit.
- Migrate: viết 2–3 bài blog đầu + 1 truyện ngắn để có nội dung thật khi launch.
- **Launch nội bộ cuối P1** (site đã dùng được).

## P2 — Hoàn thiện trải nghiệm (~5–6 buổi)

- Pagefind search modal · RSS ×3 · sitemap/hreflang/JSON-LD · OG image tự sinh.
- Gallery + lightbox + strip-exif/check-exif scripts.
- Gaming + Dev/uses; widgets worker (YouTube/Steam/GitHub) + `/api/widgets`.
- Bug report pipeline đầy đủ (10) + issue template.
- Offline service worker + trang /offline (chưa game).
- Lighthouse CI warn-mode.

## P3 — Gia vị (rảnh thì làm)

- Mini-game Skull Hop (09 §4) · `npm run new:post` · trang /now cadence tháng · easter egg konami/ASCII skull trong console (`console.log` banner) · dòng thời tiết footer nếu vẫn thích.

## P4 — Launch công khai

- [ ] Checklist `06` §8 (security) + `07` §13 (Cloudflare) + `09` §5 (errors) pass
- [ ] 13 §7 (SEO một lần) xong
- [ ] Đọc lại 5 văn bản legal, điền {{EFFECTIVE_DATE}}, xoá ghi chú nội bộ
- [ ] Test 2 thiết bị thật + 1 máy lạ (bạn bè) — thu 1 vòng feedback
- [ ] Tag `v1-launch`, đăng giới thiệu lên các kênh (dùng notify.py 😄), thêm link site vào bio YouTube/GitHub/Discord

## Sau v1 — backlog để ngỏ

Keystatic (ADR-04, xét lại sau 1–2 tháng dùng thật) · bot Telegram capture · locale `ja` · R2 cho gallery (>1GB) · repo public `poli0981/legal` · trang /support (Ko-fi) · Giscus nếu đổi ý về comment.
