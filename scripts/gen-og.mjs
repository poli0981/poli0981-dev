// Build-time Open Graph image generation. Runs in Node (see src/lib/og.ts for why a
// prerendered endpoint can't do this). Reads content frontmatter, renders a 1200x630 card
// per entry with Satori + resvg, and writes to dist/client/og/<key>.png.
//
// The `ogKey` logic here MUST stay in sync with src/lib/og.ts.
import satori from "satori";
import { html } from "satori-html";
import { Resvg } from "@resvg/resvg-js";
import matter from "gray-matter";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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

const BADGES = {
  blog: { vi: "Blog", en: "Blog" },
  story: { vi: "Truyện", en: "Story" },
  project: { vi: "Dự án", en: "Project" },
};

// The signature Waveline motif, as an inline SVG (Satori renders paths; resvg rasterizes).
const WAVE = `<svg width="240" height="26" viewBox="0 0 120 20" fill="none"><path d="M2 10 H30 L38 3 L50 17 L62 4 L74 15 L84 10 H118" stroke="#e8a33d" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function ogKey(section, id) {
  return `${section}-${id.replace(/\//g, "__")}`;
}

const SHELL = (inner) =>
  `<div style="display:flex; flex-direction:column; justify-content:space-between; width:1200px; height:630px; background:#0d1117; padding:72px; font-family:Bricolage;">${inner}</div>`;

// NOTE: satori-html's `html` must be called as a function on a plain string —
// its tagged-template form escapes interpolated HTML fragments (the wave/strip).
function entryCard({ title, badge, cw }) {
  const t = esc(title);
  const size = t.length > 70 ? 50 : t.length > 45 ? 60 : 74;
  const strip = cw
    ? `<div style="display:flex; align-items:center; align-self:flex-start; padding:6px 18px; border-radius:999px; background:#3a1720; color:#e79aa4; font-size:22px; font-weight:500;">CW · ${esc(cw)}</div>`
    : "";
  return html(
    SHELL(`
    <div style="display:flex; align-items:center; justify-content:space-between;">
      <div style="display:flex; padding:10px 22px; border:2px solid #2a3242; border-radius:999px; color:#98a0ae; font-size:26px; font-weight:500;">${esc(badge)}</div>
      ${WAVE}
    </div>
    <div style="display:flex; flex-direction:column; gap:20px;">
      ${strip}
      <span style="color:#e9e4d8; font-size:${size}px; font-weight:700; line-height:1.08;">${t}</span>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span style="color:#e8a33d; font-size:30px; font-weight:700;">poli0981.dev</span>
      <span style="color:#98a0ae; font-size:24px; font-weight:500;">Kokone · SkullMute</span>
    </div>
  `),
  );
}

const defaultCard = html(
  SHELL(`
  <div style="display:flex; justify-content:flex-end;">${WAVE}</div>
  <div style="display:flex; flex-direction:column; gap:14px;">
    <span style="color:#e9e4d8; font-size:88px; font-weight:700;">Kokone · SkullMute</span>
    <span style="color:#98a0ae; font-size:34px; font-weight:500;">~ dev &amp; storyteller ~</span>
  </div>
  <div style="display:flex;"><span style="color:#e8a33d; font-size:30px; font-weight:700;">poli0981.dev</span></div>
`),
);

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
    const { data } = matter(readFileSync(path.join(base, relPosix), "utf8"));
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
