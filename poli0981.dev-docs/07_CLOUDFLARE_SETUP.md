# 07 — Hướng dẫn set Cloudflare (làm một lần, theo thứ tự)

Điều kiện: tài khoản Cloudflare có Workers Paid ($5). Mọi mục dưới nằm trong **zone Free** — không mua thêm gói zone nào.

## 1. Mua domain

Dashboard → **Domain Registration → Register Domains** → tìm `poli0981.dev` → giá at-cost hiển thị ngay (~US$12–13/năm) → thanh toán. WHOIS redaction tự bật. Zone `poli0981.dev` tự tạo với nameserver Cloudflare.

Ngay sau khi mua: **Domain Registration → Manage → poli0981.dev**:
- Auto-renew: **ON** (kiểm tra thẻ còn hạn — ghi vào lịch bảo trì `17`).
- Transfer lock: **ON**.

## 2. Bảo vệ tài khoản

My Profile → Authentication: bật **2FA** (TOTP + lưu recovery codes offline). Tạo thói quen: mọi thao tác registrar đều qua tài khoản chính, không API.

## 3. DNS & DNSSEC

- Zone → **DNS → Settings → Enable DNSSEC** → chờ trạng thái Success (registrar cùng nhà nên DS record tự cấu hình).
- Record cho site sẽ do **Workers custom domain** tự tạo khi làm bước 9 — không tự thêm A/CNAME tay.
- Xoá record thừa nếu có; mọi record web phải **Proxied (đám mây cam)**.

## 4. SSL/TLS

Zone → SSL/TLS:
- Overview: mode **Full (Strict)** (với Workers là mặc định đúng).
- Edge Certificates: Always Use HTTPS **ON** · Minimum TLS **1.2** · TLS 1.3 **ON** · Automatic HTTPS Rewrites **ON**.

## 5. Bot & WAF cơ bản

Zone → Security:
- **Bots → Bot Fight Mode: ON**. (Tuỳ chọn cùng chỗ: **Block AI Scrapers and Crawlers: ON** — khuyến nghị bật vì truyện/ảnh là ARR; đi kèm robots.txt ở `13` §5.)
- **WAF → Managed rules**: bật Cloudflare Managed Ruleset (free ruleset).
- Settings → Security Level: Medium · Browser Integrity Check: ON.

## 6. Rate limiting rule (free có 1 rule) — lớp ngoài cho /api/*

Security → WAF → Rate limiting rules → Create:
- Name: `api-outer-limit`
- If: `URI Path starts with /api/`
- Rate: **20 requests / 10 seconds** per IP → Action: **Block**, duration 1 phút (mitigation timeout theo option gói free).
(Lớp trong Worker vẫn đếm 5/phút để trả trang 429 đẹp — rule này chỉ hứng flood thô.)

## 7. Custom rules (free có ~5 rule) — chặn IP/dải/quốc gia khi cần

Security → WAF → Custom rules. Mẫu để dành, chỉ bật khi có sự cố:
- Chặn dải IP: `(ip.src in {203.0.113.0/24 198.51.100.7})` → Block.
- Chặn ASN: `(ip.src.asnum eq 64496)` → Block hoặc Managed Challenge.
- Chặn quốc gia khỏi /api: `(ip.src.country eq "XX" and starts_with(http.request.uri.path, "/api/"))` → Managed Challenge.
Danh sách IP dài → Manage Account → Configurations → **Lists** → tạo IP List `blocked_ips` rồi rule dùng `ip.src in $blocked_ips`.
Ghi chú: các rule này khi khớp sẽ hiện trang chặn mặc định của Cloudflare (zone free không đổi được) — chấp nhận vì là traffic độc hại; trang 403/429 "đẹp" của mình phục vụ từ Worker cho trường hợp mềm hơn (denylist KV, rate-limit trong app).

## 8. Turnstile

Account Home → **Turnstile → Add widget**: domain `poli0981.dev`, mode **Managed**, loại Invisible/Non-interactive tuỳ test. Lưu **Site Key** vào code (public), **Secret Key** → `wrangler secret put TURNSTILE_SECRET`.

Cổng xác minh (06 §3b) **dùng lại widget này** với `action: "gate"` (form báo lỗi dùng `action: "report"`; server kiểm tra action + hostname nên token không dùng chéo được). Secret ký vé: `GATE_SECRET` (chuỗi ngẫu nhiên ≥ 32 byte, không ai cần biết) — `openssl rand -base64 48 | npx wrangler secret put GATE_SECRET`.

## 8b. Transform Rule — đánh dấu bot hợp lệ cho cổng

Rules → **Transform Rules → Modify Request Header** → Create:
- Tên: `verified-bot-flag` · When: *Custom filter* `(http.host eq "poli0981.dev")`
- Then: **Set dynamic** · Header `x-verified-bot` · Value `to_string(cf.client.bot)`

Rule ghi đè header cho **mọi** request (client không giả được). Worker thấy `"true"` ⇒ bot đã được Cloudflare xác thực (Googlebot, Bingbot, bot preview Facebook/Discord/X…) ⇒ đi thẳng. Không thấy header ⇒ coi như rule chưa có ⇒ cổng tự mở (fail-open) và log lỗi — tránh khoá công cụ tìm kiếm. Giữ **Block AI bots** bật (§5): bot AI "verified" cũng có `cf.client.bot`, nên chúng phải bị chặn từ WAF chứ không trông vào cổng.

## 9. Deploy Worker & custom domain

- Local: `npm run build && npx wrangler deploy` (lần đầu wrangler mở OAuth login).
- Gắn domain: Workers & Pages → worker `poli0981-dev` → Settings → **Domains & Routes → Add → Custom domain** → `poli0981.dev` (tự tạo DNS + cert). Thêm route redirect `www` nếu muốn: tạo thêm custom domain `www.poli0981.dev` và redirect 301 trong middleware về apex.
- Worker widgets: `cd workers/widgets && npx wrangler deploy` → kiểm tra Triggers có cron.

## 10. API token cho CI (least privilege)

My Profile → API Tokens → Create Token → Custom:
- Permissions: **Account → Workers Scripts → Edit** (+ Account → Workers KV Storage → Edit nếu CI cần seed KV).
- Account Resources: đúng account của bạn. TTL: 1 năm.
→ Lưu vào GitHub repo secret `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (bootstrap bằng script ở `08` §4).

## 11. Email (Google Workspace)

Mail của domain chạy trên **Google Workspace** (MX → `aspmx.l.google.com`, SPF `include:_spf.google.com`, DKIM `google._domainkey`, DMARC `p=none`) — **không** dùng Cloudflare Email Routing (hai bên không thể cùng giữ MX). Một hộp thư, các địa chỉ dưới đây là *alias* (Admin console → Users → Alternate email addresses):

| Địa chỉ | Dùng cho | Xuất hiện ở |
|---|---|---|
| `contact@` | Liên hệ chung (fallback) | Footer, /links, /now, trang 403 |
| `security@` | Báo lỗ hổng | `/.well-known/security.txt`, `SECURITY.md` |
| `privacy@` | Yêu cầu về dữ liệu cá nhân | Privacy §7–8 |
| `legal@` | Vấn đề pháp lý | Terms |
| `copyright@` · `dmca@` · `takedown@` | Xin phép · khiếu nại bản quyền · yêu cầu gỡ khác | Licenses, `CONTENT-LICENSE.md` |
| `collab@` · `press@` · `sponsor@` | Hợp tác · báo chí · tài trợ | /links, Q&A, footer |
| `code@` · `games@` | Mã nguồn · key game/playtest | /dev, /gaming, /links |

Địa chỉ công khai trên site lấy từ `src/lib/links.ts` (`CONTACT_EMAILS`); địa chỉ pháp lý nằm trực tiếp trong `content/legal/*.md`. Đổi/bỏ alias → sửa cả hai chỗ + `security.txt` (xem 17 §runbook).

## 12. Web Analytics

Account → Analytics & Logs → **Web Analytics** → site `poli0981.dev` ở chế độ **JS snippet (manual)** — *tắt* tự động chèn, nếu không mỗi trang sẽ có 2 beacon (và beacon tự chèn là script inline mà CSP chặn).

- Snippet nằm ở `src/components/CfBeacon.astro` (token là site tag công khai, không phải secret), chèn vào `<head>` của `BaseLayout` + `ErrorLayout`.
- Chỉ render khi build trên Workers Builds nhánh `main` (`WORKERS_CI=1` + `WORKERS_CI_BRANCH=main` → `PUBLIC_CF_BEACON`), nên CI/Lighthouse/preview không làm bẩn số liệu. Ép bật/tắt: biến build `PUBLIC_CF_BEACON=true|false`.
- CSP: `script-src https://static.cloudflareinsights.com`, `connect-src https://cloudflareinsights.com`.
- Không cookie, khớp Privacy Policy §2.

## 13b. Admin — `admin.poli0981.dev`

1. Workers → `poli0981-dev` → Domains & Routes → **Custom domain** `admin.poli0981.dev` (cùng Worker).
2. Zero Trust → Access → Applications → **Self-hosted**, domain `admin.poli0981.dev` (cả host), policy Allow theo email chủ site (IdP Google hoặc One-time PIN). Lấy **team domain** + **AUD tag** → `vars.ACCESS_TEAM_DOMAIN` / `vars.ACCESS_AUD` trong `wrangler.jsonc` (không phải secret).
3. Hai GitHub **fine-grained** PAT (hạn ≤ 1 năm; Settings → Developer settings → Fine-grained tokens):
   - *Content*: Repository access = **Only select repositories → `poli0981/content`**; Repository permissions → **Contents: Read and write** → `npx wrangler secret put GITHUB_CONTENT_TOKEN`.
   - *Publish*: Repository access = **Only select repositories → `poli0981/poli0981-dev`**; Repository permissions → **Actions: Read and write** → `npx wrangler secret put GITHUB_PUBLISH_TOKEN`.
   - Sửa quyền của token có sẵn không đổi giá trị token ⇒ không cần đặt lại secret. (Tuỳ chọn) `ADMIN_EMAILS` = danh sách email, phân cách dấu phẩy.
4. Repo `poli0981-dev` → Settings → Actions → General → bật **Allow GitHub Actions to create and approve pull requests** (cho `content-bump.yml`); quyền mặc định của GITHUB_TOKEN giữ **read**.
5. R2 `poli0981-media` (`wrangler r2 bucket create poli0981-media --location apac`), không bật public URL. Images binding không cần bật gì thêm (gói Free: 5.000 biến đổi/tháng).

## 13. Checklist nghiệm thu

- [ ] `dig poli0981.dev` ra IP Cloudflare; DNSSEC = Success
- [ ] https:// bắt buộc, chứng chỉ hợp lệ, HSTS header có mặt
- [ ] Bot Fight ON · Managed WAF ON · (AI crawlers block ON nếu chọn)
- [ ] Rate limit rule active — test bằng script bắn 30 req/10s vào /api/ → bị block
- [ ] Turnstile hoạt động trên form report (site key đúng domain)
- [ ] Custom domain trỏ Worker, `www` redirect về apex
- [ ] Cron widgets chạy (Workers → widgets → Logs thấy execution)
- [ ] `contact@` và `security@poli0981.dev` nhận mail test
- [ ] Web Analytics bắt đầu có số liệu sau ~24h
- [ ] Trình duyệt ẩn danh vào `/` → thấy bước xác minh rồi vào trang; `curl -s https://poli0981.dev/ | grep data-human-check` có kết quả; RSS/sitemap/trang pháp lý không bị chặn
- [ ] Search Console (URL Inspection → Test live URL) thấy trang thật; Facebook Sharing Debugger đúng title/ảnh
- [ ] `https://admin.poli0981.dev/` → đăng nhập Access → thấy admin; `curl -H 'cf-access-jwt-assertion: x' …/api/admin/content` (qua host chính) → 404/403
- [ ] Auto-renew ON + transfer lock ON + 2FA ON
