# 14 — Ngân sách hiệu năng

Đo trên: Moto G Power giả lập / Lighthouse mobile / mạng 4G throttle. Vi phạm budget = bug, xử lý trước khi thêm tính năng mới.

## 1. Budget

| Chỉ số | Mục tiêu | Trần |
|---|---|---|
| Lighthouse Performance (mobile) | ≥ 95 | 90 |
| LCP | < 2.0s | 2.5s |
| CLS | < 0.05 | 0.1 |
| INP | < 200ms | 200ms |
| JS ship / trang thường | < 40KB gzip | 70KB |
| JS ship / trang có island nặng (hero, reader) | < 90KB gzip | 120KB |
| Font tổng (2 file first-paint) | < 90KB | 120KB |
| HTML / trang | < 60KB | 100KB |
| Ảnh LCP (hero/cover) | < 120KB AVIF | 200KB |

## 2. Kỷ luật để giữ budget

- **Islands discipline**: mặc định `.astro` thuần; island chỉ khi có tương tác thật, ưu tiên `client:visible`/`client:idle`, cấm `client:load` trên site public (kể cả ThemeToggle — CSS đã hiện đúng icon theo `data-theme-pref`, nên runtime Svelte không cần tranh băng thông với first paint). GSAP import động trong island, không vào bundle chung.
- **Font**: chỉ 4 family, subset latin+vietnamese, preload đúng 2 file, `size-adjust` fallback để CLS≈0. Literata chỉ nạp ở trang đọc.
- **Ảnh**: mọi ảnh qua Astro Image (AVIF ưu tiên), `loading=lazy` trừ LCP (`fetchpriority=high`), khai width/height luôn.
- **CSS**: Tailwind v4 tự purge; grain/scanline bằng 1 PNG nhỏ + CSS, không canvas chạy nền. CSS của mỗi trang nằm inline trong HTML (`build.inlineStylesheets: "always"`, ~9 KB brotli) — không còn request CSS chặn render, first paint không phải đợi thêm một vòng mạng.
- **Third-party = 0** ở first paint (YouTube facade, widget đọc KV nội bộ). Beacon Web Analytics là module script (tải defer, ~10 KB) nên không chặn render; nó chỉ có trong bản build production (không có trong Lighthouse CI).

## 3. Kiểm tra

- Local: `npm run build && npx astro preview` + Lighthouse trong DevTools cho 4 trang đại diện: `/`, 1 bài blog, 1 chương truyện, `/gallery/<album>`.
- CI: `lighthouse.yml` (`treosh/lighthouse-ci-action`, preset **mobile** như bảng §1) chạy trên bản build, assert budget — chỉ warn, không block, để tránh flaky chặn deploy; đỏ 2 lần liên tiếp thì xử lý. Đo qua nginx có sẵn trên runner (gzip, cấu hình ngay trong bước "Start compressing proxy"): `astro preview` không nén gì, còn edge Cloudflare nén brotli mọi response dạng chữ ở production — đo thẳng preview thì điện thoại giả lập phải tải gấp 3–4 lần số byte thật (HTML trang chủ 108 KB thay vì ~25 KB). gzip to hơn brotli chút ít nên số đo vẫn hơi bi quan so với production.
- Islands thêm từ 10/2026 đều nhỏ và `client:idle`: ThemeToggle, Waveline ở hero trang chủ, SearchModal/MenuSheet; Waveline dưới màn hình đầu là `client:visible`. Admin là trang on-demand riêng, không tính vào budget site.
- Thực địa: Cloudflare Web Analytics có Core Web Vitals thật của khách — xem hằng tháng (lịch `17`).
