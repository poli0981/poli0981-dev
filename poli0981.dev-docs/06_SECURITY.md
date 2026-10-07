# 06 — Security

Mức đe doạ thực tế của site cá nhân: bot spam form, scraper, script-kiddie quét lỗ hổng, thi thoảng một đợt flood. Thiết kế dưới đây "vừa đủ" cho mức đó — không zero-trust enterprise.

## 1. HTTP headers (middleware `src/middleware.ts`, áp cho mọi response HTML)

| Header | Giá trị |
|---|---|
| Content-Security-Policy | Dùng **CSP API built-in của Astro** (stable từ v6, bật trong `astro.config`) — tự hash script/style của build. Bổ sung directive thủ công: `img-src 'self' data: https://i.ytimg.com; frame-src https://www.youtube-nocookie.com; connect-src 'self'; script-src` thêm **`'wasm-unsafe-eval'`** (Pagefind chạy WebAssembly — thiếu là search chết, xem P0 Spike 4); `frame-ancestors 'none'`; `base-uri 'none'`; `form-action 'self'` |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains; preload` (TLD .dev vốn nằm trong HSTS preload — header để nhất quán) |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| Cross-Origin-Opener-Policy | `same-origin` |

Không đặt COEP (không cần SharedArrayBuffer; đặt sẽ vỡ embed YouTube).

## 2. Middleware — denylist & rate limit (trả trang lỗi custom của mình)

```
request → IP = cf-connecting-ip
  1. KV get denylist:<ip>  → có ⇒ 403 (trang 09 §2)
  2. nếu path bắt đầu /api/<group>:
       Workers Rate Limiting binding theo nhóm (src/lib/ratelimit.ts), khoá "<group>:<ip>"
       (IPv6 gộp theo /64):
         report → RL_REPORT 5/60s · gate → RL_GATE 30/60s · admin → RL_ADMIN 120/60s
         còn lại → RL_API 120/60s · widgets → không giới hạn (cache edge 5 phút)
       vượt ⇒ 429 + Retry-After: 60 (trang 09 §2)
  3. tiếp tục; gắn headers §1 vào response
```

- Binding đếm **theo từng colo** (không toàn cục) và chỉ cho `period` 10 hoặc 60 s → đây là lớp mềm chống lạm dụng; lớp cứng là zone rate-limit rule (07 §6). Không còn ghi KV cho mỗi request API (bộ đếm KV cũ đọc-rồi-ghi, không nguyên tử, và có thể ném lỗi khi burst vì KV chỉ cho ~1 ghi/giây/khoá).
- `namespace_id` của mỗi binding chỉ cần duy nhất trong account (981001–981004).
- Quản lý denylist: `wrangler kv key put --binding=KV "denylist:1.2.3.4" "spam 2026-08"` — kèm ghi chú lý do. Khoá chỉ khớp **đúng IP**; chặn dải (CIDR), quốc gia hay ASN thì dùng WAF IP List / zone custom rule (07 §7) vì middleware chỉ nên giữ list ngắn.

## 3. Form duy nhất: /api/report (bug)

Turnstile bắt buộc → verify `siteverify` với `TURNSTILE_SECRET` → validate payload bằng Zod (đúng schema `10` §3, size ≤ 32KB) → rate limit §2 → xử lý. Sai bất kỳ bước nào: 400/403/429, message chung chung, không lộ chi tiết.

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
- Vé chỉ chứa hạn + nonce + chữ ký, không định danh; đổi `GATE_SECRET` ⇒ mọi vé cũ mất hiệu lực ngay.
- **Kill switch**: đặt `GATE_MODE` về `"off"` trong `wrangler.jsonc` (deploy) — hoặc sửa biến trên dashboard để tắt tức thì (lần deploy sau sẽ ghi đè).
- Test: `npm test` (cookie/chính sách) + `npm run smoke` (pha 2 ép cổng bằng secret test của Turnstile, chạy trọn luồng).

## 4. Secrets & quyền tối thiểu

| Secret | Nơi | Phạm vi |
|---|---|---|
| TURNSTILE_SECRET | worker site | — |
| GITHUB_ISSUES_TOKEN | worker site | Fine-grained PAT: **chỉ repo này, chỉ Issues R/W**, hạn 1 năm, đặt lịch xoay ở `17` |
| DISCORD_WEBHOOK_BUG | worker site | webhook 1 kênh riêng |
| STEAM_API_KEY, STEAM_ID64 | worker widgets | key Steam mặc định |
| CLOUDFLARE_API_TOKEN | GitHub Actions secret | scope Workers Scripts:Edit + account đúng (07 §10) |

Không secret nào trong repo/`wrangler.jsonc`; `.dev.vars` nằm trong `.gitignore`.

## 5. Nội dung nhúng bên thứ ba

- YouTube: **click-to-load facade** (thumb tĩnh từ i.ytimg.com) → bấm mới tạo iframe `youtube-nocookie.com`. Vừa nhanh vừa gọn Privacy Policy.
- Ngoại lệ duy nhất cho script bên ngoài: beacon Cloudflare Web Analytics (`static.cloudflareinsights.com`, báo về `cloudflareinsights.com`) — `type=module` nên tải trễ, không cookie, chỉ có trong bản build production của Workers Builds (`src/components/CfBeacon.astro`). CSP mở đúng 2 host đó (`script-src` + `connect-src`). Còn lại: không font/CDN/script ngoài — mọi asset self-host.

## 6. Supply chain (repo private — lưu ý riêng)

- **CodeQL không free cho repo private** → thay bằng: Dependabot (alerts + security updates, free cả private) + bước CI `npm audit --omit=dev --audit-level=high` + `osv-scanner` (action chính thức) chạy weekly.
- `npm ci` từ lockfile; script `preinstall` bị chặn bằng `.npmrc: ignore-scripts=true` cho CI, chỉ bật lại cho gói cần build (sharp) qua allowlist — cân bằng chống supply-chain-worm kiểu Shai-Hulud.
- Mỗi PR của Dependabot: đọc changelog trước khi merge major; patch/minor auto-merge khi CI xanh (08 §6).

## 7. security.txt (`public/.well-known/security.txt`)

```
Contact: mailto:security@poli0981.dev
Contact: mailto:contact@poli0981.dev
Expires: 2027-07-01T00:00:00Z
Preferred-Languages: vi, en
Canonical: https://poli0981.dev/.well-known/security.txt
Policy: https://github.com/poli0981/poli0981-dev/blob/main/SECURITY.md
```

## 8. Checklist hardening trước launch

- [ ] securityheaders.com đạt A (chấp nhận trừ điểm COEP)
- [ ] CSP không chặn: View Transitions, GSAP, Pagefind (wasm), ảnh ytimg, iframe nocookie
- [ ] Gửi form report với Turnstile sai → 403; spam 6 req/phút → 429 trang custom
- [ ] IP test trong denylist → 403 trang custom
- [ ] `wrangler secret list` khớp đúng bảng §4, không thừa
- [ ] Zone settings khớp `07` checklist
