---
title: "Sử dụng AI / AI Disclosure"
order: 6
effectiveDate: "2026-08-10"
---

## English

**This site's source code was written with the help of AI.** The pages, stories, photos and
opinions are not — those are mine. This page says exactly where the line is, because a
disclosure that stays vague is not a disclosure.

**1. What AI was used for.** Writing source code, writing and running tests, debugging, and
reviewing/checking the result. The table below names the model, its version, and its vendor.

**2. What AI was not used for.** Blog posts, stories, Q&A answers, and photographs are written,
taken and edited by me. Nothing in `/blog`, `/truyen` or `/gallery` is model-generated text or
image, and I do not intend to change that without saying so here first.

**3. Human review.** Every change reaches the site through a pull request that I read and merge
myself. AI does not have publish access, and no automation deploys unreviewed output.

**4. The legal texts.** Terms, Privacy, Disclaimer, Content License and Third-Party Notices were
drafted from AI-generated templates and then edited against how the site actually works. They
are not legal advice and were not reviewed by a lawyer. If you rely on them for anything that
matters, tell me and I will get them looked at properly.

**5. This is separate from AI training.** Letting a model help me write code says nothing about
letting models train on what I publish. The content here is All Rights Reserved: training on it
is prohibited by the [Terms of Use](/legal/terms/) §3 and the [Content License](/legal/licenses/),
and `robots.txt` blocks the known AI-training crawlers.

## Tiếng Việt

**Mã nguồn của trang này được viết với sự hỗ trợ của AI.** Nội dung, truyện, ảnh và quan điểm thì
không — đó là của mình. Trang này nói rõ ranh giới nằm ở đâu, vì một lời công bố mập mờ thì không
phải là công bố.

**1. AI được dùng để làm gì.** Viết mã nguồn, viết và chạy kiểm thử (testing), gỡ lỗi (debug), và
rà soát/kiểm tra kết quả. Bảng dưới ghi rõ tên model, phiên bản và nhà phát triển.

**2. AI KHÔNG được dùng để làm gì.** Bài blog, truyện, câu trả lời Hỏi đáp và ảnh chụp đều do mình
viết, chụp và biên tập. Không có chữ hay ảnh nào trong `/blog`, `/truyen`, `/gallery` do model sinh
ra, và mình sẽ không thay đổi điều đó mà không ghi lại ở đây trước.

**3. Con người duyệt.** Mọi thay đổi lên trang đều đi qua một pull request do chính mình đọc và
merge. AI không có quyền publish, và không có tự động hoá nào deploy thứ chưa được duyệt.

**4. Về các văn bản pháp lý.** Điều khoản, Bảo mật, Miễn trừ, Giấy phép nội dung và Bên thứ ba được
soạn từ template do AI sinh ra, sau đó biên tập lại cho khớp với cách site thực sự hoạt động. Đây
không phải tư vấn pháp lý và chưa qua luật sư. Nếu bạn cần dựa vào chúng cho việc gì quan trọng,
hãy báo mình để mình nhờ người có chuyên môn xem lại.

**5. Việc này khác với chuyện huấn luyện AI.** Dùng model để hỗ trợ viết code không đồng nghĩa với
việc cho model huấn luyện trên thứ mình đăng. Nội dung ở đây là All Rights Reserved: việc huấn
luyện bị cấm theo [Điều khoản](/legal/terms/) §3 và [Giấy phép nội dung](/legal/licenses/), và
`robots.txt` chặn các crawler thu thập dữ liệu huấn luyện đã biết.

## Models

| Việc / Task                             | Công cụ / Tool    | Model           | Nhà phát triển / Vendor |
| --------------------------------------- | ----------------- | --------------- | ----------------------- |
| Viết mã nguồn / Writing source code     | Claude Code (CLI) | Claude Opus 4.8 | Anthropic               |
| Viết mã nguồn / Writing source code     | Claude Code (CLI) | Claude Opus 5   | Anthropic               |
| Kiểm thử / Testing                      | Claude Code (CLI) | Claude Opus 4.8 | Anthropic               |
| Kiểm thử / Testing                      | Claude Code (CLI) | Claude Opus 5   | Anthropic               |
| Gỡ lỗi / Debugging                      | Claude Code (CLI) | Claude Opus 4.8 | Anthropic               |
| Gỡ lỗi / Debugging                      | Claude Code (CLI) | Claude Opus 5   | Anthropic               |
| Rà soát, kiểm tra / Review and checking | Claude Code (CLI) | Claude Opus 4.8 | Anthropic               |
| Rà soát, kiểm tra / Review and checking | Claude Code (CLI) | Claude Opus 5   | Anthropic               |

**Verifiable / Có thể kiểm chứng:** commits made with AI assistance carry a
`Co-Authored-By: Claude <noreply@anthropic.com>` trailer naming the model, so the git history is
the authoritative record — not this table. — Các commit có AI hỗ trợ đều mang trailer
`Co-Authored-By: Claude <noreply@anthropic.com>` kèm tên model, nên lịch sử git mới là bản ghi
chính thức, không phải bảng này.
