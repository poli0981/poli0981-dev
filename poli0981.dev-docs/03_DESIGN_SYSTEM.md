# 03 — Design System: "Phòng đọc lúc nửa đêm"

## 1. Concept

SkullMute = âm thanh bị tắt có chủ đích. Site mang cảm giác **phòng đọc tối, ấm, chỉ có ngọn đèn bàn** — tĩnh lặng, không neon cyberpunk, không portfolio template. Boldness dồn vào **một** signature (Waveline §5); mọi thứ còn lại kỷ luật và yên tĩnh.

## 2. Màu (token trong `@theme` của Tailwind v4)

### Dark — mặc định ("mực đêm")

| Token | Hex | Dùng cho |
|---|---|---|
| `--color-bg` | `#0D1117` | nền trang |
| `--color-surface` | `#12161F` | card, header |
| `--color-elevated` | `#1A2030` | modal, hover card |
| `--color-line` | `#242B38` | border, divider |
| `--color-text` | `#E9E4D8` | chữ chính (ngà ấm) |
| `--color-muted` | `#98A0AE` | meta, caption |
| `--color-accent` | `#E8A33D` | link, CTA, "ánh đèn bàn" |
| `--color-accent-strong` | `#F4B860` | hover/focus của accent |
| `--color-horror` | `#8C2F39` | tag horror, content-warning |

### Light — "trang giấy cũ" (ưu tiên cho reading mode)

| Token | Hex | Ghi chú |
|---|---|---|
| bg `#F5EFE2` · surface `#FFFDF7` · line `#E2D9C5` | | |
| text `#26221A` · muted `#6E6757` | | |
| accent `#9A6414` | accent phải **đậm hơn** bản dark để đạt AA trên nền sáng |

Quy tắc contrast: text/bg ≥ 7:1, muted ≥ 4.5:1, accent-làm-chữ ≥ 4.5:1 — kiểm tra bằng tooling khi chốt hex cuối (giá trị trên là điểm xuất phát, được phép tinh chỉnh ±10% lightness, không đổi hue).

Semantic phụ: `--color-ok #4C9A6A`, `--color-warn #C9822B`, `--color-err #C24A4A` (dùng ít).

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
- Radius: 6 (control) / 10 (card) / 16 (modal). Border 1px `--color-line`; shadow chỉ ở elevated, tối và mềm (`0 8px 30px rgb(0 0 0 / .35)`).
- Grain: overlay noise PNG 2–3% opacity toàn trang (một element `body::after`, `pointer-events:none`). Khu `/gaming` được phép thêm scanline 2% — nơi duy nhất.
- Layout: container 72rem; trang chủ dùng lưới 12 cột với 1–2 phần tử cố ý lệch/đè (hero title đè lên Waveline) — bất đối xứng có kiểm soát, không "mọi thứ đều nghiêng".

## 5. Signature — Waveline (motif "sóng âm bị tắt")

- Một đường SVG ngang 1.5px màu `--color-line`, giữa có đoạn `--color-accent`.
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

## 7. Component inventory

| Component | Loại | Ghi chú |
|---|---|---|
| Header / MobileTabBar / Footer | .astro | TabBar: Home·Blog·Truyện·Menu, ẩn ≥768px |
| ThemeToggle, LangSwitch | island nhỏ | localStorage `theme`, link hreflang cho lang |
| PostCard / StoryCard / ProjectCard | .astro | StoryCard có badge status + CW |
| Prose | style | typography cho nội dung md |
| ReadingControls | island | cỡ chữ (3 mức, localStorage `reader`), theme giấy/sepia/tối, progress bar 2px |
| ContentWarning | .astro | banner `--color-horror`, bấm để mở nội dung |
| Lightbox | island | vuốt được, lazy |
| SearchModal | island | Pagefind UI, mở bằng `/` hoặc nút |
| LegalGateSheet | island | spec ở `05` §6 |
| Waveline | island | §5 |
| WidgetLatestVideo / WidgetNowPlaying / WidgetGitHub | .astro | đọc KV lúc request?—không: đọc lúc **build** + island refresh nhẹ (xem 11 §5) |
| Callout, TagPill, Pagination | .astro | |

## 8. A11y & mobile checklist (áp cho mọi PR UI)

- Focus ring rõ (2px accent, offset 2px), điều hướng bàn phím đủ; skip-link.
- Touch target ≥ 44×44; `safe-area-inset` cho TabBar; không hover-only cho thông tin.
- Ảnh có alt (bắt buộc trong schema gallery); icon-only button có `aria-label`.
- Kiểm tra 360px, 390px, 768px, 1280px; dark/light; vi/en (chuỗi EN thường dài hơn ~20%).
