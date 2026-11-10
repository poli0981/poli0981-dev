// Shared plumbing for the accessibility suite (`npm run test:a11y`).
//
// The suite drives a real browser against a running build — `npm run build`, then
// `npm run preview` on port 4321 (override with A11Y_BASE_URL). It uses the Chrome that is
// already installed (the CI runner ships one), so nothing is downloaded; set A11Y_CHANNEL
// to another Playwright channel ("msedge"), or to "bundled" for Playwright's own Chromium.
import assert from "node:assert/strict";
import { AxeBuilder } from "@axe-core/playwright";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const BASE = (process.env.A11Y_BASE_URL ?? "http://localhost:4321").replace(/\/+$/, "");

/** WCAG 2.2 A + AA (the target in ACCESSIBILITY.md) plus axe's best-practice rules, which
    is where heading order and landmark checks live. */
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

export const DESKTOP = { width: 1280, height: 800 };
export const PHONE = { width: 390, height: 844 };

export async function launch(): Promise<Browser> {
  const channel = process.env.A11Y_CHANNEL ?? "chrome";
  return chromium.launch(channel === "bundled" ? {} : { channel });
}

interface ContextOptions {
  colorScheme?: "dark" | "light";
  viewport?: { width: number; height: number };
  forcedColors?: "active" | "none";
  /** false = a first-time visitor, who gets the legal notice sheet. */
  acknowledged?: boolean;
}

/**
 * A fresh browser profile. Reduced motion is on so nothing is caught mid-transition (the
 * site collapses every animation under it); the service worker is blocked so each run
 * reads the build, not a cache. The site follows the OS colour scheme by default.
 */
export async function newContext(
  browser: Browser,
  {
    colorScheme = "dark",
    viewport = DESKTOP,
    forcedColors = "none",
    acknowledged = true,
  }: ContextOptions = {},
): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: BASE,
    colorScheme,
    viewport,
    forcedColors,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  if (acknowledged) {
    await context.addInitScript(() => {
      try {
        localStorage.setItem("legalAck", JSON.stringify({ v: 99, ts: 0 }));
      } catch {
        /* storage unavailable: the sheet shows, which only makes the scan stricter */
      }
    });
  }
  return context;
}

/** Load a page and wait until its `client:idle` islands have hydrated. */
export async function open(context: BrowserContext, path: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(path, { waitUntil: "load" });
  await settle(page);
  return page;
}

export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const done = () => requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        if ("requestIdleCallback" in window) requestIdleCallback(done, { timeout: 2000 });
        else setTimeout(done, 200);
      }),
  );
}

/** Fail with a readable list when axe finds anything on the page as it stands. */
export async function expectNoViolations(page: Page, label: string): Promise<void> {
  // The Turnstile widget in the report dialog is Cloudflare's iframe, not this site's
  // markup (ACCESSIBILITY.md lists it under known limitations).
  const { violations } = await new AxeBuilder({ page })
    .withTags(AXE_TAGS)
    .exclude("#report-turnstile")
    .analyze();
  const report = violations
    .map((violation) => {
      const nodes = violation.nodes
        .slice(0, 5)
        .map(
          (node) =>
            `      ${node.target.join(" ")}\n        ${node.failureSummary?.split("\n").join(" ")}`,
        )
        .join("\n");
      return `  ${violation.id} (${violation.impact}) — ${violation.help}\n${nodes}`;
    })
    .join("\n");
  assert.equal(violations.length, 0, `axe violations on ${label}:\n${report}`);
}

/** Every page of the build, as site-relative paths, read from its own sitemap. */
export async function sitemapPaths(): Promise<string[]> {
  const response = await fetch(`${BASE}/sitemap-0.xml`);
  assert.equal(response.status, 200, `${BASE}/sitemap-0.xml — is the preview server running?`);
  const xml = await response.text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => new URL(match[1]).pathname,
  );
  assert.ok(paths.length > 10, "the sitemap lists the site's pages");
  return [...new Set(paths)].sort();
}

/** The first sitemap path matching a pattern — a stand-in for "one page of this template". */
export function firstMatch(paths: string[], pattern: RegExp): string {
  const found = paths.find((path) => pattern.test(path));
  assert.ok(found, `a page matching ${pattern} exists in the sitemap`);
  return found;
}

/** What has focus, in a form that reads well in an assertion message. */
export async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "body";
    const id = el.id ? `#${el.id}` : "";
    const cls =
      typeof el.className === "string" && el.className ? `.${el.className.split(" ")[0]}` : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  });
}
