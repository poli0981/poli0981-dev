# 04 — Content Model & quy trình viết

## 1. Collections

```
src/content/
├── blog/       # bài viết + nhật ký + chia sẻ (phân biệt bằng tag)
├── stories/    # truyện; truyện nhiều chương = thư mục con
├── projects/   # portfolio (mỗi project 1 file, data-driven)
├── faq/        # Q&A tĩnh
├── gallery/    # metadata album (ảnh nằm src/assets/gallery/<album>/)
└── uses.md, now.md   # trang đơn
```

## 2. Schema (Zod, `src/content.config.ts` — rút gọn)

```ts
const base = z.object({
  title: z.string().max(120),
  description: z.string().max(200),
  lang: z.enum(['vi','en']),
  translationKey: z.string().optional(),  // nối bản dịch vi<->en
  date: z.coerce.date(),
  updated: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  cover: image().optional(),
  draft: z.boolean().default(false),
});

blog:    base                                    // tags gợi ý: dev-log, diary, share, gaming
stories: base.extend({
  series: z.string().optional(),
  chapter: z.number().int().positive().optional(),
  status: z.enum(['ongoing','complete','dropped']).default('ongoing'),
  contentWarning: z.array(z.string()).default([]),  // vd: ['horror','blood']
})
projects: z.object({ name, tagline, lang, stack: z.array(z.string()),
  repo: z.string().url().optional(), url: z.string().url().optional(),
  status: z.enum(['active','maintained','archived']), featured: z.boolean().default(false),
  year: z.number(), cover: image().optional() })
faq:     z.object({ q: z.string(), lang, group: z.enum(['channel','dev','personal']), order: z.number() })
gallery: z.object({ title, lang, date, description: z.string().optional(),
  album: z.string(),            // = tên thư mục ảnh
  coverIndex: z.number().default(0) })
```

Alt text ảnh gallery: file `src/assets/gallery/<album>/captions.json` (`{"IMG_001.avif": {"vi":"...","en":"..."}}`) — build fail nếu thiếu key.

## 3. Frontmatter mẫu

```yaml
# blog (nhật ký)
---
title: "Đêm render đầu tiên của kênh"
description: "Ghi lại một đêm ngồi canh DaVinci."
lang: vi
date: 2026-08-02
tags: [diary, gaming]
draft: true
---
```

```yaml
# stories/dem-khong-tieng/chuong-01.md
---
title: "Đêm không tiếng — Chương 1"
description: "Một căn nhà không còn phát ra âm thanh."
lang: vi
date: 2026-08-10
series: "Đêm không tiếng"
chapter: 1
status: ongoing
contentWarning: [horror]
tags: [horror, short-story]
---
```

## 4. i18n nội dung

- Mỗi bài **một** ngôn ngữ (`lang`). Trang index lọc theo locale hiện tại.
- Có bản dịch → hai file cùng `translationKey`; layout render nút "Read in English/Đọc bản tiếng Việt".
- Không có bản dịch → trang index locale kia có mục "Chỉ có bằng tiếng Việt" (hiện tối đa 5 bài gần nhất, tuỳ chọn tắt).
- Slug: kebab-case không dấu (`dem-khong-tieng`), ổn định vĩnh viễn — đổi title không đổi slug; nếu buộc đổi, thêm redirect trong middleware.

## 5. Quy trình viết (quyết định D2 — Markdown + Git thuần)

1. **Ở PC**: tạo file trong VS Code/Obsidian (vault trỏ thẳng `src/content/`), viết với `draft: true`, xem bằng `npm run dev`.
2. **Capture từ điện thoại**: github.com → repo → thư mục collection → Add file → viết vài dòng + frontmatter tối thiểu + `draft: true` → commit thẳng `main` (draft không build ra site nên an toàn).
3. **Xuất bản**: bỏ `draft`, điền đủ frontmatter, chạy checklist §7, push → CI deploy.
4. Template sẵn: `docs/templates/{blog,story-chapter,project,faq}.md` — copy là viết.

Tiện ích khuyến nghị: snippet VS Code cho từng frontmatter; `npm run new:post -- "tiêu đề"` (script nhỏ sinh file đúng chuẩn — P3).

## 6. Ảnh & EXIF (bắt buộc)

- Ảnh nội dung đặt trong `src/assets/` để Astro Image tự sinh AVIF/WebP + srcset; **không** bỏ ảnh content vào `public/`.
- **Chính sách EXIF**: mọi ảnh chụp (đặc biệt gallery kỷ niệm) phải qua `node scripts/strip-exif.mjs <folder>` (sharp: re-encode, bỏ toàn bộ metadata) **trước khi commit**.
- Chốt chặn CI: `scripts/check-exif.mjs` quét ảnh thay đổi trong PR, thấy GPS/serial → **fail build**. (Repo đang private nhưng ảnh build ra là public — strip từ gốc.)
- Kích thước: ảnh gốc ≤ 2560px cạnh dài, ≤ 1.5MB sau strip. Khi tổng `src/assets/gallery/` > ~1GB → kích hoạt phương án R2 (`17` §5).

## 7. Checklist trước khi publish một bài

- [ ] frontmatter đủ + đúng schema (`astro check` pass)
- [ ] slug không dấu, chưa từng dùng
- [ ] ảnh đã strip EXIF, có alt/caption
- [ ] truyện: contentWarning đặt đúng; chương đánh số liên tục
- [ ] đọc lại trên preview mobile (dev server, viewport 390px)
- [ ] bài EN/VI có `translationKey` nếu là bản dịch
