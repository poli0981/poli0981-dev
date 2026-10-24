// Supply-chain alarm (docs 06 §6): every package in the lockfile that ships an install script
// must be on package.json#allowScripts.
//
// Locally, npm enforces this itself (.npmrc strict-allow-scripts): an unreviewed postinstall
// fails the install. CI installs with --ignore-scripts, where that check never runs — so a
// dependency that suddenly grows a postinstall (the Shai-Hulud worm shape) would slip through
// unnoticed. This keeps the alarm on in CI, without ever running the script.
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const allowed = new Set(Object.keys(pkg.allowScripts ?? {}));

const unreviewed = [];
for (const [path, entry] of Object.entries(lock.packages ?? {})) {
  if (!entry.hasInstallScript || !path) continue;
  const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
  if (!allowed.has(name)) unreviewed.push(`${name}@${entry.version}`);
}

if (unreviewed.length > 0) {
  console.error("Packages with an install script that is not on package.json#allowScripts:");
  for (const item of unreviewed) console.error(`  ${item}`);
  console.error(
    "\nReview the script, then allow it locally with `npm approve-scripts <pkg>` (or remove the dependency).",
  );
  process.exit(1);
}
console.log(`install scripts ok — all allow-listed (${[...allowed].join(", ")}).`);
