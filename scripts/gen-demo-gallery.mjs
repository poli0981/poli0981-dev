// Generate EXIF-clean placeholder images for the demo gallery album.
// One-off helper: run `npm run gen-demo-gallery`, commit the output JPGs.
// Replace src/assets/gallery/demo/ with real photos later (run strip-exif on them).
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const OUT = "src/assets/gallery/demo";
await mkdir(OUT, { recursive: true });

const W = 1600;
const H = 1067; // 3:2
// Base colours (ink-night → accent hues), matching the site palette mood.
const HUES = [
  [31, 111, 235],
  [46, 160, 67],
  [219, 109, 40],
  [139, 92, 246],
  [217, 70, 90],
];

for (let i = 0; i < HUES.length; i++) {
  const [r, g, b] = HUES[i];
  const buf = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    const t = y / H; // vertical fade toward near-black
    const rr = Math.round(r * (1 - t * 0.78) + 13 * t);
    const gg = Math.round(g * (1 - t * 0.78) + 17 * t);
    const bb = Math.round(b * (1 - t * 0.78) + 23 * t);
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      buf[o] = rr;
      buf[o + 1] = gg;
      buf[o + 2] = bb;
    }
  }
  const label = String(i + 1).padStart(2, "0");
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
      `<text x="50%" y="53%" font-family="sans-serif" font-size="240" font-weight="700" ` +
      `fill="#ffffff" fill-opacity="0.88" text-anchor="middle">${label}</text></svg>`,
  );
  const file = join(OUT, `demo-${label}.jpg`);
  // sharp writes no metadata unless asked → EXIF-clean by construction.
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } })
    .composite([{ input: svg }])
    .jpeg({ quality: 82 })
    .toFile(file);
  console.log(`wrote ${file}`);
}
console.log(`done: ${HUES.length} placeholder image(s)`);
