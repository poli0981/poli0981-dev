# 17 — Bảo trì & vận hành

Mục tiêu: site "để yên vẫn sống". Tổng thời gian bảo trì định kỳ ~15–30 phút/tuần.

## 1. Lịch định kỳ

| Nhịp | Việc |
|---|---|
| **Hằng tuần** (thứ 2, sau khi Dependabot chạy) | Triage PR Dependabot: patch/minor xanh CI → merge; security alert → xử lý ≤ 48h. Liếc Discord `#site-reports` |
| **Hằng tháng** | `npm outdated` đọc report weekly; nâng minor còn sót; xem Web Analytics + Core Web Vitals; liếc Workers metrics (request, error rate); kiểm tra cron widgets còn chạy |
| **Hằng quý** | Nâng major có kế hoạch (Astro/Tailwind/Wrangler — đọc upgrade guide trước); chạy lại ma trận error test `09` §5; backup ngoài (§4) |
| **Hằng năm** | **Xoay secrets**: GITHUB_ISSUES_TOKEN, CLOUDFLARE_API_TOKEN, STEAM_API_KEY · cập nhật `Expires` trong security.txt · đọc lại 5 văn bản legal (đổi thì tăng `v` của legalAck) · kiểm tra thẻ thanh toán còn hạn cho auto-renew domain |

Đặt reminder: dùng chính hệ notify/cron GitHub Actions quen thuộc — workflow cron tháng/quý/năm bắn Discord nhắc việc (input sẵn trong repo `.github`).

## 2. Update playbook (major upgrade an toàn)

1. Branch `chore/upgrade-<pkg>-vX` → đọc CHANGELOG/upgrade guide chính thức.
2. `npm i <pkg>@latest` → chạy full CI local (`format/lint/check/knip/build`).
3. `wrangler versions upload` → preview URL → bấm qua 6 trang đại diện + search + form report.
4. Merge → deploy → chạy nhanh ma trận lỗi 3 dòng đầu (404/403/429).
5. Ghi 1 dòng vào `docs/00_INDEX.md` nếu có breaking change ảnh hưởng quyết định cũ.

## 3. Giám sát

- **Uptime** (tuỳ chọn, free): UptimeRobot/StatusCake ping `https://poli0981.dev/` 5 phút/lần → alert email/Discord. Đủ dùng, không cần status page.
- **Lỗi runtime**: Workers observability (đã bật trong wrangler.jsonc) → xem Logs khi có report; không cần Sentry ở quy mô này (ADR-05).
- **Cron widgets**: tự cảnh báo qua Discord khi fail 3 lần (11 §5).

## 4. Backup & khôi phục

- **Nguồn sự thật = Git** (nội dung + code). GitHub đã là bản sao thứ nhất; máy local là bản thứ hai.
- **Quý**: `git bundle create backup-YYYYQ.bundle --all` → cất vào ổ ngoài/cloud cá nhân (một lệnh, chứa toàn bộ lịch sử).
- KV widgets = dữ liệu tái sinh được, không cần backup. Secrets: lưu trong password manager (không chỉ trong Cloudflare).
- **Khôi phục thảm hoạ** (mất account/worker): repo + `07_CLOUDFLARE_SETUP.md` + `wrangler deploy` ⇒ site sống lại trong < 1 giờ. Domain là thứ duy nhất không thay được — vì thế 2FA + transfer lock + auto-renew là 3 khoá quan trọng nhất của cả hệ thống.

## 5. Trigger cần hành động (đặt sẵn ngưỡng)

| Sự kiện | Hành động |
|---|---|
| `src/assets/gallery/` > ~1GB hoặc build > 10 phút | Chuyển ảnh gốc sang R2 + biến gallery thành load từ R2 (kế hoạch ngủ trong ADR/backlog) |
| Muốn viết trọn bài từ điện thoại thường xuyên | Xét lại Keystatic (ADR-04) |
| Spam form vượt rate-limit thường xuyên | Nâng Turnstile lên chế độ khó hơn + thêm custom rule quốc gia cho /api |
| Repo chuyển public | Bật CodeQL (free cho public) vào caller CI; kiểm tra lại EXIF toàn bộ ảnh lịch sử; xoá secret khỏi lịch sử nếu từng lỡ (không nên có) |
| Đổi email/mất hộp thư đích | Cập nhật Email Routing + security.txt + legal contact ngay |
