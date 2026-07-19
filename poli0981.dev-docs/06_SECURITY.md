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
  1. KV get denylist:<ip-or-cidr-match>  → có ⇒ 403 (trang 09 §2)
  2. nếu path bắt đầu /api/:
       KV rl:<ip> counter (cửa sổ 60s, giới hạn 5)
       vượt ⇒ 429 + Retry-After (trang 09 §2)
  3. tiếp tục; gắn headers §1 vào response
```

- KV eventual-consistency → giới hạn có thể "mềm" vài request ở nhiều colo — chấp nhận được cho chống abuse; lớp cứng hơn là zone rate-limit rule (07 §6).
- Quản lý denylist: `wrangler kv key put --binding=KV "denylist:1.2.3.0/24" "spam 2026-08"` — kèm ghi chú lý do. Chặn theo quốc gia/ASN thì dùng zone custom rule (07 §7) vì middleware chỉ nên giữ list ngắn.

## 3. Form duy nhất: /api/report (bug)

Turnstile bắt buộc → verify `siteverify` với `TURNSTILE_SECRET` → validate payload bằng Zod (đúng schema `10` §3, size ≤ 32KB) → rate limit §2 → xử lý. Sai bất kỳ bước nào: 400/403/429, message chung chung, không lộ chi tiết.

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
- Không font/CDN/script bên ngoài nào khác — mọi asset self-host.

## 6. Supply chain (repo private — lưu ý riêng)

- **CodeQL không free cho repo private** → thay bằng: Dependabot (alerts + security updates, free cả private) + bước CI `npm audit --omit=dev --audit-level=high` + `osv-scanner` (action chính thức) chạy weekly.
- `npm ci` từ lockfile; script `preinstall` bị chặn bằng `.npmrc: ignore-scripts=true` cho CI, chỉ bật lại cho gói cần build (sharp) qua allowlist — cân bằng chống supply-chain-worm kiểu Shai-Hulud.
- Mỗi PR của Dependabot: đọc changelog trước khi merge major; patch/minor auto-merge khi CI xanh (08 §6).

## 7. security.txt (`public/.well-known/security.txt`)

```
Contact: mailto:contact@poli0981.dev
Expires: 2027-07-01T00:00:00Z
Preferred-Languages: vi, en
Canonical: https://poli0981.dev/.well-known/security.txt
```

## 8. Checklist hardening trước launch

- [ ] securityheaders.com đạt A (chấp nhận trừ điểm COEP)
- [ ] CSP không chặn: View Transitions, GSAP, Pagefind (wasm), ảnh ytimg, iframe nocookie
- [ ] Gửi form report với Turnstile sai → 403; spam 6 req/phút → 429 trang custom
- [ ] IP test trong denylist → 403 trang custom
- [ ] `wrangler secret list` khớp đúng bảng §4, không thừa
- [ ] Zone settings khớp `07` checklist
