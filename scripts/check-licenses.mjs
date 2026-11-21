/**
 * Licence check over the whole dependency tree. CI runs it in the `build` job (docs 08 §6).
 *
 *   node scripts/check-licenses.mjs
 *
 * gen-notices.mjs writes THIRD-PARTY-NOTICES.md from the direct dependencies only (what is
 * installed differs per platform, and that file must not). This check reads package-lock.json
 * instead, which records the declared licence of EVERY package — transitive ones and each
 * platform's binaries included — so it gives the same answer on Windows and on Linux CI, with
 * nothing installed.
 *
 * A package passes when its licence expression is satisfied by ALLOWED, or by the one licence
 * its REVIEWED entry clears (scripts/license-policy.mjs). A package with no licence, or one
 * that is not an SPDX expression, fails. So does a REVIEWED entry that no longer matches any
 * package: the list should say what is actually in the tree.
 */
import { readFileSync } from "node:fs";
import { ALLOWED, REVIEWED, reviewFor, satisfies } from "./license-policy.mjs";

const PREFIX = "node_modules/";
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));

/** null when the package is fine, "reviewed" when its REVIEWED entry clears it, else why not. */
function verdict(name, license) {
  if (!license) return "declares no licence";
  try {
    if (satisfies(license, ALLOWED)) return null;
    const review = reviewFor(name);
    if (review && satisfies(license, new Set([...ALLOWED, review.license]))) return "reviewed";
    return `${license} is outside the policy`;
  } catch (error) {
    return error.message;
  }
}

const problems = new Set();
const byName = (a, b) => a.localeCompare(b);
const reviewed = new Set();
const usedReviews = new Set();
let total = 0;

for (const [path, entry] of Object.entries(lock.packages ?? {})) {
  // "" is this project; anything without node_modules/ would be a workspace or a link.
  if (!path.includes(PREFIX) || entry.link) continue;
  const name = path.slice(path.lastIndexOf(PREFIX) + PREFIX.length);
  total++;
  const result = verdict(name, entry.license);
  if (result === "reviewed") {
    reviewed.add(name);
    usedReviews.add(reviewFor(name));
  } else if (result) {
    problems.add(`${name}@${entry.version}: ${result}`);
  }
}

for (const entry of REVIEWED) {
  if (!usedReviews.has(entry)) {
    problems.add(`REVIEWED entry for ${entry.packages.join(", ")} matches no package — remove it`);
  }
}

if (problems.size > 0) {
  console.error(`Licence check failed (${problems.size}):`);
  for (const problem of [...problems].sort(byName)) console.error(`  ${problem}`);
  console.error(
    "Clear a package in REVIEWED (scripts/license-policy.mjs) with a reason, or drop it.",
  );
  process.exit(1);
}
console.log(
  `licences ok — ${total} packages in package-lock.json; cleared by review: ` +
    `${reviewed.size} (${[...reviewed].sort(byName).join(", ")})`,
);
