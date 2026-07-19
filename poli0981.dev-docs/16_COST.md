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
| R2 | — | $0 | Chưa dùng (kích hoạt khi gallery >1GB, free tới 10GB) |
| Zone Pro / Sentry / CMS / CDN ảnh | — | $0 | **Cố ý không dùng** — có phương án thay thế trong suite |

**Tổng phát sinh mới: ~$12–13/năm.** Tổng vận hành thực (gồm Workers đã trả): **~$72–73/năm (~1,9 triệu VND)**.

## 2. Ngưỡng cần để mắt (thứ duy nhất có thể sinh tiền thêm)

| Hạn mức | Gói hiện tại | Site này dự kiến | Khi nào lo |
|---|---|---|---|
| Worker requests | 10 triệu/tháng trong gói Paid | vài nghìn–chục nghìn (static assets **không tính**) | Viral rất lớn + nhiều hit /api — gần như không xảy ra |
| KV reads/writes | hạn mức Paid rộng | cron 45' + vài GET | Không |
| GitHub Actions phút | 2.000/tháng (private) | ~100–200 | Nếu sau này thêm job nặng — theo dõi ở Settings → Billing |
| Domain renew | — | $12–13/năm | Thẻ hết hạn ⇒ mất domain — auto-renew ON + lịch nhắc (17) |

## 3. Quy tắc chi tiêu

Mọi dịch vụ trả phí mới (dù $1) phải thêm dòng vào bảng §1 + lý do vào 00_INDEX nhật ký quyết định trước khi bật. Mặc định của dự án: **$0 là một tính năng.**
