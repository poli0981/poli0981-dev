// Strip ALL metadata (EXIF/GPS/serial/XMP) from images by re-encoding with sharp.
// Run manually BEFORE committing any photo: `npm run strip-exif src/assets/gallery/<album>`
// sharp writes no metadata unless asked; `.rotate()` bakes EXIF orientation into pixels first.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import sharp from "sharp";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/strip-exif.mjs <folder>");
  process.exit(1);
}

const EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const files = (await readdir(dir)).filter((f) => EXT.has(extname(f).toLowerCase()));

for (const f of files) {
  const p = join(dir, f);
  const input = await readFile(p); // read fully first, then overwrite the same path
  const out = await sharp(input).rotate().toBuffer();
  await writeFile(p, out);
  console.log(`stripped ${p}`);
}
console.log(`done: ${files.length} image(s)`);
