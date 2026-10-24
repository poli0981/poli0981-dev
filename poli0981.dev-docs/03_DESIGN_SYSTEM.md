# 03 — Design System: "Phòng đọc lúc nửa đêm" — Glacier Teal

## 1. Concept

SkullMute = âm thanh bị tắt có chủ đích. Site mang cảm giác **phòng đọc lúc nửa đêm** — tĩnh lặng, không neon cyberpunk, không portfolio template. Boldness dồn vào **một** signature (Waveline §5); mọi thứ còn lại kỷ luật và yên tĩnh.

Từ 10/2026 (v2.0) palette chuyển từ "ngọn đèn bàn" ấm sang **Glacier Teal**: nền xanh đêm, chữ trắng lạnh, accent teal như ánh màn hình. Bản sáng là "băng ban ngày" — trắng xanh nhạt, accent teal đậm. Tinh thần giữ nguyên: một màu nhấn, phần còn lại im lặng.

## 2. Màu — nguồn và quy tắc

Token runtime khai báo trong `src/styles/global.css` (khối `:root, [data-theme="dark"]` và `[data-theme="light"]`), sinh utility Tailwind qua `@theme inline`. **`src/lib/palette.ts` giữ cùng giá trị** cho code ngoài CSS (meta `theme-color`, ảnh OG, easter egg). `tests/palette.test.ts` fail khi hai nơi lệch nhau hoặc khi một cặp chữ/control dưới chuẩn: chữ (text, muted, accent, accent-strong, horror, ok, warn, err) ≥ 4.5:1 trên `bg`/`surface`/`elevated`; `line-strong` ≥ 3:1 (WCAG 1.4.11); `accent-contrast` trên `accent` ≥ 4.5:1.

### Dark — "glacier night" (mặc định khi không có JS)

| Token | Hex | Dùng cho |
|---|---|---|
| `--bg` | `#0B1220` | nền trang, `theme-color` |
| `--surface` | `#0F192A` | card, header |
| `--elevated` | `#16233A` | modal, menu, toast |
| `--line` | `#223047` | border trang trí, divider |
| `--line-strong` | `#5B6F8F` | viền control (input, nút) — ≥ 3:1 |
| `--text` | `#E6EDF5` | chữ chính |
| `--muted` | `#94A3B8` | meta, caption |
| `--accent` | `#2DD4BF` | link, CTA, focus ring |
| `--accent-strong` | `#5EEAD4` | hover/focus của accent |
| `--accent-contrast` | `#042F2E` | chữ trên nền accent (selection, nút primary) |
| `--horror` | `#FB7185` | tag horror, content-warning |
| `--ok` / `--warn` / `--err` | `#34D399` / `#FBBF24` / `#F87171` | trạng thái |
| `--overlay` · `--shadow-color` | `rgb(2 6 23 / .66)` · `rgb(0 0 0 / .45)` | backdrop modal · bóng elevated |

### Light — "glacier day"

| Token | Hex |
|---|---|
| bg `#F4F8FB` · surface `#FFFFFF` · elevated `#FFFFFF` · line `#D6E0EA` · line-strong `#7C8CA3` | |
| text `#0F1B2D` · muted `#4A5A70` | |
| accent `#0F766E` · accent-strong `#115E59` · accent-contrast `#FFFFFF` | accent đậm hơn bản dark để đạt AA trên nền sáng |
| horror `#BE123C` · ok `#047857` · warn `#B45309` · err `#B91C1C` | |
| overlay `rgb(15 27 45 / .42)` · shadow-color `rgb(15 27 45 / .14)` | |

### Palette riêng theo vùng

- **Lớp đọc truyện** (`ReadingControls`): "Giấy" = palette sáng, "Tối" = palette tối (global.css áp cùng khối token cho `[data-reader-theme="paper|dark"]`), "Sepia" là palette ấm riêng trong `StoryReaderLayout.astro` (cũng được test AA).
- **Lightbox** luôn dùng palette tối (`data-theme="dark"` trên chính nó) — ảnh xem tốt nhất trên nền tối.
- **Ảnh OG** (`scripts/gen-og.mjs`) và favicon dùng palette tối.

## 3. Typography (đều có subset `vietnamese` — P0 Spike 2 phải test dấu trên máy thật)

| Vai trò | Font | Cấu hình |
|---|---|---|
| Display/heading | Bricolage Grotesque (variable) | wght 500–800, dùng width/optical size cho hero |
| Body UI | Be Vietnam Pro | 400/500/600 |
| Đọc dài (blog body, story reader) | Literata (variable) | 400/500 + italic; opsz auto |
| Code/meta | JetBrains Mono | 400/700 |

Nạp qua **Astro Fonts API**, self-host, `subsets: ['latin','vietnamese']`, `font-display: swap`, preload đúng 2 file dùng ở first paint (display + body). Fallback stack có metric-adjust để giảm CLS.

Type scale (fluid, mobile 360px → desktop 1280px):

| Step | clamp() | Dùng |
|---|---|---|
| -1 | 0.875→0.9375rem | caption/meta |
| 0 | 1→1.125rem | body (story reader mặc định 1.125→1.25) |
| 1 | 1.25→1.5rem | h4/lead |
| 2 | 1.563→2rem | h3 |
| 3 | 1.953→2.75rem | h2 |
| 4 | 2.441→3.75rem | h1 |
| 5 | 3.05→5rem | hero display |

Đo đạc đọc: bề rộng prose `65ch` (reader `68ch`), line-height body 1.7 (heading 1.15), paragraph spacing 1em, không justify.

## 4. Spacing / hình khối

- Space scale 4px: 1,2,3,4,6,8,12,16,24,32 (×4px). Section padding: `clamp(3rem, 8vw, 6rem)`.
- Radius: 6 (control) / 10 (card) / 16 (modal). Border 1px `--line` (trang trí) hoặc `--line-strong` (control); shadow chỉ ở elevated: `--shadow-elevated` = `0 8px 30px var(--shadow-color)`.
- Grain: overlay noise PNG 2–3% opacity toàn trang (một element `body::after`, `pointer-events:none`). Khu `/gaming` được phép thêm scanline 2% — nơi duy nhất.
- Layout: container 72rem; trang chủ dùng lưới 12 cột với 1–2 phần tử cố ý lệch/đè (hero title đè lên Waveline) — bất đối xứng có kiểm soát, không "mọi thứ đều nghiêng".

## 5. Signature — Waveline (motif "sóng âm bị tắt")

- Một đường SVG ngang 1.5px màu `--line`, giữa có đoạn `--accent`.
- **Idle**: flatline. **Hover/scroll-into-view**: 1.2s "sống dậy" thành waveform 5–7 nhịp (path morph hoặc `stroke-dashoffset` + `d` keyframes bằng GSAP) rồi tắt về flatline — đúng một nhịp, không loop.
- Xuất hiện tại: hero (dưới tagline), divider giữa section, footer. **Không** dùng trong card/list.
- `prefers-reduced-motion`: luôn flatline tĩnh.
- Loader chuyển trang (View Transitions): Waveline chạy 0.4s ở top — thay cho spinner.

## 6. Motion

| Token | Giá trị |
|---|---|
| duration: fast/base/slow | 150 / 250 / 400ms |
| ease chính | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Page-load reveal | stagger 60ms, translateY 12px + fade, tối đa 6 phần tử |
| Hover card | lift 2px + border sáng lên, 150ms |

Nguyên tắc: **một** khoảnh khắc dàn dựng khi load trang chủ; còn lại là micro-interaction. GSAP chỉ nạp ở island nào cần (Waveline, hero) — không nạp global. Mọi animation phải có nhánh reduced-motion.

### Theme (sáng/tối/theo hệ thống)

- Lựa chọn lưu ở `localStorage.theme` (`light`/`dark`; không có = **theo hệ thống**). Bootstrap inline trong `<head>` (`src/lib/theme.ts`, được hash vào CSP) đặt `data-theme-pref` (lựa chọn) và `data-theme` (palette đang hiện) trước first paint, và nghe `prefers-color-scheme` để đổi theo hệ điều hành khi đang ở chế độ hệ thống.
- `ThemeToggle` xoay vòng hệ thống → sáng → tối; icon chọn bằng CSS theo `data-theme-pref` nên đúng ngay trước khi island hydrate. Khi ghim sáng/tối, hai thẻ `meta[name=theme-color]` cùng trỏ màu nền đã chọn để thanh trình duyệt khớp trang.
- Không có JS: trang hiện bản tối.

### Thanh cuộn

Token `--scrollbar-thumb` / `--scrollbar-thumb-hover` / `--scrollbar-track` khai báo trong từng palette (`global.css`), pha từ `--muted`/`--accent` với `--bg` bằng `color-mix(in oklab, …)`: thumb ≥ 3:1 so với nền (dark: muted 65%, light: muted 75%). `scrollbar-color` (kế thừa) cho mọi vùng cuộn; `scrollbar-width: thin` khi trình duyệt hỗ trợ `scrollbar-color`, còn Safari dùng nhánh `::-webkit-scrollbar`. Tuỳ chọn "Ẩn thanh cuộn" chỉ ẩn thanh của trang (vẫn cuộn bằng chuột/phím); vùng cuộn con giữ thanh mảnh.

## 7. Component inventory

| Component | Loại | Ghi chú |
|---|---|---|
| Header / MobileTabBar / Footer | .astro | TabBar: Home·Blog·Truyện·Menu, ẩn ≥768px; nav chính của header hiện từ 960px (dưới đó dùng nút menu — bản EN cần ~900px) |
| ThemeToggle, LangSwitch | island nhỏ / .astro | ThemeToggle 3 trạng thái (§6); LangSwitch nhận href đã giải bản dịch từ BaseLayout |
| ScrollbarToggle | island nhỏ (footer, chỉ hiện khi `pointer: fine`) | switch `role="switch"`; localStorage `scrollbar=hidden` → `html[data-scrollbar="hidden"]`, áp trước first paint cùng bootstrap theme |
| PostCard / StoryCard / ProjectCard | .astro | StoryCard có badge status + CW |
| Prose | .astro + `src/styles/prose.css` | typography cho nội dung md; cùng stylesheet dùng cho preview trong admin |
| ReadingControls | island | cỡ chữ (3 mức, localStorage `reader`), theme giấy/sepia/tối, progress bar 2px |
| ContentWarning | .astro | banner `--horror`, bấm để mở nội dung |
| Lightbox | island | vuốt được, lazy; thumbnail là link tới ảnh lớn (chạy được khi tắt JS) |
| SearchModal | island | Pagefind, mở bằng `/` hoặc nút; ARIA combobox (`aria-activedescendant`), báo lỗi khi không tải được index |
| MenuSheet | island | dialog modal, bẫy focus, trả focus về nút mở |
| LegalGateSheet | island | spec ở `05` §6 |
| Waveline | island | §5 |
| WidgetLatestVideo / WidgetNowPlaying / WidgetGitHub | .astro | đọc KV lúc request?—không: đọc lúc **build** + island refresh nhẹ (xem 11 §5) |
| Callout, TagPill, Pagination | .astro | |

## 8. A11y & mobile checklist (áp cho mọi PR UI)

- Focus ring rõ (2px accent, offset 2px), điều hướng bàn phím đủ; skip-link.
- Touch target ≥ 44×44; `safe-area-inset` cho TabBar; không hover-only cho thông tin.
- Ảnh có alt (bắt buộc trong schema gallery); icon-only button có `aria-label`.
- Kiểm tra 360px, 390px, 768px, 960px, 1280px; dark/light/theo hệ thống; vi/en (chuỗi EN thường dài hơn ~20%).
- Màu mới phải vào `palette.ts` + `global.css` cùng lúc (test chặn nếu lệch hoặc dưới AA); không hard-code màu trong component — dùng token.
- `<dialog>` modal giữ `margin: auto` (preflight Tailwind xoá margin — global.css trả lại); danh sách trong `.prose` có marker (preflight xoá `list-style`).
- Nhãn landmark, aria-label và chuỗi giao diện lấy từ `src/i18n`, không viết cứng.
