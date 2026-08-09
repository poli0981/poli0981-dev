/**
 * CSP guard: every inline <script> in the built HTML must be covered by a hash in that
 * page's own Content-Security-Policy meta tag.
 *
 * Astro hashes the scripts it controls, but NOT `is:inline` ones — see
 * core/csp/common.js `trackScriptHashes()`, which only walks bundled scripts, client
 * directives, island prebuilts, and `settings.scripts` (the `injectScript()` hook).
 * An `is:inline` script therefore ships unhashed and is blocked wherever it appears
 * after the meta tag in document order. That is exactly how /500 and /429 shipped with
 * dead scripts, and how the theme bootstrap survived only by sitting *before* the meta.
 *
 * Run after `astro build`. Exits non-zero and names the offender.
 *
 * JSON-LD blocks are skipped on purpose: `script-src` does not apply to non-executable
 * data blocks, and Astro deliberately leaves them unhashed.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const ROOT = "dist/client";
const CSP_META = /<meta http-equiv="content-security-policy" content="([^"]*)"/i;
// Matches what a *browser* executes, not what Astro happens to emit. This guard exists to
// notice scripts nobody expected, so a matcher that only recognises the tidy form reports
// "all clear" on exactly the surprise it was built to catch. Following HTML's tag grammar:
//   /i             `<SCRIPT>` runs just fine
//   (\s[^>]*)?     after the tag name, either `>` or whitespace-then-anything. Requiring
//                  the whitespace is what stops `<scripting>` matching.
//   <\/script(\s[^>]*)?>   end tags take the same shape — `</script >` and even
//                  `</script foo>` are valid end tags whose attributes the parser discards.
// CodeQL js/bad-tag-filter found three separate holes here, one patch at a time, so the
// cases below are now asserted on every run instead of being re-reasoned from scratch.
const SCRIPT = /<script(\s[^>]*)?>([\s\S]*?)<\/script(\s[^>]*)?>/gi;
const JSON_LD = /type=("|')?application\/ld\+json/i;

/** Tag forms a browser executes (or doesn't). Asserted before every real run. */
const SELFTEST = [
  ["<script>X</script>", true, "plain"],
  ["<SCRIPT>X</SCRIPT>", true, "uppercase"],
  ["<ScRiPt>X</ScRiPt>", true, "mixed case"],
  ["<script defer>X</script>", true, "with attributes"],
  ['<script type="module">X</script>', true, "typed"],
  ["<script\n  defer\n>X</script>", true, "newlines in the start tag"],
  ["<script>X</script >", true, "space before the end-tag close"],
  ["<script>X</script\t\n bar>", true, "end tag with junk (HTML discards it)"],
  ["<scripting>X</scripting>", false, "different element, must not match"],
  ["<noscript>X</noscript>", false, "different element, must not match"],
];

function selftest() {
  const failures = SELFTEST.filter(([html, shouldMatch]) => {
    SCRIPT.lastIndex = 0;
    return SCRIPT.test(html) !== shouldMatch;
  });
  if (failures.length > 0) {
    console.error("CSP guard SELFTEST FAILED — the script matcher is wrong:\n");
    for (const [html, shouldMatch, label] of failures) {
      console.error(`  ${label}: expected ${shouldMatch ? "match" : "no match"} for ${html}`);
    }
    console.error("\nA guard that mis-parses script tags silently passes the very thing it");
    console.error("is meant to catch. Fix the pattern before trusting any 'ok' below.");
    process.exit(1);
  }
}

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

selftest();

const offenders = [];
let pages = 0;
let scripts = 0;

for (const file of htmlFiles(ROOT)) {
  const html = readFileSync(file, "utf8");
  const meta = CSP_META.exec(html);
  if (!meta) continue; // error pages opt out of CSP entirely
  pages += 1;

  const declared = new Set([...meta[1].matchAll(/sha256-[A-Za-z0-9+/=]+/g)].map((m) => m[0]));

  for (const match of html.matchAll(SCRIPT)) {
    const [, attrs, body] = match;
    if (!body.trim() || JSON_LD.test(attrs)) continue;
    scripts += 1;
    const hash = `sha256-${createHash("sha256").update(body, "utf8").digest("base64")}`;
    if (!declared.has(hash)) {
      offenders.push({ file, hash, preview: body.trim().slice(0, 80) });
    }
  }
}

if (offenders.length > 0) {
  console.error(`CSP check FAILED — ${offenders.length} inline script(s) missing a hash:\n`);
  for (const o of offenders) {
    console.error(`  ${o.file}\n    ${o.hash}\n    ${o.preview}...\n`);
  }
  console.error(
    "Fix: prefer a processed <script> (Astro bundles + hashes it), or for code that must\n" +
      "run inline before paint, add it via injectScript('head-inline', ...) in astro.config.mjs.",
  );
  process.exit(1);
}

console.log(`CSP check ok — ${scripts} inline scripts across ${pages} pages, all hashed.`);
