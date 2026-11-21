/**
 * Licence policy shared by scripts/gen-notices.mjs (direct dependencies → the table in
 * THIRD-PARTY-NOTICES.md) and scripts/check-licenses.mjs (every package in package-lock.json).
 * See docs 08 §6 and docs 12.
 *
 * The code is GPL-3.0-only. ALLOWED holds the licences that need no discussion. Anything else
 * has to be cleared PER PACKAGE in REVIEWED, with a reason: clearing a licence for everyone
 * would let the next package under it in without anyone looking (that is how
 * @axe-core/playwright once passed under a note written for satori).
 */

/** SPDX licence identifiers that need no review. */
export const ALLOWED = new Set([
  "MIT",
  "Apache-2.0",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "OFL-1.1",
  "0BSD",
  "Unlicense",
  "CC0-1.0",
  "BlueOak-1.0.0",
  "Python-2.0",
]);

/**
 * Packages cleared by hand: `packages` are exact names or a prefix ending in `*`, `license`
 * is the one extra licence the entry allows for them. "We shipped it anyway" is not a reason.
 */
export const REVIEWED = [
  {
    packages: ["satori", "@resvg/resvg-js", "@resvg/resvg-js-*"],
    license: "MPL-2.0",
    reason:
      "File-level copyleft. Used unmodified at build time to draw the OG cards " +
      "(scripts/gen-og.mjs); never shipped to the browser or the Worker.",
  },
  {
    packages: ["axe-core", "@axe-core/playwright"],
    license: "MPL-2.0",
    reason:
      "File-level copyleft. Runs only in the accessibility tests (tests/a11y); never shipped.",
  },
  {
    packages: ["lightningcss", "lightningcss-*"],
    license: "MPL-2.0",
    reason:
      "File-level copyleft. Vite and Tailwind run it unmodified at build time to transform " +
      "this site's own CSS; the tool itself is not shipped.",
  },
  {
    packages: ["@img/sharp-libvips-*", "@img/sharp-win32-*", "@img/sharp-wasm32"],
    license: "LGPL-3.0-or-later",
    reason:
      "sharp's prebuilt libvips, loaded unmodified by Astro's image service at build time; " +
      "none of it is shipped. LGPL-3.0 is compatible with GPL-3.0.",
  },
];

/** The REVIEWED entry that covers a package, if any. */
export function reviewFor(name) {
  return REVIEWED.find((entry) =>
    entry.packages.some((pattern) =>
      pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : name === pattern,
    ),
  );
}

/**
 * Whether an SPDX licence expression is satisfied by a set of allowed identifiers:
 * `A OR B` needs one side, `A AND B` needs both, parentheses group, and `X WITH exception`
 * counts as X (an exception only adds permissions). Throws a SyntaxError for anything that
 * is not an expression, such as "SEE LICENSE IN LICENSE".
 */
export function satisfies(expression, allowed) {
  const tokens = expression.replaceAll("(", " ( ").replaceAll(")", " ) ").trim().split(/\s+/);
  let at = 0;
  const isOperator = (token, op) => token?.toUpperCase() === op;
  const fail = () => {
    throw new SyntaxError(`Not an SPDX expression: "${expression}"`);
  };

  function primary() {
    const token = tokens[at++];
    if (token === "(") {
      const value = anyOf();
      if (tokens[at++] !== ")") fail();
      return value;
    }
    if (!token || token === ")" || ["AND", "OR", "WITH"].some((op) => isOperator(token, op))) {
      fail();
    }
    if (isOperator(tokens[at], "WITH")) {
      if (!tokens[at + 1]) fail();
      at += 2;
    }
    return allowed.has(token);
  }
  function allOf() {
    let value = primary();
    while (isOperator(tokens[at], "AND")) {
      at++;
      const next = primary();
      value = value && next;
    }
    return value;
  }
  function anyOf() {
    let value = allOf();
    while (isOperator(tokens[at], "OR")) {
      at++;
      const next = allOf();
      value = value || next;
    }
    return value;
  }

  const result = anyOf();
  if (at !== tokens.length) fail();
  return result;
}
