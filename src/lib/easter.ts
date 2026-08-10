/**
 * Console banner + konami code (docs 15 P3).
 *
 * Imported by the processed <script> in BaseLayout, so it is bundled and CSP-hashed
 * like everything else — no `is:inline`, no extra request.
 *
 * Deliberately cheap: one console.log at idle, and a keydown listener holding a single
 * integer. Nothing here is allowed to cost the perf budget (docs 14).
 */

const SKULL = String.raw`
   .-"""""-.
  /  _   _  \
  | (o) (o) |
  \    ^    /
   | '---' |
    '.___.'
`;

const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

function banner(): void {
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  // Two args, one %c run: keeps it to a single console entry instead of a wall.
  console.log(
    `%c${SKULL}\n  poli0981.dev — mã nguồn: https://github.com/poli0981/poli0981-dev\n  Thấy gì lạ? /legal/ai-usage · báo lỗi ở footer.\n`,
    `color:${accent || "#e8a33d"};font-family:ui-monospace,monospace;line-height:1.15`,
  );
}

function konami(): void {
  let i = 0;
  document.addEventListener("keydown", (e) => {
    // Never swallow typing in a field, and never fight the search shortcut.
    const el = e.target;
    if (el instanceof HTMLElement && (el.isContentEditable || el.tagName === "INPUT")) return;

    i = e.key === KONAMI[i] ? i + 1 : e.key === KONAMI[0] ? 1 : 0;
    if (i < KONAMI.length) return;
    i = 0;

    // Purely decorative and self-reverting: flips the accent to the horror tone for a
    // beat. No layout shift, and it respects reduced-motion by simply not animating.
    const root = document.documentElement;
    root.dataset.konami = "on";
    console.log("%c☠ Đêm không tiếng.", "color:#c2415a;font-family:ui-monospace,monospace");
    window.setTimeout(() => delete root.dataset.konami, 4000);
  });
}

/**
 * Side-effect module: importing it installs the eggs. The idle deferral lives here
 * rather than at the call site so the "never compete with first paint" rule travels
 * with the feature.
 *
 * knip lists this file as unused and that is a false positive — its only importer is a
 * `<script>` block inside BaseLayout.astro, which knip does not resolve. (bugbuffer.ts
 * escapes the same fate only because src/lib/report.ts also imports it from real TS.)
 * Hence the entry in knip.json's `ignore`.
 */
function install(): void {
  banner();
  konami();
}

if ("requestIdleCallback" in window) requestIdleCallback(() => install());
else setTimeout(install, 1200);
