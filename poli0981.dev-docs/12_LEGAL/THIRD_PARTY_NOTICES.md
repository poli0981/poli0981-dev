# Third-Party Notices / Ghi nhận bên thứ ba

> **Ghi chú nội bộ:** file này gồm 2 phần — (A) phần khung render lên `/legal/third-party`, (B) bảng package **tự sinh** bằng `scripts/gen-notices.mjs` trong CI (đọc `package.json` của từng gói đã cài — không dùng `license-checker`), CI fail nếu bảng lệch với lockfile. Đừng sửa tay phần B.

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
node scripts/gen-notices.mjs          # ghi đè phần (B): dependency trực tiếp, license đọc từ node_modules/<pkg>/package.json
node scripts/gen-notices.mjs --check  # CI: so khớp, lệch ⇒ exit 1
node scripts/check-licenses.mjs       # CI: toàn bộ package-lock.json (transitive + binary mọi nền tảng)
```

Quy tắc (`scripts/license-policy.mjs`, dùng chung cho hai script): license ngoài allowlist (MIT, Apache-2.0, ISC, BSD-2/3, OFL-1.1, 0BSD, Unlicense, CC0-1.0, BlueOak-1.0.0, Python-2.0; biểu thức SPDX `OR`/`AND`/`WITH` được hiểu) ⇒ CI đỏ, phải review tay và ghi ngoại lệ **theo gói** kèm lý do (hiện có: MPL-2.0 của satori/resvg/lightningcss/axe-core, LGPL-3.0-or-later của libvips trong sharp — đều chỉ chạy lúc build/test). Gói không khai license cũng làm CI đỏ.
