// CI gate: fail the build if any CHANGED image under src/assets/ carries GPS or a
// camera serial number. Backs up the manual strip-exif discipline (docs 04 §6 / 08 §5).
// Usage: node scripts/check-exif.mjs --changed   (DIFF_BASE env set by CI; falls back to HEAD~1)
import { execSync } from "node:child_process";
import exifr from "exifr";

const sh = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const IMG = /\.(jpe?g|png|webp|avif)$/i;

function changedImages() {
  const base = process.env.DIFF_BASE;
  let range = null;
  if (base && !/^0+$/.test(base)) {
    range = `${base} HEAD`;
  } else {
    try {
      sh("git rev-parse HEAD~1");
      range = "HEAD~1 HEAD";
    } catch {
      range = null;
    }
  }
  const out = range ? sh(`git diff --name-only ${range}`) : sh("git ls-files src/assets");
  return out
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f && IMG.test(f) && f.startsWith("src/assets/"));
}

const SERIAL = ["SerialNumber", "BodySerialNumber", "LensSerialNumber"];
const offenders = [];

for (const file of changedImages()) {
  const gps = await exifr.gps(file).catch(() => null);
  const meta = await exifr.parse(file, { pick: ["Make", "Model", ...SERIAL] }).catch(() => null);
  const hasGps = gps && (gps.latitude != null || gps.longitude != null);
  const hasSerial = meta && SERIAL.some((k) => meta[k]);
  if (hasGps || hasSerial) {
    offenders.push(`${file}${hasGps ? " [GPS]" : ""}${hasSerial ? " [serial]" : ""}`);
  }
}

if (offenders.length) {
  console.error("EXIF check FAILED — run `npm run strip-exif <folder>` on:");
  for (const o of offenders) console.error("  " + o);
  process.exit(1);
}
console.log("EXIF check passed.");
