// The licence policy shared by scripts/gen-notices.mjs and scripts/check-licenses.mjs: the
// SPDX expression evaluator and the per-package review lookup.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALLOWED, REVIEWED, reviewFor, satisfies } from "../scripts/license-policy.mjs";

describe("satisfies (SPDX expressions)", () => {
  it("accepts a single allowed identifier and refuses an unlisted one", () => {
    assert.equal(satisfies("MIT", ALLOWED), true);
    assert.equal(satisfies("GPL-2.0-only", ALLOWED), false);
  });

  it("needs one side of OR and both sides of AND", () => {
    assert.equal(satisfies("MIT OR GPL-2.0-only", ALLOWED), true);
    assert.equal(satisfies("GPL-2.0-only OR MIT", ALLOWED), true);
    assert.equal(satisfies("Apache-2.0 AND LGPL-3.0-or-later", ALLOWED), false);
    assert.equal(
      satisfies(
        "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
        new Set([...ALLOWED, "LGPL-3.0-or-later"]),
      ),
      true,
    );
  });

  it("binds AND tighter than OR and honours parentheses", () => {
    assert.equal(satisfies("GPL-2.0-only AND MIT OR ISC", ALLOWED), true);
    assert.equal(satisfies("GPL-2.0-only AND (MIT OR ISC)", ALLOWED), false);
    assert.equal(satisfies("(MIT OR Apache-2.0)", ALLOWED), true);
  });

  it("treats `X WITH exception` as X and accepts lower-case operators", () => {
    assert.equal(satisfies("Apache-2.0 WITH LLVM-exception", ALLOWED), true);
    assert.equal(satisfies("GPL-2.0-only WITH Classpath-exception-2.0", ALLOWED), false);
    assert.equal(satisfies("MIT or Apache-2.0", ALLOWED), true);
  });

  it("throws on text that is not an expression", () => {
    for (const bad of [
      "SEE LICENSE IN LICENSE",
      "",
      "(MIT",
      "MIT AND",
      "AND MIT",
      "MIT WITH",
      "MIT)",
    ]) {
      assert.throws(() => satisfies(bad, ALLOWED), SyntaxError, bad);
    }
  });
});

describe("reviewFor (per-package clearance)", () => {
  it("matches exact names and prefix patterns only", () => {
    assert.equal(reviewFor("satori")?.license, "MPL-2.0");
    assert.equal(reviewFor("@resvg/resvg-js-linux-x64-gnu")?.license, "MPL-2.0");
    assert.equal(reviewFor("lightningcss-darwin-arm64")?.license, "MPL-2.0");
    assert.equal(reviewFor("@img/sharp-libvips-linux-x64")?.license, "LGPL-3.0-or-later");
    assert.equal(reviewFor("satori-html"), undefined);
    assert.equal(reviewFor("@img/sharp-linux-x64"), undefined);
  });

  it("gives every entry a reason and a single extra licence", () => {
    for (const entry of REVIEWED) {
      assert.ok(entry.reason.length > 40, entry.packages.join(", "));
      assert.ok(!ALLOWED.has(entry.license), entry.license);
      assert.doesNotThrow(() => satisfies(entry.license, ALLOWED));
    }
  });
});
