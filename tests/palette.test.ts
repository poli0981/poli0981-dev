// The palette: global.css and src/lib/palette.ts must agree, and every text / control
// colour must hold WCAG AA on the surfaces it is used on.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { PALETTE, type Theme } from "../src/lib/palette.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

interface Rule {
  selectors: string[];
  declarations: Map<string, string>;
}

/** Flat CSS rules, comments dropped. Nested blocks (@media) yield their inner rules. */
function rules(source: string): Rule[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...css.matchAll(/([^{};]+)\{([^{}]*)\}/g)].map(([, head, body]) => ({
    selectors: head.split(",").map((s) => s.trim()),
    declarations: new Map(
      [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [
        name,
        value.trim().toLowerCase(),
      ]),
    ),
  }));
}

function ruleFor(list: Rule[], selector: string): Rule {
  const rule = list.find((r) => r.selectors.includes(selector));
  assert.ok(rule, `no rule for ${selector}`);
  return rule;
}

const kebab = (key: string) => `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = ["text", "muted", "accent", "accentStrong", "horror", "ok", "warn", "err"];

/** The AA pairs: `text` colours on every surface, control edges, and text on accent. */
function assertAA(label: string, get: (key: string) => string | undefined, text = TEXT) {
  const checks: [string, string, number][] = [["accentContrast", "accent", 4.5]];
  for (const bg of ["bg", "surface", "elevated"]) {
    for (const fg of text) checks.push([fg, bg, 4.5]);
    checks.push(["lineStrong", bg, 3]); // WCAG 1.4.11, non-text contrast
  }
  for (const [fg, bg, min] of checks) {
    const [a, b] = [get(fg), get(bg)];
    assert.ok(a && b, `${label}: ${fg} or ${bg} is missing`);
    const ratio = contrast(a, b);
    assert.ok(ratio >= min, `${label}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
  }
}

const global = rules(read("src/styles/global.css"));

describe("palette", () => {
  for (const theme of Object.keys(PALETTE) as Theme[]) {
    it(`global.css carries the ${theme} palette from palette.ts`, () => {
      const { declarations } = ruleFor(global, `[data-theme="${theme}"]`);
      for (const [key, value] of Object.entries(PALETTE[theme])) {
        assert.equal(declarations.get(kebab(key)), value.toLowerCase(), `${theme} ${kebab(key)}`);
      }
    });

    it(`${theme} text and control colours meet WCAG AA`, () => {
      const palette: Record<string, string> = PALETTE[theme];
      assertAA(theme, (key) => palette[key]);
    });
  }

  it("gives the reader's paper and dark backgrounds the site palettes", () => {
    assert.ok(
      ruleFor(global, `[data-theme="light"]`).selectors.includes(`[data-reader-theme="paper"]`),
    );
    assert.ok(
      ruleFor(global, `[data-theme="dark"]`).selectors.includes(`[data-reader-theme="dark"]`),
    );
  });

  it("keeps the sepia reader palette readable", () => {
    const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(
      read("src/layouts/StoryReaderLayout.astro"),
    );
    assert.ok(style, "StoryReaderLayout has no <style>");
    const { declarations } = ruleFor(rules(style[1]), `.reader[data-reader-theme="sepia"]`);
    // Sepia redefines the reading surface only; status colours come from the site theme.
    assertAA("sepia", (key) => declarations.get(kebab(key)), [
      "text",
      "muted",
      "accent",
      "accentStrong",
    ]);
  });

  it("uses only palette colours in the static files that cannot import it", () => {
    const known = new Set(Object.values(PALETTE.dark).map((v) => v.toLowerCase()));
    for (const file of ["public/favicon.svg", "public/skullhop.js"]) {
      for (const [hex] of read(file).matchAll(/#[0-9a-f]{6}\b/gi)) {
        assert.ok(known.has(hex.toLowerCase()), `${file}: ${hex} is not a dark palette colour`);
      }
    }
  });
});
