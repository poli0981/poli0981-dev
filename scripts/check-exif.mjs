// CI gate: fail the build if an image under src/assets/ carries GPS or a camera serial
// number. Backs up the manual strip-exif discipline (docs 04 §6 / 08 §5).
//
//   node scripts/check-exif.mjs            every image under src/assets/
//   node scripts/check-exif.mjs --changed  only images changed since DIFF_BASE (set by CI;
//                                          falls back to HEAD~1, then to every image)
import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import exifr from "exifr";

// core.quotePath=false: git otherwise prints non-ASCII paths (Vietnamese file names) quoted
// and octal-escaped, which then never match the src/assets/ filter and were silently skipped.
const sh = (cmd) => execSync(`git -c core.quotePath=false ${cmd}`, { encoding: "utf8" }).trim();
const IMG = /\.(jpe?g|png|webp|avif)$/i;

function changedRange() {
  const base = process.env.DIFF_BASE;
  if (base && !/^0+$/.test(base)) return `${base} HEAD`;
  try {
    sh("rev-parse --verify --quiet HEAD~1");
    return "HEAD~1 HEAD";
  } catch {
    return null; // a single-commit history: check everything
  }
}

function images() {
  const range = process.argv.includes("--changed") ? changedRange() : null;
  const out = range
    ? sh(`diff --name-only --diff-filter=d ${range} -- src/assets`)
    : sh("ls-files src/assets");
  return out
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f && IMG.test(f) && f.startsWith("src/assets/"));
}

const SERIAL = ["SerialNumber", "BodySerialNumber", "LensSerialNumber"];
const offenders = [];
const files = images();

for (const file of files) {
  try {
    // Hand exifr the bytes, not the path: its own file reader throws on current Node ("The
    // options argument must be of type object"), and the old .catch(() => null) turned that
    // into "no EXIF" — the check passed every image without reading one.
    const bytes = await readFile(file);
    const gps = await exifr.gps(bytes);
    const meta = await exifr.parse(bytes, { pick: ["Make", "Model", ...SERIAL] });
    const hasGps = gps && (gps.latitude != null || gps.longitude != null);
    const hasSerial = meta && SERIAL.some((k) => meta[k]);
    if (hasGps || hasSerial) {
      offenders.push(`${file}${hasGps ? " [GPS]" : ""}${hasSerial ? " [serial]" : ""}`);
    }
  } catch (error) {
    // An image exifr can't read is an image nobody verified — fail rather than wave it on.
    offenders.push(`${file} [unreadable: ${error instanceof Error ? error.message : error}]`);
  }
}

if (offenders.length) {
  console.error("EXIF check FAILED — run `npm run strip-exif <folder>` on:");
  for (const o of offenders) console.error("  " + o);
  process.exit(1);
}
console.log(`EXIF check passed (${files.length} image${files.length === 1 ? "" : "s"}).`);
