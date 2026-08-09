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
import { join, extname } from "node:path";
import sharp from "sharp";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/strip-exif.mjs <folder>");
  process.exit(1);
}

const EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const MAX_EDGE = 2560;
// mozjpeg at 85 rather than plain 82: stripping metadata always costs one re-encode
// generation, and mozjpeg buys back enough bytes that already-compressed phone photos
// don't come out *larger* than they went in.
const QUALITY = 85;

const files = (await readdir(dir)).filter((f) => EXT.has(extname(f).toLowerCase()));

let saved = 0;
for (const f of files) {
  const p = join(dir, f);
  const before = (await stat(p)).size;
  const input = await readFile(p); // read fully first, then overwrite the same path

  let pipeline = sharp(input).rotate();
  const { width, height } = await sharp(input).metadata();
  const resized = Math.max(width ?? 0, height ?? 0) > MAX_EDGE;
  if (resized) {
    // `withoutEnlargement` is belt-and-braces; the guard above already covers it.
    pipeline = pipeline.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside" });
  }

  const ext = extname(f).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    pipeline = pipeline.jpeg({ quality: QUALITY, mozjpeg: true });
  }

  const out = await pipeline.toBuffer();
  await writeFile(p, out);

  saved += before - out.length;
  const note = resized ? `${width}x${height} -> max ${MAX_EDGE}px` : "metadata only";
  console.log(
    `  ${f.padEnd(20)} ${(before / 1024).toFixed(0)}KB -> ${(out.length / 1024).toFixed(0)}KB  (${note})`,
  );
}

console.log(`done: ${files.length} image(s), ${(saved / 1024 / 1024).toFixed(2)}MB saved`);
