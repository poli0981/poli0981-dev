/**
 * Scaffold a content entry with correct frontmatter (docs 04 §5).
 *
 *   npm run new:post -- blog "Đêm render đầu tiên"
 *   npm run new:post -- story "Chương 3" --series dem-khong-tieng
 *   npm run new:post -- project "RepoLens" --lang en
 *   npm run new:post -- faq "Bạn dùng công cụ gì?"
 *
 * The templates in docs/templates/ are the single source of truth — this script only
 * substitutes placeholders. Adding a field to a schema means editing the template, and
 * the scaffolder follows automatically instead of drifting from it.
 *
 * NOTE: src/content is a git submodule (poli0981/content). Files land there, so the
 * commit belongs in that repo — the script says so after writing.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const TYPES = {
  blog: { template: "blog.md", dir: "src/content/blog" },
  story: { template: "story-chapter.md", dir: "src/content/stories" },
  project: { template: "project.md", dir: "src/content/projects" },
  faq: { template: "faq.md", dir: "src/content/faq" },
};

function usage(msg) {
  if (msg) console.error(`error: ${msg}\n`);
  console.error(`usage: npm run new:post -- <${Object.keys(TYPES).join("|")}> "Title" [options]

options:
  --lang <vi|en>     default vi
  --series <slug>    story only; the folder name under stories/, e.g. dem-khong-tieng
  --slug <slug>      override the slug derived from the title

examples:
  npm run new:post -- blog "Đêm render đầu tiên"
  npm run new:post -- story "Chương 3" --series dem-khong-tieng
  npm run new:post -- faq "Bạn dùng công cụ gì?"`);
  process.exit(1);
}

/**
 * Vietnamese title → ASCII slug. docs 04 §7 requires slugs without diacritics.
 * NFD splits a base letter from its combining marks so the marks can be dropped, but
 * đ/Đ is its own codepoint rather than d + a mark, so it needs handling by hand.
 */
function slugify(input) {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining marks exposed by NFD
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D")) // đ/Đ: own codepoints, not marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};

const [type, title] = positional;
if (!type) usage("missing type");
if (!TYPES[type]) usage(`unknown type "${type}"`);
if (!title) usage("missing title");

const lang = flag("lang") ?? "vi";
if (lang !== "vi" && lang !== "en") usage(`--lang must be vi or en, got "${lang}"`);

const series = flag("series");
if (type === "story" && !series) usage("story needs --series <slug> (the folder under stories/)");

const slug = flag("slug") ?? slugify(title);
if (!slug) usage(`could not derive a slug from "${title}" — pass --slug`);

const { template, dir } = TYPES[type];
const now = new Date();
const date = now.toISOString().slice(0, 10);

// en entries live beside vi ones with an -en suffix, matching the existing files.
const base = lang === "en" && type !== "story" ? `${slug}-en` : slug;
const target = type === "story" ? join(dir, series, `${base}.md`) : join(dir, `${base}.md`);

if (existsSync(target)) {
  console.error(`error: ${target} already exists — refusing to overwrite.`);
  process.exit(1);
}

const tpl = readFileSync(join("docs/templates", template), "utf8");
const body = tpl
  .replaceAll("{{TITLE}}", title.replaceAll('"', '\\"'))
  .replaceAll("{{LANG}}", lang)
  .replaceAll("{{DATE}}", date)
  .replaceAll("{{YEAR}}", String(now.getUTCFullYear()))
  .replaceAll("{{SERIES}}", series ?? "");

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, body);

console.log(`created ${target}`);
console.log(`
next:
  1. fill in the frontmatter (the comment block lists what each field does)
  2. \`npm run dev\` — drafts are visible there, hidden in production
  3. flip \`draft: true\` to false when ready
  4. commit in the CONTENT repo (src/content is a submodule -> poli0981/content),
     then bump the pointer here:
       git -C src/content add -A && git -C src/content commit -m "..." && git -C src/content push
       git add src/content && git commit -m "content: ..."`);
