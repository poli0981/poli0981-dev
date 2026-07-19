# Third-Party Notices / Ghi nhận bên thứ ba

> **Ghi chú nội bộ:** file này gồm 2 phần — (A) phần khung render lên `/legal/third-party`, (B) bảng package **tự sinh** bằng `scripts/gen-notices.mjs` trong CI (dựa trên `license-checker`), CI fail nếu bảng lệch với lockfile. Đừng sửa tay phần B.

---

## English (khung phần A)

This site is built with open-source software. Each component below remains under its own license; full license texts ship with each package and in the repository's `THIRD-PARTY-NOTICES.md`.

## Tiếng Việt (khung phần A)

Trang web này được xây dựng bằng phần mềm mã nguồn mở. Mỗi thành phần dưới đây giữ nguyên giấy phép gốc của nó; toàn văn giấy phép đi kèm từng package và trong file `THIRD-PARTY-NOTICES.md` của repo.

---

## (B) Bảng thành phần — GENERATED, seed ban đầu

| Thành phần | Giấy phép | Ghi chú |
|---|---|---|
| Astro + @astrojs/* | MIT | framework |
| Svelte | MIT | islands |
| Tailwind CSS | MIT | styling |
| GSAP | GSAP Standard License (miễn phí, Webflow) | kiểm tra đúng tên license trong bản phát hành khi cài |
| Pagefind | MIT | search |
| @vite-pwa/astro / Workbox | MIT | offline |
| Zod | MIT | validation |
| sharp | Apache-2.0 | image pipeline |
| Wrangler | MIT/Apache-2.0 | tooling (dev) |
| Font: Bricolage Grotesque | SIL OFL 1.1 | |
| Font: Be Vietnam Pro | SIL OFL 1.1 | |
| Font: Literata | SIL OFL 1.1 | |
| Font: JetBrains Mono | SIL OFL 1.1 | |

**Dịch vụ hạ tầng** (không phải package, ghi nhận cho minh bạch): Cloudflare (hosting/CDN/analytics/Turnstile), GitHub (mã nguồn, issue), YouTube/Steam/GitHub API (widget dữ liệu công khai).

## Quy trình sinh tự động

```bash
node scripts/gen-notices.mjs          # ghi đè phần (B) từ npm ls --json + license-checker
node scripts/gen-notices.mjs --check  # CI: so khớp, lệch ⇒ exit 1
```

Quy tắc: package mới có license ngoài allowlist (MIT, Apache-2.0, ISC, BSD-2/3, OFL, GSAP Standard) ⇒ script cảnh báo đỏ, phải review tay trước khi merge.
