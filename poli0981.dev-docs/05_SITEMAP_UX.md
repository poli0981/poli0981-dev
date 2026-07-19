# 05 — Sitemap & UX spec từng trang

## 1. Route map

| Route (vi) | EN | Nguồn dữ liệu |
|---|---|---|
| `/` | `/en/` | mới nhất từ blog+stories, KV widgets |
| `/about` | `/en/about` | md đơn |
| `/projects`, `/projects/[slug]` | `/en/...` | collection projects |
| `/blog`, `/blog/[slug]`, `/blog/tag/[tag]` | `/en/...` | blog |
| `/truyen`, `/truyen/[series]/[slug]` | `/en/stories/...` | stories |
| `/gallery`, `/gallery/[album]` | `/en/...` | gallery |
| `/gaming` · `/dev` (kèm `/dev/uses`) | `/en/...` | md + widgets |
| `/qa` · `/links` | `/en/...` | faq + data links |
| `/legal/{terms,privacy,disclaimer,third-party,licenses}` | `/en/legal/...` | 12_LEGAL |
| `/rss.xml`, `/blog/rss.xml`, `/truyen/rss.xml`, `/sitemap-index.xml`, `/robots.txt`, `/.well-known/security.txt` | | |
| `/404`, `/500`, `/403`, `/429`, `/offline` | song ngữ trong 1 trang | 09 |

## 2. Wireframe chính (mobile-first)

**Trang chủ**
```
[Header: logo ── theme ─ lang ─ ☰]
  KOKONE / SkullMute            ← display font, 2 dòng
  ~ dev & storyteller ~
  ────────╮╭╮╭────────          ← Waveline (signature)
  [Mới viết]  PostCard ×3 (blog+truyện trộn, mới nhất trước)
  [Đang xem gì] WidgetLatestVideo (thumb + title, click-to-load)
  [Đang chơi gì] WidgetNowPlaying (tên game + giờ 2 tuần)
  [Lối tắt] Projects · Truyện · Gallery · Links
[Footer: social icon · Báo lỗi · Legal · © ]
[TabBar: Home | Blog | Truyện | Menu]      ← chỉ mobile
```

**Bài blog**: breadcrumb → h1 → meta (ngày · tag · x phút đọc) → cover → Prose 65ch → Waveline → prev/next → "Bài này chỉ có tiếng Việt" nếu thiếu bản dịch.

**Story reader** (khác blog):
```
[thanh mảnh: ← series | tiêu đề chương | Aa]   ← Aa mở ReadingControls
[progress bar 2px sticky top]
[ContentWarning nếu có → bấm mới hiện nội dung]
  Literata 68ch, 1.125–1.25rem
[Chương trước ─ Mục lục series ─ Chương sau]
```
ReadingControls: cỡ chữ S/M/L · nền Giấy/Sepia/Tối (độc lập theme site) · lưu localStorage `reader`.

**Gallery**: lưới masonry 2 cột mobile / 3–4 desktop; album card = cover + tiêu đề + năm; trong album: lightbox vuốt, caption, đếm x/y.

**Gaming**: hero kênh (banner + subscribe button link) → 3 video mới (YouTube RSS, thumbnail click-to-load nocookie) → "Đang chơi" (Steam) → khối "Mình cover gì": VN · JRPG · indie/psychological horror (kèm dòng: không FPS/competitive) → link Discord gaming server. Được phép scanline nhẹ (03 §4).

**Dev**: intro → grid project featured → /uses (bảng: PC specs i7-14700KF · RTX 5080 16GB · 32GB DDR5 · 2K 240Hz · Win 11 Pro; software: OBS, Resolve Studio, VS Code…) → hoạt động GitHub (widget).

**Q&A**: accordion theo group (Kênh/Dev/Cá nhân) → khối Liên hệ: "Nhanh nhất: Discord · Business: contact@poli0981.dev · Toàn bộ: /links".

**Links**: danh sách dọc lớn (icon + tên + mô tả 1 dòng + nút): YouTube, Discord gaming, Discord repo, GitHub, Telegram, Bluesky, Mastodon, X, Facebook page. `rel="me"` cho Mastodon verify.

## 3. Điều hướng

- Desktop header: Blog · Truyện · Projects · Gaming · Gallery · About ─ [search / theme / lang].
- Mobile: TabBar 4 mục; "Menu" mở sheet chứa phần còn lại + theme/lang/search.
- Search: nút 🔍 + phím `/`; modal Pagefind lọc theo locale hiện tại; nhóm kết quả Blog/Truyện/Trang.

## 4. Empty & edge states

- Index rỗng (chưa có bài EN): minh hoạ Waveline + "Chưa có bài tiếng Anh — xem bản tiếng Việt".
- Widget lỗi/chưa có KV: ẩn hẳn khối, không hiện khung gãy (chi tiết 11 §6).
- Ảnh hỏng: placeholder màu surface + icon, không layout shift.

## 5. Legal gate — LegalGateSheet

- **Kích hoạt**: lần truy cập đầu (thiếu `localStorage.legalAck`), delay 800ms sau khi trang tương tác được; không hiện trên `/legal/*` và trang lỗi.
- **Hình thức**: bottom-sheet (mobile) / card góc phải dưới (desktop), chiếm ≤ 40% chiều cao, **không chặn scroll** — nội dung phía sau vẫn đọc được (SEO/crawler không ảnh hưởng vì chỉ là overlay client-side).
- **Nội dung** (song ngữ theo locale): 3 dòng — nội dung © Kokone; phần mềm/thương hiệu được nhắc tới thuộc chủ sở hữu tương ứng, site không liên kết; site dùng analytics không cookie. Link: Terms · Privacy · Disclaimer · Third-party · Licenses. Nút: **"Đã hiểu / Got it"** → `legalAck = {v:1, ts}`.
- Đổi phiên bản văn bản legal lớn → tăng `v` để sheet hiện lại. Footer luôn có link legal (gate chỉ là lớp nhắc).

## 6. Copy & tone

UI viết thường, ngắn, chủ động ("Đọc tiếp", "Xem series", "Gửi báo lỗi"); lỗi nói rõ chuyện gì + làm gì tiếp; không icon-cảm-xúc trong UI chính; EN và VI phải tương đương nghĩa, không dịch máy word-by-word (EN chrome do chính mình soạn trong `src/i18n/en.ts`).
