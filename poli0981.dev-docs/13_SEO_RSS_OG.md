# 13 — SEO · RSS · OG · Crawler policy

## 1. Meta chuẩn mỗi trang

Base layout nhận props và render: `<title>` dạng `Tên trang — poli0981.dev` (trang chủ: `Kokone (SkullMute) — dev & storyteller`), description ≤ 160 ký tự từ frontmatter, canonical tuyệt đối, `og:*` + `twitter:card=summary_large_image`, `theme-color` theo theme.

## 2. hreflang (i18n)

Mỗi trang có bản dịch (qua `translationKey`) render cặp:
```html
<link rel="alternate" hreflang="vi" href="https://poli0981.dev/..."/>
<link rel="alternate" hreflang="en" href="https://poli0981.dev/en/..."/>
<link rel="alternate" hreflang="x-default" href="https://poli0981.dev/..."/>
```
Bài không có bản dịch: không render hreflang (tránh trỏ trang không tồn tại).

## 3. Sitemap & robots

- `@astrojs/sitemap` với `i18n` config → `sitemap-index.xml`; loại trang lỗi, `/offline`, trang draft.
- `public/robots.txt`:

```
User-agent: *
Allow: /
Disallow: /api/

# AI-training crawlers — chặn vì nội dung ARR (đồng bộ với toggle Cloudflare, 07 §5)
User-agent: GPTBot
User-agent: CCBot
User-agent: Google-Extended
User-agent: anthropic-ai
User-agent: ClaudeBot
Disallow: /

Sitemap: https://poli0981.dev/sitemap-index.xml
```
(Chặn AI-training bot là quyết định mặc định vì truyện/ảnh ARR; muốn ngược lại chỉ cần xoá khối trên + tắt toggle Cloudflare — ghi vào nhật ký quyết định nếu đổi.)

## 4. RSS

| Feed | Nội dung |
|---|---|
| `/rss.xml` | blog + truyện, mọi locale, 30 mục mới nhất |
| `/blog/rss.xml` · `/truyen/rss.xml` | theo khu |

Item: title, link, pubDate, description, `<language>` theo bài, category = tags. Full-content không đưa vào feed truyện (chỉ mô tả + link) — bảo vệ ARR; blog đưa full nếu muốn.

## 5. OG image tự sinh

- Build-time bằng Satori + resvg (hoặc `astro-og-canvas` nếu gọn hơn lúc triển khai): template 1200×630, nền mực đêm + Waveline + title (Bricolage) + badge khu (Blog/Truyện/Project) + `poli0981.dev`.
- Truyện có contentWarning: OG thêm dải màu horror + nhãn CW (không spoil chi tiết).
- Cache theo hash(title+khu) để build nhanh.

## 6. Dữ liệu có cấu trúc (JSON-LD)

- Toàn site: `Person` (Kokone, sameAs = các URL social ở /links — giúp knowledge panel liên kết YouTube/GitHub).
- Bài blog: `BlogPosting`; truyện: `CreativeWork` (`genre`, `isPartOf` series); project: `SoftwareSourceCode` (codeRepository).

## 7. Việc SEO một lần sau launch

- [ ] Google Search Console + Bing Webmaster: verify qua DNS TXT, submit sitemap
- [ ] Kiểm tra rich results (JSON-LD) bằng validator
- [ ] `rel="me"` Mastodon verify hoạt động (badge xanh trên profile)
- [ ] Share thử 1 link lên Discord/X/FB — OG image đúng, không cache lỗi
