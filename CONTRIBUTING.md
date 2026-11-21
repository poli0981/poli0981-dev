# Contributing

> **Tiếng Việt ở bên dưới.** / Vietnamese below.

## Maintenance mode

Since **v2.3.0 (November 2026)** this project is in **maintenance mode**. The site is complete; it
is kept healthy, but **no new features are being added**. Only these changes are accepted:

1. **Dependency updates** on the regular schedule (Dependabot weekly, a combined update about
   once a month, always after a 3-day cooldown).
2. **Security**: a dependency advisory of **High or Critical** severity, or a serious
   vulnerability in the runtime itself (Node.js, the Workers runtime), fixed as soon as
   possible — together with a feature only when the owner judges it truly necessary.
3. **Major language, runtime or framework upgrades**: Node.js 26 → 28, TypeScript 7.1 replacing
   the TypeScript 6 API alias, the next Astro or Svelte major, and the like.
4. **Bugs**: anything that does not work as intended, including **UI/UX** glitches and
   **accessibility** barriers ([ACCESSIBILITY.md](ACCESSIBILITY.md)).
5. **Language**: spelling mistakes that could mislead, and wording that does not fit the culture
   or the local voice, in Vietnamese or English.

**Not accepted: new features.** An issue or pull request asking for one is labelled
`enhancement` + `out-of-scope` and closed automatically
([`.github/workflows/triage.yml`](.github/workflows/triage.yml)). If it was closed by mistake,
reply on it and the owner will take another look; an exception the owner accepts carries the
`maintenance-exception` label. Ideas are still welcome in
[Discussions](https://github.com/poli0981/poli0981-dev/discussions), without any promise.

### How to report

- **A problem on the website**: the "Báo lỗi / Report a problem" button on the page itself, or the
  bug report form under [Issues](https://github.com/poli0981/poli0981-dev/issues/new/choose).
- **An accessibility barrier**: the accessibility form under Issues.
- **A spelling or wording problem**: the language form under Issues.
- **A security vulnerability**: privately — see [SECURITY.md](SECURITY.md). Never in a public
  issue.

### Pull requests

Welcome for the five kinds of change above. Keep one change per pull request, follow the checks
in the [pull request template](.github/pull_request_template.md), and run the commands listed in
[README.md](README.md#commands) before opening it. CI must be green — `build` is required, and
the SonarCloud and Qodana gates have to pass too. Commits on `main` are signed.

---

## Chế độ bảo trì

Từ **v2.3.0 (tháng 11/2026)**, dự án ở **chế độ bảo trì**. Trang web đã hoàn chỉnh; repo vẫn được giữ
cho khoẻ mạnh nhưng **không thêm tính năng mới**. Chỉ nhận những thay đổi sau:

1. **Cập nhật dependency** định kỳ (Dependabot hằng tuần, gộp một lần khoảng mỗi tháng, luôn sau
   3 ngày "nguội").
2. **Bảo mật**: lỗ hổng trong dependency ở mức **High hoặc Critical**, hoặc lỗ hổng nghiêm trọng của
   chính runtime (Node.js, Workers runtime) — sửa sớm nhất có thể; kèm tính năng chỉ khi chủ repo
   đánh giá là thật sự cần thiết.
3. **Nâng cấp lớn ngôn ngữ, runtime, framework**: Node.js 26 → 28, TypeScript 7.1 thay alias API
   TypeScript 6, bản major tiếp theo của Astro hay Svelte…
4. **Lỗi**: mọi thứ không chạy đúng ý định, gồm cả lỗi **UI/UX** và rào cản **accessibility**
   ([ACCESSIBILITY.md](ACCESSIBILITY.md)).
5. **Ngôn ngữ**: lỗi chính tả có thể gây hiểu nhầm, câu chữ không hợp văn hoá hay giọng địa phương,
   ở cả tiếng Việt lẫn tiếng Anh.

**Không nhận: tính năng mới.** Issue hoặc pull request đề xuất tính năng sẽ được gắn nhãn
`enhancement` + `out-of-scope` và tự động đóng
([`.github/workflows/triage.yml`](.github/workflows/triage.yml)). Nếu bị đóng nhầm, hãy trả lời ngay
trong đó — chủ repo sẽ xem lại; ngoại lệ được chấp nhận mang nhãn `maintenance-exception`. Ý tưởng
vẫn có thể trao đổi trong [Discussions](https://github.com/poli0981/poli0981-dev/discussions), không
cam kết sẽ làm.

### Báo lỗi ở đâu

- **Lỗi trên trang web**: nút "Báo lỗi" ngay trên trang, hoặc form báo lỗi trong
  [Issues](https://github.com/poli0981/poli0981-dev/issues/new/choose).
- **Rào cản accessibility**: form accessibility trong Issues.
- **Lỗi chính tả, câu chữ**: form ngôn ngữ trong Issues.
- **Lỗ hổng bảo mật**: báo riêng — xem [SECURITY.md](SECURITY.md). Không mở issue công khai.

### Pull request

Hoan nghênh cho năm loại thay đổi ở trên. Mỗi pull request một thay đổi, làm theo các mục kiểm tra
trong [mẫu pull request](.github/pull_request_template.md), chạy các lệnh trong
[README.md](README.md#commands) trước khi mở. CI phải xanh — `build` là bắt buộc, cổng SonarCloud
và Qodana cũng phải qua. Commit trên `main` có chữ ký.
