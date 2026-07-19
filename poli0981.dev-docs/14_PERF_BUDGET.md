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

- **Islands discipline**: mặc định `.astro` thuần; island chỉ khi có tương tác thật, ưu tiên `client:visible`/`client:idle`, cấm `client:load` trừ ThemeToggle. GSAP import động trong island, không vào bundle chung.
- **Font**: chỉ 4 family, subset latin+vietnamese, preload đúng 2 file, `size-adjust` fallback để CLS≈0. Literata chỉ nạp ở trang đọc.
- **Ảnh**: mọi ảnh qua Astro Image (AVIF ưu tiên), `loading=lazy` trừ LCP (`fetchpriority=high`), khai width/height luôn.
- **CSS**: Tailwind v4 tự purge; grain/scanline bằng 1 PNG nhỏ + CSS, không canvas chạy nền.
- **Third-party = 0** ở first paint (YouTube facade, widget đọc KV nội bộ).

## 3. Kiểm tra

- Local: `npm run build && npx astro preview` + Lighthouse trong DevTools cho 4 trang đại diện: `/`, 1 bài blog, 1 chương truyện, `/gallery/<album>`.
- CI (P2): job Lighthouse CI chạy trên preview build, assert budget bảng §1 — chỉ warn, không block, để tránh flaky chặn deploy; đỏ 2 lần liên tiếp thì xử lý.
- Thực địa: Cloudflare Web Analytics có Core Web Vitals thật của khách — xem hằng tháng (lịch `17`).
