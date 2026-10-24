# 06 — Security

Mức đe doạ thực tế của site cá nhân: bot spam form, scraper, script-kiddie quét lỗ hổng, thi thoảng một đợt flood. Thiết kế dưới đây "vừa đủ" cho mức đó — không zero-trust enterprise.

## 1. HTTP headers (`src/lib/security-headers.ts`, gắn ở worker entry cho mọi response)

| Header | Giá trị |
|---|---|
| Content-Security-Policy (meta) | **CSP API built-in của Astro** — tự hash mọi script/style của build (cả bootstrap theme inline, `src/lib/theme.ts`). Directive thêm: `img-src 'self' data:` (ảnh widget đi qua `/ext-img`, không còn host ngoài); `frame-src` YouTube nocookie + Turnstile; `connect-src 'self'` + Turnstile + Web Analytics; `script-src` thêm **`'wasm-unsafe-eval'`** (Pagefind); `base-uri 'none'`; `form-action 'self'`; `object-src 'none'`. `scripts/check-csp-hashes.mjs` (sau build) fail nếu một script inline thiếu hash hoặc không trang nào được kiểm |
| Content-Security-Policy (header) | `frame-ancestors 'none'` — directive này không có hiệu lực trong meta nên đi bằng header; hai CSP cộng dồn, không ghi đè hash |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains; preload` |
| X-Content-Type-Options · X-Frame-Options | `nosniff` · `DENY` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| Cross-Origin-Opener-Policy | `same-origin` (admin thêm `Cross-Origin-Resource-Policy: same-origin`) |

Không đặt COEP (không cần SharedArrayBuffer; đặt sẽ vỡ embed YouTube).

## 2. Denylist IP & rate limit

```
request → src/worker.ts (mọi route, cả trang tĩnh)
  1. denylist: MỘT khoá KV "denylist" = [{cidr, reason?, until?, added?}]
     đọc tối đa 1 lần/phút/isolate (+ cacheTtl 60 s ở colo); IP hoặc dải CIDR (IPv4/IPv6),
     mục hết hạn bị bỏ qua → khớp ⇒ 403 (trang 09 §2, no-store) · KV lỗi ⇒ bỏ qua (fail-open, có log)
  2. app Astro — middleware, nếu path bắt đầu /api/<group>:
       Workers Rate Limiting binding theo nhóm (src/lib/ratelimit.ts), khoá "<group>:<ip>"
       (IPv6 gộp theo /64):
         report → RL_REPORT 5/60s · gate → RL_GATE 30/60s · admin → RL_ADMIN 120/60s
         còn lại → RL_API 120/60s · widgets → không giới hạn (cache edge 5 phút)
       vượt ⇒ 429 + Retry-After: 60 (trang 09 §2)
```

- Một khoá thay vì `denylist:<ip>`: tra cứu tốn như nhau dù IP nào hỏi (một lần đọc/phút/isolate) và chặn được cả dải. Quản lý ở **admin → Bảo mật** (`/admin/security/`): thêm kèm lý do + thời hạn (1 giờ … 30 ngày, hoặc đến khi gỡ), gỡ, có audit log. Không cho chặn dải chứa IP của chính admin — danh sách áp cho mọi host, kể cả admin. Thay đổi có hiệu lực trong khoảng một phút.
- Binding rate limit đếm **theo từng colo** và chỉ cho `period` 10 hoặc 60 s → lớp mềm; lớp cứng là zone rate-limit rule (07 §6). `namespace_id` của mỗi binding chỉ cần duy nhất trong account (981001–981004).
- Chặn quốc gia/ASN hay danh sách rất dài: dùng WAF custom rule / IP List (07 §7).

## 3. Form duy nhất: /api/report (bug)

Rate limit §2 → body đọc có trần **32 KB** (khai `Content-Length` lớn hơn hoặc stream vượt ⇒ 413, không đọc hết) → validate Zod (`10` §3) → Turnstile `siteverify` (`success` + `action: "report"` + `hostname`) → issue ở repo **private** `poli0981/site-reports` + Discord (`allowed_mentions` rỗng, `@mention` trong nội dung bị vô hiệu) — mỗi lời gọi ra ngoài có timeout 10 s. Sai bất kỳ bước nào: 400/413/429, message chung chung, không lộ chi tiết.

Các API khác cũng có trần body: `/api/gate` 8 KB; JSON của admin 512 KB và bắt buộc `Content-Type: application/json`; upload ảnh 20 MB (từ chối theo `Content-Length` trước khi parse form).

## 3b. Cổng Turnstile trước mọi trang (`src/lib/gate/`, `src/worker.ts`)

Khách chưa có "vé" thì mọi trang HTML trả về **trang xác minh** thay cho nội dung; qua Turnstile → vé 48 giờ.

```
GET trang → worker entry (assets.run_worker_first)
  cổng tắt (GATE_MODE ≠ on/force, hoặc thiếu GATE_SECRET / TURNSTILE_SECRET) → phục vụ bình thường
  không phải GET · host admin.* · /api/ · /admin · /media/ · /legal/ · /en/legal/   → bỏ qua cổng
  header x-verified-bot = "true" (Transform Rule, 07 §8b)                            → bỏ qua cổng
  thiếu header x-verified-bot (rule chưa có) → MỞ cổng + log lỗi (trừ GATE_MODE=force)
  cookie __Host-gate hợp lệ (HMAC, chưa hết hạn)                                    → phục vụ bình thường
  /pagefind/*                                                                        → 403 (index chứa toàn văn)
  trang thật 200 text/html → giữ nguyên <head>, thay <body> bằng giao diện xác minh,
                             bỏ script src/modulepreload/JSON-LD; 200 + no-store + noindex
  còn lại (3xx/304/404/không phải HTML)                                              → trả nguyên
gate.js → Turnstile (action "gate") → POST /api/gate (RL_GATE, Sec-Fetch-Site same-origin)
        → siteverify (success + action + hostname) → Set-Cookie __Host-gate=v1.<exp>.<nonce>.<sig>
          (Max-Age 172800, Secure, HttpOnly, SameSite=Lax, Path=/) → reload
```

- Đứng ngoài cổng ngay ở tầng asset (không gọi Worker): `/_astro/*`, `/og/*`, favicon, `sw.js`, `skullhop.js`, `gate.js`, `/offline*`, robots, sitemap, RSS, `/.well-known/*` — xem `run_worker_first` trong `wrangler.jsonc`.
- Giữ `<head>` thật ⇒ preview link (kể cả bot không "verified" như Zalo) vẫn đúng title/ảnh; trả **200** vì nhiều bot preview bỏ qua mã khác 2xx.
- Vé chỉ chứa hạn + nonce + chữ ký (43 ký tự base64url), không định danh; đổi `GATE_SECRET` ⇒ mọi vé cũ mất hiệu lực ngay.
- **Fail-closed**: cookie sai định dạng (vd. chữ ký base64 lệch độ dài) bị coi như không có vé; nếu chính bước quyết định/vẽ cổng ném lỗi ⇒ 503 + `Retry-After`, **không bao giờ** trả trang thật (lỗi bypass 10/2026 — có test hồi quy và bước smoke riêng).
- **Kill switch**: đặt `GATE_MODE` về `"off"` trong `wrangler.jsonc` (deploy) — hoặc sửa biến trên dashboard để tắt tức thì (lần deploy sau sẽ ghi đè).
- Test: `npm test` (cookie/chính sách) + `npm run smoke` (pha 2 ép cổng bằng secret test của Turnstile, chạy trọn luồng).

## 4. Secrets & quyền tối thiểu

| Secret | Nơi | Phạm vi |
|---|---|---|
| TURNSTILE_SECRET | worker site | form báo lỗi + cổng |
| GATE_SECRET | worker site | ký vé cổng (≥ 32 byte ngẫu nhiên) |
| GITHUB_ISSUES_TOKEN | worker site | Fine-grained PAT: **chỉ repo `poli0981/site-reports`, chỉ Issues R/W**, hạn ≤ 1 năm |
| DISCORD_WEBHOOK_BUG | worker site | webhook 1 kênh riêng |
| GITHUB_CONTENT_TOKEN | worker site | Fine-grained PAT: **chỉ `poli0981/content`, Contents R/W** (admin lưu bài) |
| GITHUB_PUBLISH_TOKEN | worker site | Fine-grained PAT: **chỉ `poli0981/poli0981-dev`, Actions R/W** (nút Xuất bản). Thiếu ⇒ admin dùng tạm token nội dung và cảnh báo "một token" |
| ADMIN_EMAILS | worker site | email được vào admin, phân cách dấu phẩy — **bắt buộc**, thiếu là không ai vào được |
| STEAM_API_KEY, STEAM_ID64, DISCORD_WEBHOOK_CI | worker widgets | key Steam mặc định; webhook cảnh báo cron |
| SONAR_TOKEN | GitHub Actions secret | phân tích SonarCloud (`08` §0) |

Không secret nào trong repo/`wrangler.jsonc`; `.dev.vars` nằm trong `.gitignore`. Admin chỉ hiện **tên** secret đã/chưa đặt (`/admin/security/`), không bao giờ hiện giá trị.

`wrangler secret put` tạo một version mới dựa trên version **mới nhất** đã upload và deploy nó ngay: chỉ đặt secret khi version mới nhất là bản của `main` (không phải bản preview của một PR) — kiểm bằng `wrangler versions list` trước.

## 5. Nội dung nhúng bên thứ ba

- YouTube: **click-to-load facade** — thumbnail do worker widgets mirror vào KV và site phục vụ qua `/ext-img/yt/<id>` (icon Steam qua `/ext-img/steam/…`), nên trình duyệt khách **không gọi** `i.ytimg.com`/Steam trước khi bấm; bấm mới tạo iframe `youtube-nocookie.com`. `/ext-img` chỉ nhận đúng 2 mẫu đường dẫn, chỉ đọc KV (không bao giờ fetch theo yêu cầu của khách), trả kèm `CSP: sandbox`.
- Ngoại lệ duy nhất cho script bên ngoài: beacon Cloudflare Web Analytics (`static.cloudflareinsights.com`, báo về `cloudflareinsights.com`) — `type=module`, không cookie, chỉ có trong bản build production của Workers Builds (`src/components/CfBeacon.astro`). Turnstile chỉ tải khi trang xác minh/form báo lỗi cần. Còn lại: không font/CDN/script ngoài — mọi asset self-host.

## 6. Supply chain (repo public từ 10/2026)

- **Cài đặt**: `npm ci --ignore-scripts` từ lockfile ở CI; `scripts/check-install-scripts.mjs` liệt kê gói có install script và fail khi xuất hiện gói mới ngoài allowlist (esbuild/workerd/sharp chạy được nhờ optionalDependencies, không cần script).
- **Quét**: Dependabot (alerts + security updates, **cooldown 3 ngày** — không đề xuất bản vừa phát hành, chặn kiểu Shai-Hulud) · `npm audit --omit=dev --audit-level=high` trong CI (fail = chặn merge) · OSV-Scanner (SARIF, hằng tuần + khi đổi lockfile) · **CodeQL** (free vì repo public) · **SonarCloud** (quality gate trên PR) · Snyk (GitHub app).
- Mỗi PR Dependabot: đọc changelog trước khi merge major; patch/minor merge khi CI xanh (08 §6). Khi `main` dính advisory mới, mọi PR đỏ ở bước audit ⇒ vá gộp một PR rồi đóng các PR bị thay thế.

## 7. security.txt (`public/.well-known/security.txt`)

```
Contact: mailto:security@poli0981.dev
Contact: mailto:contact@poli0981.dev
Expires: 2027-07-01T00:00:00Z
Preferred-Languages: vi, en
Canonical: https://poli0981.dev/.well-known/security.txt
Policy: https://github.com/poli0981/poli0981-dev/blob/main/SECURITY.md
```

## 8. Checklist hardening

- [x] securityheaders.com đạt A (chấp nhận trừ điểm COEP)
- [x] CSP không chặn: Pagefind (wasm), Turnstile, iframe nocookie, beacon; `check-csp-hashes` xanh trên mọi trang
- [x] Cookie cổng sai định dạng ⇒ vẫn gặp cổng (test + smoke); cổng lỗi ⇒ 503, không lộ trang
- [ ] Gửi form report với Turnstile sai → 400; spam 6 req/phút → 429 trang custom
- [ ] IP test trong denylist (thêm từ `/admin/security/`, hạn 1 giờ) → 403 trang custom
- [ ] `wrangler secret list` khớp đúng bảng §4, không thừa
- [ ] Zone settings khớp `07` checklist

## 9. Admin (`admin.poli0981.dev`)

```
admin.poli0981.dev ─▶ Cloudflare Access (policy email) ─▶ Worker
  src/lib/hosts.ts   : host admin chỉ phục vụ /admin*, /api/admin*, /media/*; còn lại 301 về site;
                       poli0981.dev/admin* ⇒ 301 sang host admin, /api/admin* ⇒ 404
  src/middleware.ts  : mọi route /admin* & /api/admin* (so theo routePattern) phải có
                       Cf-Access-Jwt-Assertion hợp lệ — jose + JWKS của team, aud = ACCESS_AUD,
                       iss = ACCESS_TEAM_DOMAIN, RS256, chưa hết hạn, phát hành ≤ 24 giờ
                       (maxTokenAge); email ∈ ADMIN_EMAILS (BẮT BUỘC — trống ⇒ từ chối tất cả)
                       request ghi: Sec-Fetch-Site same-origin + Origin đúng (chống CSRF same-site),
                       JSON phải có Content-Type application/json
                       RL_ADMIN; Cache-Control no-store; X-Robots-Tag noindex; CORP same-origin
```

- **Vì sao host riêng**: cùng origin thì một lỗi XSS ở trang công khai có thể gọi API admin bằng cookie Access. Khác origin + kiểm `Sec-Fetch-Site` ⇒ không.
- **Ba lớp**: Access chặn ở edge; Worker tự kiểm JWT (preview URL/workers.dev đều tắt, header giả ⇒ 403 — smoke test kiểm cả JWT giả); `ADMIN_EMAILS` quyết định ai được thao tác — policy Access lỡ mở rộng cũng không mở admin.
- **Khuyến nghị cấu hình Access** (dashboard, `07` §13b): bắt buộc MFA ở IdP/Access, session duration ≤ 24 giờ (khớp `maxTokenAge`), bật *binding cookie*, cookie `SameSite=Lax` trở lên.
- **Hai token GitHub** (fine-grained — quyền của một token áp cho *mọi* repo nó được chọn, nên không thể "ghi repo này, chỉ dispatch repo kia" bằng một token): `GITHUB_CONTENT_TOKEN` (chỉ `poli0981/content`, Contents R/W) và `GITHUB_PUBLISH_TOKEN` (chỉ `poli0981/poli0981-dev`, Actions R/W — không có Contents ⇒ lộ cũng không đẩy được code). Đọc trạng thái (PR, check, gitlink) không cần quyền vì hai repo đều public. Thiếu quyền ⇒ admin báo rõ token nào cần quyền gì (header `X-Accepted-GitHub-Permissions`). Xuất bản đi qua `content-bump.yml` (GITHUB_TOKEN) + CI `build` bắt buộc; diff có file ngoài `.md/.json` (vd. `.mdx` — chạy code lúc build) ⇒ không auto-merge.
- **Audit log**: mỗi thao tác (lưu/xoá nội dung, upload/sửa alt/xoá ảnh, lưu/xoá album, xuất bản, chặn/bỏ chặn IP) ghi một khoá KV `audit:*` (90 ngày) kèm email, đích và commit — xem ở `/admin/activity/` cạnh lịch sử commit của repo content.
- **Upload ảnh**: kiểm magic bytes (không SVG), ≤ 20 MB, id = SHA-256 ⇒ trùng thì không biến đổi lại; biến thể + master tái mã hoá (mất EXIF/GPS), không giữ file gốc; `/media` chỉ phục vụ key biến thể, `CSP: sandbox`. Không xoá được ảnh còn được nội dung dùng.
- **Preview Markdown** render trong `<iframe sandbox="allow-same-origin" srcdoc>`: không `allow-scripts` nên không gì trong Markdown chạy được (kể cả `onerror`), không điều hướng được trang admin; frame kế thừa CSP của trang. Không cần thư viện sanitize.
- **Phiên hết hạn**: client gọi API với `redirect: "manual"` — Access trả redirect về trang đăng nhập hoặc middleware trả 403 ⇒ hiện banner "Đăng nhập lại"; bản nháp đang viết được tự lưu cục bộ (`localStorage`) và hỏi khôi phục.
- Dev (`astro dev`) dùng danh tính giả `dev@localhost` — chỉ khi `import.meta.env.DEV` (luôn false trong bản build).

## 10. Log & giới hạn vận hành

- **Log có cấu trúc** (`src/lib/log.ts`): một dòng JSON mỗi sự kiện — `level`, `event` (vd. `gate.failed`, `denylist.blocked`, `admin.access_denied`, `admin.content_saved`, `ratelimit.exceeded`, `report.github_failed`, `widgets.source_failed`), `ray`, `method`, `path`, lỗi đã serialize. Workers Logs (`observability.logs`, giữ 7 ngày, query string bị che) tự index các field; traces lấy mẫu 10%. Không log IP vào issue/Discord.
- **Phiên bản đang chạy**: binding `version_metadata` + commit build (`__BUILD_COMMIT__`) ⇒ `/api/health`, dashboard admin và log lỗi edge đều nói đúng bản nào đang phục vụ.
- **Trang 500** hiện Cloudflare Ray ID (worker đóng dấu vào `#ref`) — trùng field `ray` trong log, người dùng đọc/gửi kèm báo lỗi là tra được ngay.
- **Timeout**: mọi `fetch` ra GitHub/Discord/YouTube/Steam có `AbortSignal.timeout` (10–15 s) — một API treo không giữ request hay isolate.
