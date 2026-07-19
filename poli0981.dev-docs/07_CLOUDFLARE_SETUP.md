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

## 9. Deploy Worker & custom domain

- Local: `npm run build && npx wrangler deploy` (lần đầu wrangler mở OAuth login).
- Gắn domain: Workers & Pages → worker `poli0981-dev` → Settings → **Domains & Routes → Add → Custom domain** → `poli0981.dev` (tự tạo DNS + cert). Thêm route redirect `www` nếu muốn: tạo thêm custom domain `www.poli0981.dev` và redirect 301 trong middleware về apex.
- Worker widgets: `cd workers/widgets && npx wrangler deploy` → kiểm tra Triggers có cron.

## 10. API token cho CI (least privilege)

My Profile → API Tokens → Create Token → Custom:
- Permissions: **Account → Workers Scripts → Edit** (+ Account → Workers KV Storage → Edit nếu CI cần seed KV).
- Account Resources: đúng account của bạn. TTL: 1 năm.
→ Lưu vào GitHub repo secret `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (bootstrap bằng script ở `08` §4).

## 11. Email Routing

Zone → Email → Email Routing → Enable:
- Custom address: `contact@poli0981.dev` → forward tới hộp thư thật (xác minh mail đích).
- Thêm `business@` nếu muốn tách mail sponsor. Catch-all: **Drop**.
- DNS MX/SPF do wizard tự thêm — đồng ý. (Chỉ nhận; khi nào cần *gửi* từ domain sẽ tính sau — chưa nằm trong scope.)

## 12. Web Analytics

Account → Analytics & Logs → **Web Analytics → Add site** → chọn zone (tự động qua proxy, không cần gắn script — chọn chế độ automatic). Không cookie, khớp Privacy Policy.

## 13. Checklist nghiệm thu

- [ ] `dig poli0981.dev` ra IP Cloudflare; DNSSEC = Success
- [ ] https:// bắt buộc, chứng chỉ hợp lệ, HSTS header có mặt
- [ ] Bot Fight ON · Managed WAF ON · (AI crawlers block ON nếu chọn)
- [ ] Rate limit rule active — test bằng script bắn 30 req/10s vào /api/ → bị block
- [ ] Turnstile hoạt động trên form report (site key đúng domain)
- [ ] Custom domain trỏ Worker, `www` redirect về apex
- [ ] Cron widgets chạy (Workers → widgets → Logs thấy execution)
- [ ] `contact@poli0981.dev` nhận mail test
- [ ] Web Analytics bắt đầu có số liệu sau ~24h
- [ ] Auto-renew ON + transfer lock ON + 2FA ON
