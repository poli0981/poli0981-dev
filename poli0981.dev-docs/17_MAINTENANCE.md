# 17 — Bảo trì & vận hành

Mục tiêu: site "để yên vẫn sống". Tổng thời gian bảo trì định kỳ ~15–30 phút/tuần.

## 1. Lịch định kỳ

| Nhịp | Việc |
|---|---|
| **Hằng tuần** (thứ 2, sau khi Dependabot chạy) | Triage PR Dependabot: patch/minor xanh CI → merge; security alert → xử lý ≤ 48h. Liếc Discord `#site-reports` |
| **Hằng tháng** | `npm outdated` đọc report weekly; nâng minor còn sót; **nâng tay `@typescript/native`** (Dependabot bỏ qua alias `npm:`) và xem TS 7.1 đã có JS API chưa (`02` §8); xem Web Analytics + Core Web Vitals; liếc Workers Logs (lọc `level: error`) + dashboard admin (trạng thái cron widgets, secret thiếu); SonarCloud không có issue mới trên `main` |
| **Hằng quý** | Nâng major có kế hoạch (Astro/Tailwind/Wrangler — đọc upgrade guide trước); chạy lại ma trận error test `09` §5; backup ngoài (§4) |
| **Hằng năm** | **Xoay secrets**: GITHUB_ISSUES_TOKEN (repo `site-reports`), GITHUB_CONTENT_TOKEN + GITHUB_PUBLISH_TOKEN (admin), GATE_SECRET (vô hiệu mọi vé cổng — làm lúc ít khách), STEAM_API_KEY, SONAR_TOKEN · rà `ADMIN_EMAILS` + policy Access · cập nhật `Expires` trong security.txt · đọc lại 5 văn bản legal (đổi thì tăng `v` của legalAck) · kiểm tra thẻ thanh toán còn hạn cho auto-renew domain |

Đặt reminder: dùng chính hệ notify/cron GitHub Actions quen thuộc — workflow cron tháng/quý/năm bắn Discord nhắc việc (input sẵn trong repo `.github`).

## 2. Update playbook (major upgrade an toàn)

1. Branch `chore/upgrade-<pkg>-vX` → đọc CHANGELOG/upgrade guide chính thức.
2. `npm i <pkg>@latest` → chạy full CI local (`format/lint/check/knip/build`).
3. Mở PR → CI (`build` + smoke) + SonarCloud xanh; Workers Builds upload version preview của nhánh → bấm qua 6 trang đại diện + search + form report (dashboard → Versions → alias của nhánh).
4. Squash-merge → kiểm `/api/health` trả đúng commit (Workers Builds không deploy ⇒ `wrangler versions deploy`) → chạy nhanh ma trận lỗi 3 dòng đầu (404/403/429).
5. Ghi vào `CHANGELOG.md`; ghi 1 dòng vào `poli0981.dev-docs/00_INDEX.md` nếu có breaking change ảnh hưởng quyết định cũ.

**Rollback**: `npx wrangler versions list` → `npx wrangler versions deploy <id-cũ>@100% --yes` (hoặc `wrangler rollback`). Secret mới đặt sau version đó sẽ không có trong version cũ — đặt lại nếu cần.

## 3. Giám sát

- **Uptime** (tuỳ chọn, free): UptimeRobot/StatusCake ping `https://poli0981.dev/` 5 phút/lần → alert email/Discord. Đủ dùng, không cần status page.
- **Lỗi runtime**: Workers Logs (log JSON có `event`/`ray`, `06` §10) → tra theo Ray ID mà người dùng gửi kèm báo lỗi; không cần Sentry ở quy mô này (ADR-05).
- **Đang chạy bản nào**: `curl https://poli0981.dev/api/health` → `version.id` + `version.commit`; dashboard admin hiện cùng thông tin.
- **Admin**: `/admin/activity/` (audit log 90 ngày + commit repo content) — liếc khi nghi có thao tác lạ.
- **Cron widgets**: tự cảnh báo qua Discord khi fail 3 lần (11 §5).

## 4. Backup & khôi phục

- **Nguồn sự thật = Git** (nội dung + code). GitHub đã là bản sao thứ nhất; máy local là bản thứ hai.
- **Quý**: `git bundle create backup-YYYYQ.bundle --all` → cất vào ổ ngoài/cloud cá nhân (một lệnh, chứa toàn bộ lịch sử).
- **R2 `poli0981-media`** (ảnh upload qua admin — *không* có trong Git): quý một lần sao ra ngoài, vd. `npx wrangler r2 object get poli0981-media/<key> --file …` theo danh sách `private/meta/*.json`, hoặc rclone với S3 API token chỉ-đọc.
- **KV**: widgets tái sinh được; `denylist` và `audit:*` nên xuất định kỳ: `npx wrangler kv key get --binding KV denylist --preview false > denylist.json` và `npx wrangler kv key list --binding KV --prefix audit: --preview false > audit.json`.
- Secrets: lưu trong password manager (không chỉ trong Cloudflare).
- **Khôi phục thảm hoạ** (mất account/worker): repo + `07_CLOUDFLARE_SETUP.md` + `wrangler deploy` ⇒ site sống lại trong < 1 giờ. Domain là thứ duy nhất không thay được — vì thế 2FA + transfer lock + auto-renew là 3 khoá quan trọng nhất của cả hệ thống.

## 5. Trigger cần hành động (đặt sẵn ngưỡng)

| Sự kiện | Hành động |
|---|---|
| `src/assets/gallery/` > ~1GB hoặc build > 10 phút | Album mới đã dùng ảnh R2 qua admin; chuyển dần album cũ sang `gallery-photos/<album>.json` |
| Cổng Turnstile gây phiền / nghi chặn nhầm bot tốt | Kill switch: `GATE_MODE: "off"` (deploy). Kiểm Transform Rule `x-verified-bot` còn tồn tại (`wrangler tail`) |
| Gần hết 5.000 biến đổi Images/tháng | Upload trùng không tốn thêm; nếu vẫn thiếu thì bật Images Paid ($0.50/1.000) — ghi vào `16` trước |
| Muốn viết trọn bài từ điện thoại thường xuyên | Dùng admin `admin.poli0981.dev` (đã có) |
| Spam form vượt rate-limit thường xuyên | Nâng Turnstile lên chế độ khó hơn + thêm custom rule quốc gia cho /api |
| Version sai lên production (PR được deploy, regression) | Rollback ngay (§2), rồi kiểm Deploy command của Workers Builds (`07` §9) |
| Bị khoá ngoài admin (Access/`ADMIN_EMAILS`) | `wrangler secret put ADMIN_EMAILS` với email đúng; kiểm policy Access; denylist có chặn nhầm IP mình không (`wrangler kv key get … denylist`) |
| Đổi email/mất hộp thư đích | Cập nhật alias Google Workspace + `src/lib/links.ts` + security.txt + legal contact ngay (`07` §11) |
