# 01 — PRD (Product Requirements)

## 1. Sản phẩm

Website cá nhân `poli0981.dev` cho Kokone: **portfolio dev + blog kiêm nhật ký + nơi viết truyện ngẫu hứng + hub cho kênh SkullMute**. Repo private, chi phí gần bằng 0, chạy trên hạ tầng Cloudflare đã có.

## 2. Mục tiêu

1. Một địa chỉ duy nhất đại diện cả hai "mặt": developer (GitHub poli0981) và creator (SkullMute).
2. Viết được **thoải mái và bền**: blog/nhật ký/truyện bằng Markdown, xuất bản bằng `git push`, không phụ thuộc CMS bên thứ ba.
3. Đẹp có chủ đích ("Phòng đọc lúc nửa đêm"), không giống template, mobile hoàn chỉnh.
4. Vận hành ~US$12–13/năm phát sinh mới; không thêm dịch vụ trả phí nào khác.
5. Bảo mật "vừa đủ": headers chuẩn, chống abuse form, chặn IP, không mở bề mặt admin nào ra internet.

## 3. Non-goals (v1 KHÔNG làm)

- Không CMS/admin UI (Keystatic để ngỏ cho tương lai — xem ADR-04).
- Không comment, không form Q&A, không tài khoản người dùng, không newsletter.
- Không D1/database; không e-commerce/donate (có thể thêm link Ko-fi tĩnh sau).
- Không tiếng Nhật ở v1 (kiến trúc i18n phải cho phép thêm `ja` sau mà không refactor).
- Không app mobile/PWA cài đặt đầy đủ — chỉ dùng service worker cho trang offline.

## 4. Đối tượng

| Persona | Đến từ | Cần gì |
|---|---|---|
| Viewer của kênh | YouTube/Discord | Xem "người đứng sau kênh", video mới, đang chơi gì, FAQ, link social |
| Dev/recruiter/collab | GitHub, mail sponsor | Portfolio project, /uses, cách liên hệ đáng tin (`contact@poli0981.dev`) |
| Độc giả truyện | Social/share link | Trải nghiệm đọc dài thoải mái trên điện thoại, theo dõi qua RSS |
| Chính Kokone | — | Viết nhanh, đăng nhanh, không phải bảo trì nhiều |

## 5. Yêu cầu chức năng (theo khu)

Ưu tiên: **P1** = phải có khi launch · **P2** = ngay sau launch · **P3** = khi rảnh.

| Khu | Yêu cầu | Ưu tiên |
|---|---|---|
| Trang chủ | Hero + signature Waveline, bài blog/truyện mới nhất, widget video mới + đang chơi gì | P1 (widget P2) |
| /about | Song ngữ, 2 mặt dev/creator, ảnh đại diện, timeline ngắn | P1 |
| /projects | Card từ collection `projects`, filter theo tag, link GitHub/release | P1 |
| /blog | Index + trang bài, tag, reading time, RSS riêng | P1 |
| /stories | Index theo series/status, **reader mode** riêng (font serif, chỉnh cỡ chữ, theme giấy, progress, prev/next chương, content-warning) | P1 |
| /gallery | Album theo năm/sự kiện, lightbox, EXIF đã strip | P2 |
| /gaming | Giới thiệu kênh, embed video (click-to-load, nocookie), thể loại yêu thích, widget Steam | P2 |
| /dev (/uses) | PC specs, tool stack, setup OBS/Resolve | P2 |
| /qa | FAQ tĩnh từ collection `faq` + khối "Liên hệ" trỏ /links và `contact@` | P1 |
| /links | Toàn bộ social (YouTube, Discord ×2, GitHub, Telegram, Bluesky, Mastodon, X, Facebook), icon + mô tả | P1 |
| /legal/* | 5 trang từ `12_LEGAL/`, song ngữ | P1 |
| Search | Pagefind, modal, lọc theo locale | P2 |
| Error/offline | 404/403/429/500/offline custom | P1 (mini-game P3) |
| Bug report | Nút footer → GitHub Issue + Discord | P2 |
| Legal gate | Bottom-sheet lần đầu truy cập | P1 |

## 6. Yêu cầu phi chức năng

- **Hiệu năng**: xem `14_PERF_BUDGET.md` (LCP < 2.0s mobile 4G, Lighthouse ≥ 95).
- **A11y**: WCAG 2.1 AA cho contrast/focus/keyboard; `prefers-reduced-motion` được tôn trọng ở mọi animation.
- **i18n**: UI 100% song ngữ; nội dung theo bài; URL ổn định khi thêm locale mới.
- **SEO**: hreflang, sitemap, JSON-LD, OG image tự sinh (xem `13_SEO_RSS_OG.md`).
- **Bảo mật**: xem `06_SECURITY.md`; mọi phiên bản dependency không có CVE chưa vá ở thời điểm chốt.
- **Riêng tư**: analytics không cookie; không tracker bên thứ ba; ảnh strip GPS.

## 7. Bảng truy vết requirement gốc → tài liệu

| Yêu cầu bạn nêu | Xử lý tại |
|---|---|
| UI/UX, đặc trưng, cách trình bày | 03, 05 |
| Q&A, ảnh kỷ niệm, góc gaming/dev | 01 §5, 04, 05 |
| Link social | 05 (/links) |
| Stack phù hợp, bản mới nhất/LTS, không CVE | 02 §2, 02 §8 |
| Host lưu trữ dữ liệu | 02 §5–6 |
| Domain poli0981.dev trên Cloudflare | 07 §1 |
| Tính toàn bộ chi phí | 16 |
| Trang lỗi custom + mobile viewport | 09, 03 §6 |
| Giấy phép repo | 12/CONTENT_LICENSE, ADR-06 |
| Legal gate (EULA…, trỏ link) | 05 §6, 12 |
| Ngôn ngữ/framework hiệu ứng đẹp, font | 02, 03 |
| API thời tiết/map? | 11 §1 (kết luận: không) |
| Đơn giản, bắt mắt, không đại trà | 03 §1 |
| Dead code (knip), chuẩn code | 08 §5 |
| Trình cài đặt, gói bên thứ ba | 02 §7, 12/THIRD_PARTY_NOTICES |
| Bug report kèm console error | 10 |
| Bảo mật cơ bản, chống DDoS, chặn IP, file hướng dẫn Cloudflare | 06, 07 |

## 8. Tiêu chí thành công v1

- Site live trên `poli0981.dev`, đủ mọi mục P1, hai locale hoạt động.
- Đăng một bài mới = tạo file md + push, xuất hiện trong < 3 phút (CI).
- Chi phí tháng đầu tiên: đúng $5 Workers đã có + domain, không phát sinh.
- 5 trang lỗi hiển thị đúng trong test matrix (`09` §5).
