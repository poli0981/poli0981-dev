# 08 — CI/CD

## 0. Thực tế đang chạy (10/2026, v2.0) — §1–§5 bên dưới là kế hoạch ban đầu (lịch sử)

- **Deploy**: Cloudflare **Workers Builds** nối repo (không có job deploy trong GitHub Actions): `main` → build + `npx wrangler deploy`; nhánh khác → `npx wrangler versions upload` (version preview, không nhận traffic). Cấu hình chi tiết + bẫy đã gặp: `07` §9.
- **`ci.yml`** (PR, push `main`, `workflow_dispatch`), job **`build`** (timeout 30 phút, checkout kèm submodule):
  `npm ci --ignore-scripts` → `check-install-scripts` → `wrangler types` (site + widgets) → prettier → eslint → `astro check` (TS 6) → **`typecheck` bằng TypeScript 7** (in `tsc -v`, kiểm site + widgets) → knip → **`test:coverage`** (`node:test`, ngưỡng 80% dòng, xuất `coverage/lcov.info`) → `npm audit --omit=dev --audit-level=high` → `gen-notices --check` → `check-exif --changed` → build (+ OG, Pagefind, `check-csp-hashes`) → **smoke test** (`npm run smoke`: chạy worker đã build bằng `wrangler dev`, kiểm trang/304/HEAD/`/media`/`/ext-img`/admin 403/`frame-ancestors`, pha ép bật cổng Turnstile kể cả cookie sai định dạng, pha denylist) → upload coverage làm artifact. Check `build` là **bắt buộc** (ruleset `main`).
- Job **`sonarcloud`** (sau `build`; chạy cho push `main` và PR cùng repo, bỏ qua Dependabot): tải coverage → `SonarSource/sonarqube-scan-action` (pin SHA) với `sonar-project.properties`; trên PR chờ **quality gate** ("Sonar way" cho new code: coverage ≥ 80%, trùng lặp ≤ 3%, rating A, hotspot đã review). Automatic analysis trên SonarCloud **tắt** (CI analysis thay thế); `SONAR_TOKEN` là secret của repo. `.svelte`/`.astro` không được Sonar phân tích — logic quan trọng nằm trong `.ts` để đo được.
- **CodeQL** (default setup, repo public) · **Snyk** (GitHub app) · **`osv-scanner.yml`** (reusable workflow v2.7.0, SARIF, hằng tuần + khi đổi lockfile) · **`lighthouse.yml`** (`treosh/lighthouse-ci-action` pin SHA, preset mobile, chỉ cảnh báo).
- **`content-bump.yml`** (nút **Xuất bản** của admin): trỏ submodule `src/content` về `content/main`, commit lên nhánh `content/bump`, mở/cập nhật PR, auto-merge (squash) nếu diff chỉ `.md/.json`, rồi `gh workflow run ci.yml --ref content/bump` để có check `build` (PR mở bằng GITHUB_TOKEN không kích hoạt `pull_request`). Merge ⇒ Workers Builds deploy.
- **Bẫy đã gặp**: khi `main` dính advisory, *mọi* PR (cả Dependabot) đỏ vì bước audit ⇒ vá gộp trong một PR rồi đóng các PR Dependabot bị thay thế. `gen-notices --check` từng đếm số gói transitive ⇒ PR bump nào cũng đỏ; nay chỉ kiểm chính sách license.

## 1. Nguyên tắc

- Tái dùng hạ tầng `poli0981/.github`: thêm reusable workflow **`web-astro-ci.yml`** + **`web-astro-deploy.yml`**, repo này chỉ chứa caller stub — đúng mô hình 15 repo hiện tại.
- **Bài học Phase 5 áp lại**: mọi caller stub khai `permissions:` tường minh (caller thiếu ⇒ GitHub hạ tất cả về `none`).
- Repo **private** ⇒ Actions tiêu phút miễn phí (Free plan: 2.000 phút/tháng). CI ước tính 3–4 phút/run → thoải mái, nhưng bật cache npm và không chạy CI cho thay đổi chỉ trong `docs/`.

## 2. Pipeline

```
PR / push main
└── ci: install(npm ci, cache) → format:check → lint → astro check + tsc
        → knip → npm audit(high, omit dev) → build → check-exif(ảnh đổi)
push main (sau ci xanh)
└── deploy: build → pagefind → wrangler deploy (site) → wrangler deploy (widgets nếu đổi)
weekly (cron)
└── osv-scanner + npm outdated report → Discord webhook
```

## 3. Caller stub mẫu (`.github/workflows/ci.yml`)

```yaml
name: CI
on:
  pull_request:
  push: { branches: [main] }
permissions:            # tường minh — không để mặc định
  contents: read
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
jobs:
  ci:
    uses: poli0981/.github/.github/workflows/web-astro-ci.yml@main
    with: { node-version: "24" }
```

Deploy stub thêm `permissions: { contents: read }` và
`secrets: { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID }` (dùng `cloudflare/wrangler-action` bên trong reusable). Notify stub (nếu nối vào hệ notify hiện có): `contents: read, actions: read` — đúng matrix đã lập.

## 4. Secrets bootstrap

Mở rộng `setup-secrets.sh` hiện có:

```bash
gh secret set CLOUDFLARE_API_TOKEN  -R poli0981/poli0981.dev
gh secret set CLOUDFLARE_ACCOUNT_ID -R poli0981/poli0981.dev
gh secret set DISCORD_WEBHOOK_CI    -R poli0981/poli0981.dev   # thông báo build
```

Secrets runtime của Worker (`TURNSTILE_SECRET`, `GITHUB_ISSUES_TOKEN`, `DISCORD_WEBHOOK_BUG`, `STEAM_*`) đặt bằng `wrangler secret put` — **không** đi qua GitHub.

## 5. Chất lượng code (chạy trong `web-astro-ci`)

| Bước | Lệnh | Cấu hình |
|---|---|---|
| Format | `prettier --check .` | + plugin astro, tailwindcss (thứ tự: tailwindcss cuối) |
| Lint | `eslint .` | flat config: `typescript-eslint` strict + `eslint-plugin-astro` + `eslint-plugin-svelte` |
| Types | `astro check && tsc --noEmit` | strict |
| Dead code | `knip` | `knip.json`: entry `astro.config.mjs`, `src/pages/**`, `src/content.config.ts`, `workers/widgets/src/index.ts`; plugin Astro tự nhận |
| Audit | `npm audit --omit=dev --audit-level=high` | fail = chặn merge |
| EXIF | `node scripts/check-exif.mjs --changed` | fail nếu ảnh có GPS |
| Notices | `node scripts/gen-notices.mjs --check` | THIRD-PARTY-NOTICES.md lệch ⇒ fail |

## 6. Dependabot (`.github/dependabot.yml`)

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule: { interval: weekly, day: monday }
    cooldown: { default-days: 3 }          # không đề xuất bản phát hành < 3 ngày tuổi
    open-pull-requests-limit: 8
    groups:
      astro:      { patterns: ["astro", "@astrojs/*"] }
      typescript: { patterns: ["typescript", "typescript-eslint"] }
      dev-tools:  { dependency-type: development }
    ignore:
      - dependency-name: typescript           # giữ TS 6 cho tooling (02 §8)
        update-types: ["version-update:semver-major"]
      - dependency-name: prettier-plugin-astro # 1.x đổi khoảng trắng hiển thị — cần PR riêng
        update-types: ["version-update:semver-major"]
  - package-ecosystem: github-actions
    directory: "/"
    schedule: { interval: weekly }
```

- `workers/widgets` không có `package.json` (không deps) nên không có mục riêng.
- `@typescript/native` (alias `npm:typescript@7`) **không** được Dependabot theo dõi — nâng tay (`17` §1).
- Chính sách merge: patch/minor xanh CI → merge trong tuần; major → đọc upgrade guide, làm branch thử. Security alerts: xử lý ≤ 48h (lịch ở `17`). PR bị một PR gộp thay thế ⇒ đóng kèm comment.

## 7. Git hooks (`lefthook.yml`)

```yaml
pre-commit:
  parallel: true
  commands:
    format: { glob: "*.{astro,svelte,ts,js,mjs,md,css,json,jsonc,yml,yaml}", run: npx prettier --write {staged_files}, stage_fixed: true }
    lint:   { glob: "*.{astro,svelte,ts,js,mjs}", run: npx eslint {staged_files} }
pre-push:
  commands:
    typecheck: { run: npm run check }   # astro check
```

Commit và tag đều ký GPG; không dùng `--no-verify`.

## 8. Branch & release

- `main` protected (ruleset): PR + check `build` xanh; merge kiểu **squash**. Conventional Commits.
- Mỗi PR: CI `build` + SonarCloud quality gate + CodeQL xanh trước khi merge; Workers Builds trên nhánh PR chỉ `versions upload`.
- **Release**: tag `vX.Y.Z` có ký GPG trên commit `main` đã deploy + GitHub Release (notes lấy từ `CHANGELOG.md`). Deploy vẫn là "merge `main`" — tag chỉ đánh dấu mốc. `v2.0.0` = đợt nâng cấp 10/2026.
- Sau merge: kiểm `https://poli0981.dev/api/health` trả đúng commit (`07` §9); nếu Workers Builds không deploy thì promote version của `main` bằng `wrangler versions deploy`.

