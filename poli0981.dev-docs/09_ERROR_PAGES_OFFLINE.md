# 09 — Trang lỗi custom & Offline

Nhắc lại quyết định D8: Custom Errors của Cloudflare cần zone plan trả phí → **toàn bộ trang lỗi phục vụ từ app/Worker**, không tốn thêm đồng nào. Lỗi do WAF/challenge của Cloudflare chặn ở lớp ngoài cùng vẫn là trang mặc định của họ — chấp nhận (chỉ traffic độc hại thấy).

## 1. Nguyên tắc thiết kế chung

- Cùng design system, **song ngữ trong một trang** (VI trên, EN mờ hơn dưới — trang lỗi không phụ thuộc locale route).
- Nhẹ tuyệt đối: inline CSS critical, không island, không font display nặng (dùng body font đã cache).
- Motif: Waveline flatline làm hình chính — "tín hiệu mất".
- Luôn có: nút Về trang chủ · link Blog/Truyện · nút "Báo lỗi" (trừ 429/offline).
- Mobile viewport chuẩn như mọi trang.

## 2. Spec từng trang

| Trang | Trigger | Headline (VI / EN) | Ghi chú riêng |
|---|---|---|---|
| **404** `404.astro` | route không tồn tại | "Trang này không phát ra tín hiệu." / "This page makes no sound." | + ô search (mở Pagefind), gợi ý 3 bài mới. Assets config `not_found_handling: "404-page"` để request tĩnh lạc cũng nhận trang này (P0 Spike 3 verify) |
| **500** `500.astro` | exception khi render on-demand / api | "Có gì đó vỡ trong im lặng." / "Something broke, quietly." | Astro tự dùng 500.astro khi SSR lỗi; api route bọc try/catch trả JSON lỗi gọn. In mã tham chiếu = `crypto.randomUUID().slice(0,8)` để người dùng đính vào bug report |
| **403** middleware render | IP nằm trong `denylist:*` (KV) | "Cửa này đang khoá." / "This door is locked." | Kèm dòng: nếu nghĩ là nhầm → contact@. Không nêu lý do cụ thể |
| **429** middleware render | vượt rate-limit app (5 req/phút/IP trên /api) | "Chậm lại một nhịp." / "Take a breath." | Header `Retry-After: 60`; hiện đồng hồ đếm ngược 60s (vanilla JS inline) |
| **/offline** | service worker fallback | "Không có mạng — nhưng vẫn có thứ để làm." / "You're offline." | Xem §3–4 |

403/429 do middleware sinh: render template Astro đã **prerender sẵn thành static asset** (`/403` `/429` là trang thật), middleware chỉ `fetch` asset đó qua binding ASSETS rồi trả với status tương ứng — không nhân đôi markup.

## 3. Offline ("No Internet") — service worker

- Dùng `@vite-pwa/astro`, chiến lược **offline fallback tối thiểu** (không precache cả site):
  - Precache: `/offline`, CSS critical, 2 file font subset, favicon, sprite mini-game.
  - Navigation request fail (mất mạng) → trả `/offline`.
  - Không cache runtime nội dung khác ở v1 (tránh phức tạp stale).
- `registerType: 'autoUpdate'`; SW chỉ đăng ký sau `load` để không tranh băng thông first paint.

## 4. Easter egg — mini game "Skull Hop" (P3, tuỳ hứng)

Canvas ≤ 6KB JS vanilla nằm ngay trong trang offline: đầu lâu pixel nhảy qua các cột sóng âm (mô-típ Waveline), phím Space/tap, tốc độ tăng dần, best score lưu localStorage `skullhop`. Sprite 1 file PNG 8-bit. Reduced-motion: hiện nút "Chơi" thay vì tự chạy. Đây là chỗ duy nhất trên site được phép "nghịch".

## 5. Ma trận test (chạy trước launch + sau mỗi thay đổi middleware)

| Case | Cách test | Kỳ vọng |
|---|---|---|
| 404 route | mở `/khong-ton-tai` | trang 404, status 404 |
| 404 asset | mở `/anh-khong-co.png` | trang 404 (not_found_handling) |
| 500 | tạm ném throw trong 1 api route ở preview | trang/JSON 500 + mã tham chiếu |
| 403 | thêm IP nhà vào denylist KV preview → mở site | trang 403 custom |
| 429 | bắn 6 POST /api/report trong 1 phút | request 6 nhận trang 429 + Retry-After |
| 429 lớp zone | bắn 30 req/10s | Cloudflare block (trang mặc định) — xác nhận rule sống |
| Offline | DevTools → Network Offline → điều hướng | trang /offline + game chạy |
| Mobile | lặp các case trên ở viewport 390px | không vỡ layout |
