# poli0981.dev — Documentation Suite

- Phiên bản suite: **v1.0** · Ngày: 2026-07-17
- Repo: `poli0981/poli0981.dev` (private) · Domain: `poli0981.dev`
- Ngôn ngữ tài liệu: tiếng Việt (thuật ngữ kỹ thuật giữ tiếng Anh). Riêng `12_LEGAL/` soạn song ngữ EN/VI vì là văn bản sẽ render trên site.
- Tài liệu gốc: `poli0981.dev_proposal.md` (bản đề xuất v0.1, đã được duyệt).

## Danh sách file

| # | File | Nội dung |
|---|---|---|
| 00 | 00_INDEX.md | File này — mục lục + nhật ký quyết định |
| 01 | 01_PRD.md | Mục tiêu, phạm vi, yêu cầu, bảng truy vết requirement |
| 02 | 02_ARCHITECTURE.md | Stack, cấu trúc repo, rendering, i18n, wrangler, ADR |
| 03 | 03_DESIGN_SYSTEM.md | Token màu/chữ/spacing, motion, component inventory |
| 04 | 04_CONTENT_MODEL.md | Content Collections, schema, quy trình viết, EXIF |
| 05 | 05_SITEMAP_UX.md | Route map, wireframe từng trang, legal gate, mobile nav |
| 06 | 06_SECURITY.md | Headers/CSP, form, rate limit, secrets, supply chain |
| 07 | 07_CLOUDFLARE_SETUP.md | **Hướng dẫn set Cloudflare từng bước** |
| 08 | 08_CI_CD.md | Workflows, permissions, deploy, Dependabot, hooks |
| 09 | 09_ERROR_PAGES_OFFLINE.md | 404/403/429/5xx/offline + cách test |
| 10 | 10_BUG_REPORT_PIPELINE.md | Console capture → GitHub Issue + Discord |
| 11 | 11_WIDGETS_INTEGRATIONS.md | YouTube/Steam/GitHub widgets, cron worker, KV |
| 12 | 12_LEGAL/ | 5 văn bản song ngữ (xem dưới) |
| 13 | 13_SEO_RSS_OG.md | Meta, hreflang, sitemap, RSS, OG image, AI crawlers |
| 14 | 14_PERF_BUDGET.md | Ngân sách hiệu năng + kỷ luật islands |
| 15 | 15_ROADMAP.md | P0 spikes, phase P1–P4, launch checklist |
| 16 | 16_COST.md | Chi phí chốt + ngưỡng cần theo dõi |
| 17 | 17_MAINTENANCE.md | Lịch bảo trì, update playbook, backup |

`12_LEGAL/`: `TERMS_OF_USE.md` · `PRIVACY_POLICY.md` · `DISCLAIMER.md` · `THIRD_PARTY_NOTICES.md` · `CONTENT_LICENSE.md`

## Nhật ký quyết định (đã chốt 2026-07-17)

| # | Quyết định | Chọn |
|---|---|---|
| D1 | Framework/hosting | Astro 7 + Svelte 5 islands, Cloudflare Workers + Static Assets |
| D2 | Quy trình viết | **Markdown + Git thuần** (không Keystatic). Capture mobile: GitHub web editor + `draft: true` |
| D3 | Q&A | FAQ tĩnh + liên hệ qua social/`contact@` — **không form, không D1** |
| D4 | Ngôn ngữ | VI (mặc định, không prefix) + EN (`/en/`) |
| D5 | Bình luận blog | Tắt (không Giscus) |
| D6 | Legal canonical | Trên site tại `/legal/*`; repo public mirror `poli0981/legal` = tuỳ chọn sau |
| D7 | Giấy phép | Code GPL-3.0 · Nội dung All Rights Reserved |
| D8 | Error pages | Tự phục vụ từ app (không mua zone Pro) |
| D9 | API ngoài | Không weather/map; widget YouTube + Steam + GitHub qua cron worker |
| D10 | Data services | Chỉ **KV** (v1). Không D1, không R2 cho tới khi gallery > ~1 GB |

## Cách dùng suite

1. Đọc `15_ROADMAP.md` trước — bắt đầu bằng 4 P0 spikes.
2. `07_CLOUDFLARE_SETUP.md` làm một lần khi mua domain, tick checklist cuối file.
3. Mỗi file có mục **Trạng thái/Checklist** riêng khi áp dụng — suite này là nguồn sự thật, cập nhật khi quyết định thay đổi.
4. Lưu ý chung: mọi phiên bản package trong suite đã verify tới 2026-07-17; khi scaffold thực tế, lấy bản patch mới nhất trong cùng major.
