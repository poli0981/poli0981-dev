# 10 — Bug report pipeline (console error → GitHub Issue + Discord)

Repo private ⇒ khách không mở issue trực tiếp được. Pipeline này là kênh báo lỗi duy nhất cho visitor, và cũng tiện cho chính mình.

## 1. Client — thu console error

- Module `src/lib/bugbuffer.ts` (nạp trong Base layout, ~0.5KB):
  - Lắng nghe `window.onerror` + `unhandledrejection` (+ `console.error` wrap nhẹ).
  - **Ring buffer 20 mục**, chỉ trong RAM, mất khi rời trang; không gửi đi đâu nếu người dùng không bấm gửi.
  - Mỗi mục: `{ts, type, message, source, line, col, stackTop3}`.
  - **Scrub trước khi hiển thị/gửi**: cắt query string khỏi URL, cắt stack còn 3 frame, mask chuỗi giống email/token (regex), giới hạn message 500 ký tự.

## 2. UX — nút "Báo lỗi" (footer mọi trang, và trang 404/500)

Dialog gồm: textarea mô tả (bắt buộc, ≥ 10 ký tự) → checkbox **"Đính kèm log lỗi console (n mục)"** mặc định bật, kèm nút *Xem trước* mở đúng nội dung sẽ gửi → dòng tự đính: route, UA, viewport, theme, locale, mã tham chiếu (nếu đến từ trang 500) → Turnstile → Gửi. Thành công: "Đã gửi — cảm ơn bạn!". Thất bại: hiện thông báo + nút copy nội dung để gửi qua Discord.

## 3. API contract — `POST /api/report`

```jsonc
{
  "description": "string 10..2000",
  "console": [ { "ts": 0, "type": "error", "message": "...", "source": "...", "line": 0, "stackTop3": "..." } ],  // ≤ 20 mục, optional
  "meta": { "route": "/truyen/x", "ua": "...", "viewport": "390x844", "theme": "dark", "locale": "vi", "ref": "a1b2c3d4?" },
  "turnstileToken": "..."
}
```

Worker xử lý theo thứ tự: Turnstile verify → Zod validate (fail 400) → rate-limit KV (5/phút/IP, fail 429) → **tạo GitHub Issue** → **Discord webhook** → 201. Nếu GitHub API lỗi: vẫn bắn Discord (kèm full payload) và trả 202 — không mất báo cáo.

## 4. GitHub Issue

`POST /repos/poli0981/poli0981.dev/issues` với `GITHUB_ISSUES_TOKEN` (fine-grained, chỉ Issues R/W):
- title: `[web-report] <60 ký tự đầu của description>`
- labels: `bug`, `from-site`
- body: render đúng cấu trúc template §5 (description → meta table → console trong code block).

## 5. Issue template dùng chung — `.github/ISSUE_TEMPLATE/bug_report.yml`

```yaml
name: Bug report
description: Báo lỗi website (kèm console error)
labels: [bug]
body:
  - type: textarea
    id: what
    attributes: { label: Chuyện gì xảy ra?, description: Mô tả + các bước tái hiện }
    validations: { required: true }
  - type: input
    id: route
    attributes: { label: Trang (route), placeholder: /truyen/... }
  - type: textarea
    id: console
    attributes:
      label: Console errors
      description: Mở DevTools → Console, dán lỗi vào đây (nút "Báo lỗi" trên site tự điền phần này)
      render: shell
    validations: { required: true }
  - type: input
    id: env
    attributes: { label: Môi trường, placeholder: "Chrome 138 / Android 16 / 390x844 / dark / vi" }
  - type: input
    id: ref
    attributes: { label: Mã tham chiếu (nếu có, từ trang 500) }
```

## 6. Discord webhook

Kênh riêng `#site-reports` trong server repo. Embed: màu `--color-horror`, title = issue title, field route/UA, link issue. (Tái dùng format của `notify.py` cho đồng bộ.)

## 7. Privacy & giới hạn

- Những gì được thu khi người dùng bấm gửi phải liệt kê đúng trong Privacy Policy (`12/PRIVACY_POLICY.md` §"Bug report") — không thu gì ngoài danh sách đó; **không thu IP vào issue** (IP chỉ dùng thoáng qua cho rate-limit).
- Payload ≤ 32KB; đính kèm ảnh **không** hỗ trợ ở v1 (tránh lưu trữ media) — hướng dẫn người dùng gửi ảnh qua Discord nếu cần.

## 8. Test

- [ ] Lỗi giả (`throw` trong console) xuất hiện trong preview đính kèm
- [ ] Gửi hợp lệ → issue mở đúng template + Discord nhận embed trong < 5s
- [ ] Turnstile token sai → 403; 6 lần/phút → 429; payload 40KB → 400
- [ ] Tắt GITHUB token (mô phỏng lỗi) → vẫn nhận Discord + client báo "đã ghi nhận"
