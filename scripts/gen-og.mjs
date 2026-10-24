// Build-time Open Graph image generation. Runs in Node (see src/lib/og.ts for why a
// prerendered endpoint can't do this). Reads content frontmatter, renders a 1200x630 card
// per entry with Satori + resvg, and writes to dist/client/og/<key>.png. File names come
// from ogKey() in src/lib/og.ts — the same function the pages use to link to them (Node
// runs the .ts file directly).
import satori from "satori";
import { html } from "satori-html";
import { Resvg } from "@resvg/resvg-js";
import { parse as parseYaml } from "yaml";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ogKey } from "../src/lib/og.ts";
import { PALETTE } from "../src/lib/palette.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const fontsDir = path.join(root, "src/assets/fonts");
const fonts = [
  {
    name: "Bricolage",
    data: readFileSync(path.join(fontsDir, "BricolageGrotesque-Medium.ttf")),
    weight: 500,
    style: "normal",
  },
  {
    name: "Bricolage",
    data: readFileSync(path.join(fontsDir, "BricolageGrotesque-Bold.ttf")),
    weight: 700,
    style: "normal",
  },
];

// Cards are always dark: they show up in feeds of either theme, and dark carries the
// brand. Colours come from the site palette (src/lib/palette.ts).
const C = PALETTE.dark;

/** `a` blended into `b` at `weight` (0–1), as #rrggbb — Satori has no color-mix(). */
function mix(a, b, weight) {
  const rgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x
    .map((v, i) =>
      Math.round(v * weight + y[i] * (1 - weight))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

const BADGES = {
  blog: { vi: "Blog", en: "Blog" },
  story: { vi: "Truyện", en: "Story" },
  project: { vi: "Dự án", en: "Project" },
};

// The signature Waveline motif, as an inline SVG (Satori renders paths; resvg rasterizes).
const WAVE = `<svg width="240" height="26" viewBox="0 0 120 20" fill="none"><path d="M2 10 H30 L38 3 L50 17 L62 4 L74 15 L84 10 H118" stroke="${C.accent}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const SHELL = (inner) =>
  `<div style="display:flex; flex-direction:column; justify-content:space-between; width:1200px; height:630px; background:${C.bg}; padding:72px; font-family:Bricolage;">${inner}</div>`;

// NOTE: satori-html's `html` must be called as a function on a plain string —
// its tagged-template form escapes interpolated HTML fragments (the wave/strip).
function entryCard({ title, badge, cw }) {
  const t = esc(title);
  const size = t.length > 70 ? 50 : t.length > 45 ? 60 : 74;
  const strip = cw
    ? `<div style="display:flex; align-items:center; align-self:flex-start; padding:6px 18px; border-radius:999px; background:${mix(C.horror, C.bg, 0.18)}; color:${C.horror}; font-size:22px; font-weight:500;">CW · ${esc(cw)}</div>`
    : "";
  return html(
    SHELL(`
    <div style="display:flex; align-items:center; justify-content:space-between;">
      <div style="display:flex; padding:10px 22px; border:2px solid ${C.line}; border-radius:999px; color:${C.muted}; font-size:26px; font-weight:500;">${esc(badge)}</div>
      ${WAVE}
    </div>
    <div style="display:flex; flex-direction:column; gap:20px;">
      ${strip}
      <span style="color:${C.text}; font-size:${size}px; font-weight:700; line-height:1.08;">${t}</span>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span style="color:${C.accent}; font-size:30px; font-weight:700;">poli0981.dev</span>
      <span style="color:${C.muted}; font-size:24px; font-weight:500;">Kokone · SkullMute</span>
    </div>
  `),
  );
}

const defaultCard = html(
  SHELL(`
  <div style="display:flex; justify-content:flex-end;">${WAVE}</div>
  <div style="display:flex; flex-direction:column; gap:14px;">
    <span style="color:${C.text}; font-size:88px; font-weight:700;">Kokone · SkullMute</span>
    <span style="color:${C.muted}; font-size:34px; font-weight:500;">~ dev &amp; storyteller ~</span>
  </div>
  <div style="display:flex;"><span style="color:${C.accent}; font-size:30px; font-weight:700;">poli0981.dev</span></div>
`),
);

// Frontmatter only (the body is never needed here). gray-matter was dropped: its js-yaml@3 →
// argparse@1 → sprintf-js chain carries an advisory with no fixed version. YAML 1.2 core
// schema is fine — no date fields are read below.
function frontmatter(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(src);
  return (m && parseYaml(m[1])) || {};
}

async function render(node) {
  const svg = await satori(node, { width: 1200, height: 630, fonts });
  return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
}

const contentRoot = path.join(root, "src/content");
const outDir = path.join(root, "dist/client/og");
mkdirSync(outDir, { recursive: true });

const SECTIONS = [
  { dir: "blog", section: "blog", titleKey: "title" },
  { dir: "stories", section: "story", titleKey: "title" },
  { dir: "projects", section: "project", titleKey: "name" },
];

let count = 0;
for (const { dir, section, titleKey } of SECTIONS) {
  const base = path.join(contentRoot, dir);
  let files;
  try {
    files = readdirSync(base, { recursive: true });
  } catch {
    continue; // collection dir may not exist yet
  }
  for (const rel of files) {
    const relPosix = String(rel).replace(/\\/g, "/");
    if (!/\.(md|mdx)$/.test(relPosix)) continue;
    if (path.basename(relPosix).startsWith("_")) continue;
    const data = frontmatter(readFileSync(path.join(base, relPosix), "utf8"));
    if (data.draft === true) continue;
    const id = relPosix.replace(/\.(md|mdx)$/, "");
    const lang = data.lang === "en" ? "en" : "vi";
    const title = data[titleKey] ?? id;
    const cw =
      section === "story" && Array.isArray(data.contentWarning) && data.contentWarning.length
        ? data.contentWarning.join(" · ")
        : null;
    const png = await render(entryCard({ title, badge: BADGES[section][lang], cw }));
    writeFileSync(path.join(outDir, `${ogKey(section, id)}.png`), png);
    count++;
  }
}

writeFileSync(path.join(outDir, "default.png"), await render(defaultCard));
console.log(`[og] generated ${count + 1} OG images → dist/client/og/`);
