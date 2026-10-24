# 11 — Widgets & tích hợp ngoài

## 1. Quyết định D9 — vì sao không weather/map

API thời tiết/map phục vụ *chủ site* chứ không phục vụ *khách*; tốn request, thêm mục Privacy Policy, không nói lên điều gì về bạn. Widget đúng cho trang cá nhân là dữ liệu sống **về bạn**: video mới, đang chơi gì, đang code gì. (Nếu sau này vẫn thích 1 dòng thời tiết VN cho vui ở footer: Open-Meteo, free, không key — thêm vào cron worker là xong.)

## 2. Kiến trúc: cron → KV → build/island

```
workers/widgets (cron */45 phút, 3 nguồn chạy song song, timeout 10 s/nguồn)
  ├─ YouTube RSS ─┐
  ├─ Steam API  ──┼─► chuẩn hoá JSON ─► KV put widgets:yt|steam|gh|status
  └─ GitHub API ──┘   └─► mirror thumbnail/icon ─► KV put widgets:img:* (≤ 2 MB, TTL 14 ngày)
Site đọc: lúc BUILD (snapshot KV cho trang tĩnh)  +  island refresh nhẹ gọi /api/widgets (GET, cache 5')
Ảnh:      /ext-img/yt/<id> · /ext-img/steam/<appid>/<hash>  → chỉ ĐỌC KV widgets:img:* (src/lib/ext-img.ts)
```

Khách **không bao giờ** gọi thẳng bên thứ ba — kể cả ảnh: nhanh, không lộ key, không dính rate limit của họ, và trình duyệt không chạm Google/Steam trước khi khách bấm (khớp Privacy Policy §5). Kiểu dữ liệu chung của site và worker nằm ở `src/lib/widgets-types.ts`.

## 3. Nguồn dữ liệu

| Widget | Endpoint | Ghi chú |
|---|---|---|
| Video mới (≤3) | `https://www.youtube.com/feeds/videos.xml?channel_id=<UCxxx>` | RSS công khai, **không cần API key**; parse XML lấy id/title/thumb/published |
| Đang chơi gì | `ISteamUser…/GetRecentlyPlayedGames/v1/?key=…&steamid=…&count=3` | Cần Steam profile → Privacy → **Game details: Public**; key free tại steamcommunity.com/dev |
| Hoạt động GitHub | `api.github.com/users/poli0981/events/public?per_page=10` | Token tuỳ chọn `GITHUB_TOKEN` (không quyền nào): không có token thì hạn mức 60 req/h tính theo IP — IP egress của Workers dùng chung nên hay bị 403 ⇒ feed `stale`. Lọc PushEvent/ReleaseEvent |

## 4. KV schema

| Key | Value (JSON) | TTL |
|---|---|---|
| `widgets:yt` | `{updated, items:[{id,title,thumb,published}]}` | không TTL — ghi đè |
| `widgets:steam` | `{updated, items:[{appid,name,playtime2w,icon}]}` | — |
| `widgets:gh` | `{updated, items:[{type,repo,ts,detail}]}` | — |
| `widgets:status` | `{yt:"ok"|"stale"|"na", steam:…, gh:…, lastRun}` | — (dashboard admin hiển thị) |
| `widgets:img:yt:<id>` · `widgets:img:steam:<appid>:<hash>` | bytes ảnh, metadata `{type}` (jpeg/png/webp) | 14 ngày; ảnh > 2 MB hoặc sai kiểu bị bỏ qua. Icon Steam lấy từ `cdn.cloudflare.steamstatic.com` — `media.steampowered.com` trả 403 cho Workers |

## 5. Quy tắc bền vững (kế thừa convention tracker của bạn)

- **Lỗi mạng/API ⇒ GIỮ dữ liệu cũ**, chỉ set status `stale` — không bao giờ xoá/ghi rỗng.
- Field thiếu ⇒ chuỗi `"N/A"`, list ⇒ `[]` — đúng pattern `free-steam-games-list`.
- `stale` > 24h ⇒ status `na`; component nhận `na` ⇒ **ẩn nguyên khối** (không khung gãy, không skeleton vĩnh viễn).
- Cron fail 3 lần liên tiếp ⇒ bắn Discord webhook cảnh báo (dùng `DISCORD_WEBHOOK_CI`).

## 6. Hiển thị

- `WidgetLatestVideo`: thumbnail qua `/ext-img/yt/<id>` (bản mirror trong KV, CSP `img-src 'self'`) + nút play → bấm mới tạo iframe `youtube-nocookie.com` (facade — `06` §5 và Privacy). Thiếu ảnh mirror ⇒ khung không ảnh, không gọi ra ngoài.
- `WidgetNowPlaying`: icon game + tên + "x giờ / 2 tuần"; 0 game gần đây ⇒ ẩn.
- `WidgetGitHub`: 3 dòng "pushed to X · 2d ago".
- Trang tĩnh build kèm snapshot KV tại thời điểm build; island gọi `/api/widgets` (GET, `Cache-Control: max-age=300`, đọc KV) để tươi hơn giữa các lần deploy. Không có JS ⇒ vẫn thấy snapshot build — progressive enhancement.

## 7. Secrets & cấu hình worker widgets

`wrangler.jsonc`: `triggers: { crons: ["*/45 * * * *"] }`, bind KV chung, `observability.logs` bật. Secrets: `STEAM_API_KEY`, `STEAM_ID64`, `DISCORD_WEBHOOK_CI`, `GITHUB_TOKEN` (tuỳ chọn). Biến thường: `YT_CHANNEL_ID` (vars, không nhạy cảm). Mỗi lần chạy ghi log JSON `widgets.run` (+ `widgets.source_failed` cho nguồn lỗi). Deploy: `npx wrangler deploy --config workers/widgets/wrangler.jsonc` (không nối Workers Builds).

## 8. Test

- [ ] Chạy tay `wrangler dev --test-scheduled` → cả 3 key KV có dữ liệu đúng schema
- [ ] Ngắt mạng Steam (key sai) → dữ liệu cũ còn nguyên, status `stale`, site vẫn hiển thị
- [ ] `na` → khối biến mất, layout không xô lệch
- [ ] Trang chủ không có JS (tắt JS) vẫn thấy snapshot build
