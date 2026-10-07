# 16 — Chi phí (chốt theo quyết định D1–D10)

Tỷ giá tham khảo ~26.000 VND/USD, 2026-07.

## 1. Bảng chi phí

| Khoản | Chu kỳ | Số tiền | Trạng thái |
|---|---|---|---|
| Domain `poli0981.dev` (Cloudflare Registrar, at-cost, WHOIS redaction free) | năm | **~$12–13** (~320–340k VND) — số chính xác hiện khi search trong dashboard | **Phát sinh mới duy nhất** |
| Cloudflare Workers Paid | tháng | $5 | Đã có sẵn — site nằm trong hạn mức |
| KV · Turnstile · Web Analytics · Email Routing · WAF free · Bot Fight | — | $0 | Free / trong gói |
| GitHub private repo + Actions + Dependabot | — | $0 | Free plan (2.000 phút Actions/tháng — CI dùng ~5–10%) |
| Astro/Svelte/Tailwind/GSAP/font/Pagefind | — | $0 | OSS |
| R2 | `poli0981-media` | $0 | Ảnh upload qua admin (biến thể AVIF/WebP + master). Free 10 GB lưu trữ, 1M thao tác ghi, 10M đọc/tháng — đọc hầu hết trúng Cache API ở edge |
| Images (binding) | biến đổi lúc upload | $0 | Free 5.000 biến đổi duy nhất/tháng (mỗi ảnh ≈ 6), vượt thì $0.50/1.000. Ảnh trùng (cùng hash) không biến đổi lại |
| Zone Pro / Sentry / CMS bên thứ ba | — | $0 | **Cố ý không dùng** — admin tự làm (Access + GitHub API), ảnh dùng R2 + Images của chính Cloudflare |

**Tổng phát sinh mới: ~$12–13/năm.** Tổng vận hành thực (gồm Workers đã trả): **~$72–73/năm (~1,9 triệu VND)**.

## 2. Ngưỡng cần để mắt (thứ duy nhất có thể sinh tiền thêm)

| Hạn mức | Gói hiện tại | Site này dự kiến | Khi nào lo |
|---|---|---|---|
| Worker requests | 10 triệu/tháng trong gói Paid | mỗi lượt xem trang + mỗi ảnh `/media` = 1 request (cổng Turnstile chạy trước mọi trang); hashed asset/feeds/OG **không tính** | Viral rất lớn — vẫn còn xa ngưỡng ở quy mô site cá nhân |
| Cloudflare Access | 50 người dùng miễn phí | 1 (chủ site) | Không áp dụng |
| Images (binding) | 5.000 biến đổi duy nhất/tháng | ≈ 6 / ảnh upload; ảnh trùng = 0 | Upload > ~800 ảnh mới/tháng |
| KV reads/writes | hạn mức Paid rộng | cron 45' + vài GET | Không |
| GitHub Actions phút | 2.000/tháng (private) | ~100–200 | Nếu sau này thêm job nặng — theo dõi ở Settings → Billing |
| Domain renew | — | $12–13/năm | Thẻ hết hạn ⇒ mất domain — auto-renew ON + lịch nhắc (17) |

## 3. Quy tắc chi tiêu

Mọi dịch vụ trả phí mới (dù $1) phải thêm dòng vào bảng §1 + lý do vào 00_INDEX nhật ký quyết định trước khi bật. Mặc định của dự án: **$0 là một tính năng.**
