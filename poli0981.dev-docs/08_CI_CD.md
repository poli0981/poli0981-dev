# 08 — CI/CD

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
    groups:
      astro:    { patterns: ["astro", "@astrojs/*"] }
      dev-tools:{ dependency-type: development }
    open-pull-requests-limit: 8
  - package-ecosystem: npm
    directory: "/workers/widgets"
    schedule: { interval: weekly }
  - package-ecosystem: github-actions
    directory: "/"
    schedule: { interval: weekly }
```

Chính sách merge: patch/minor xanh CI → merge trong tuần; major → đọc upgrade guide, làm branch thử. Security alerts: xử lý ≤ 48h (lịch ở `17`).

## 7. Git hooks (`lefthook.yml`)

```yaml
pre-commit:
  parallel: true
  commands:
    format: { glob: "*.{astro,svelte,ts,md,css,json}", run: npx prettier --write {staged_files}, stage_fixed: true }
    lint:   { glob: "*.{astro,svelte,ts}",              run: npx eslint {staged_files} }
pre-push:
  commands:
    typecheck: { run: npm run check }   # astro check && tsc --noEmit
```

## 8. Branch & release

- `main` protected: PR + CI xanh (solo nên cho phép self-merge, vẫn bắt CI).
- Conventional Commits như các repo khác; site không cần semver release — "release" = deploy `main`. Tag mốc lớn (`v1-launch`) để tra cứu.
- Preview: `wrangler versions upload` cho preview URL trước khi merge thay đổi lớn về UI (thủ công, không bắt buộc trong CI).
