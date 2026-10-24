// Prepare photos for committing: strip ALL metadata AND enforce the size budget.
// Run manually BEFORE committing any photo: `npm run strip-exif src/assets/gallery/<album>`
//
// Two jobs, because docs 04 §5 states two rules for a committed photo and having them in
// separate tools meant the second one was never actually applied:
//   1. No metadata. sharp writes none unless asked; `.rotate()` bakes EXIF orientation
//      into the pixels first so the image still looks right after the metadata is gone.
//      (`scripts/check-exif.mjs` is the CI gate that fails if this was skipped.)
//   2. Max 2560px on the long edge, max ~1.5MB. Phone photos arrive at 6048x8064 / 2.5MB,
//      which is a pointless amount of bytes for a 400-800px gallery thumbnail and blows
//      out both the repo and the Astro build.
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, extname, relative, resolve, sep } from "node:path";
import sharp from "sharp";

const ASSETS = resolve("src/assets");
const arg = process.argv[2];
if (!arg) {
  console.error("usage: node scripts/strip-exif.mjs <folder under src/assets/>");
  process.exit(1);
}
// The tool rewrites every image it finds in place, so it only ever walks src/assets.
const dir = resolve(arg);
if (dir !== ASSETS && !dir.startsWith(ASSETS + sep)) {
  console.error(`refusing to touch ${arg}: only folders under src/assets/ are processed`);
  process.exit(1);
}

const EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const MAX_EDGE = 2560;
const MAX_BYTES = 1.5 * 1024 * 1024;
// mozjpeg at 85 rather than plain 82: stripping metadata always costs one re-encode
// generation, and mozjpeg buys back enough bytes that already-compressed phone photos
// don't come out *larger* than they went in. Over budget, step down to at most 70.
const QUALITIES = [85, 80, 75, 70];

/** Every image under `root`, subfolders included. */
async function imagesUnder(root) {
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) out.push(...(await imagesUnder(full)));
    else if (EXT.has(extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

async function encode(input, ext, resized, quality) {
  let pipeline = sharp(input).rotate();
  if (resized) {
    pipeline = pipeline.resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  if (ext === ".jpg" || ext === ".jpeg") pipeline = pipeline.jpeg({ quality, mozjpeg: true });
  return pipeline.toBuffer();
}

const files = await imagesUnder(dir);
let saved = 0;
const overBudget = [];

for (const p of files) {
  const before = (await stat(p)).size;
  const input = await readFile(p); // read fully first, then overwrite the same path
  const { width, height } = await sharp(input).metadata();
  const resized = Math.max(width ?? 0, height ?? 0) > MAX_EDGE;
  const ext = extname(p).toLowerCase();

  let out = await encode(input, ext, resized, QUALITIES[0]);
  for (const quality of QUALITIES.slice(1)) {
    if (out.length <= MAX_BYTES || (ext !== ".jpg" && ext !== ".jpeg")) break;
    out = await encode(input, ext, resized, quality);
  }
  await writeFile(p, out);
  if (out.length > MAX_BYTES) overBudget.push(relative(".", p));

  saved += before - out.length;
  const note = resized ? `${width}x${height} -> max ${MAX_EDGE}px` : "metadata only";
  console.log(
    `  ${relative(dir, p).padEnd(28)} ${(before / 1024).toFixed(0)}KB -> ${(out.length / 1024).toFixed(0)}KB  (${note})`,
  );
}

console.log(`done: ${files.length} image(s), ${(saved / 1024 / 1024).toFixed(2)}MB saved`);
if (overBudget.length) {
  console.warn(`still over ${MAX_BYTES / 1024 / 1024}MB (resize or recompress by hand):`);
  for (const file of overBudget) console.warn(`  ${file}`);
}
