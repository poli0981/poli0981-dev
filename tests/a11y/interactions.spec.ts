// What a static scan cannot see: the things that open (menu, search, photo viewer, report
// dialog, reading settings, legal notice) scanned while open, and the keyboard contract
// around them — Esc closes, focus comes back to what opened it, and focus never lands
// underneath a fixed bar.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Browser, BrowserContext, Page } from "playwright";
import {
  DESKTOP,
  expectNoViolations,
  firstMatch,
  focused,
  launch,
  newContext,
  open,
  PHONE,
  settle,
  sitemapPaths,
} from "./support.ts";

const paths = await sitemapPaths();
const albumPath = firstMatch(paths, /^\/gallery\/[^/]+\/$/);
const chapterPath = firstMatch(paths, /^\/truyen\/[^/]+\/[^/]+\/$/);

let browser: Browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

/** Run `body` in a fresh profile and always close it. */
async function withPage(
  options: Parameters<typeof newContext>[1],
  path: string,
  body: (page: Page, context: BrowserContext) => Promise<void>,
): Promise<void> {
  const context = await newContext(browser, options);
  try {
    await body(await open(context, path), context);
  } finally {
    await context.close();
  }
}

const isInside = (page: Page, selector: string) =>
  page.evaluate((sel) => Boolean(document.activeElement?.closest(sel)), selector);

describe("menu sheet (phone)", () => {
  it("opens from the tab bar, traps focus, and Esc hands focus back", async () => {
    await withPage({ viewport: PHONE }, "/", async (page) => {
      const trigger = page.locator(".tabbar [data-menu-trigger]");
      await trigger.focus();
      await page.keyboard.press("Enter");
      await page.waitForSelector("#menu-sheet.open");
      assert.equal(await trigger.getAttribute("aria-expanded"), "true");
      assert.ok(await isInside(page, "#menu-sheet"), "focus moved into the sheet");

      await expectNoViolations(page, "menu sheet open");

      for (let i = 0; i < 30; i++) {
        await page.keyboard.press("Tab");
        assert.ok(await isInside(page, "#menu-sheet"), `Tab #${i + 1} stays in the sheet`);
      }

      await page.keyboard.press("Escape");
      await page.waitForSelector("#menu-sheet:not(.open)");
      assert.equal(await trigger.getAttribute("aria-expanded"), "false");
      assert.ok(await isInside(page, ".tabbar [data-menu-trigger]"), "focus is back on the button");
    });
  });
});

describe("search", () => {
  it("opens from its button, lists results as options, and Esc hands focus back", async () => {
    await withPage({}, "/", async (page) => {
      const trigger = page.locator("[data-search-trigger]");
      await trigger.focus();
      await page.keyboard.press("Enter");
      const field = page.locator("#search-modal [role=combobox]");
      await field.waitFor();
      assert.ok(await isInside(page, "#search-modal [role=combobox]"), "the field has focus");

      await field.fill("SkullMute");
      await page.waitForSelector("#search-modal [role=option]");
      await page.keyboard.press("ArrowDown");
      const active = await field.getAttribute("aria-activedescendant");
      assert.ok(active, "an option is active");
      assert.equal(await page.locator(`#${active}`).getAttribute("aria-selected"), "true");

      await expectNoViolations(page, "search open with results");

      // The trap has to hold with results listed: they are tabindex="-1" options, and
      // counting them once let Tab walk out of the dialog from the Esc button.
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Tab");
        assert.ok(await isInside(page, "#search-modal"), `Tab #${i + 1} stays in the search`);
      }
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press("Shift+Tab");
        assert.ok(await isInside(page, "#search-modal"), `Shift+Tab #${i + 1} stays in the search`);
      }

      // WCAG 2.5.3: the close button shows "Esc", so its name has to start with it.
      const closeName = await page.locator("#search-modal .close").getAttribute("aria-label");
      assert.match(closeName ?? "", /^Esc\b/);

      await page.keyboard.press("Escape");
      await page.waitForSelector("#search-modal", { state: "detached" });
      assert.ok(await isInside(page, "[data-search-trigger]"), "focus is back on the button");
    });
  });

  it('opens with "/" from anywhere on the page', async () => {
    await withPage({}, "/", async (page) => {
      await page.keyboard.press("/");
      await page.waitForSelector("#search-modal [role=combobox]");
      assert.ok(await isInside(page, "#search-modal"));
    });
  });
});

describe("photo viewer", () => {
  it("opens from a thumbnail, is scanned open, and Esc returns to the thumbnail", async () => {
    await withPage({}, albumPath, async (page) => {
      const thumb = page.locator("a.thumb[data-lightbox-index]").first();
      await thumb.focus();
      await page.keyboard.press("Enter");
      await page.waitForSelector(".lb[role=dialog]");
      assert.ok(await isInside(page, ".lb"), "focus moved into the viewer");

      await expectNoViolations(page, "photo viewer open");

      await page.keyboard.press("Escape");
      await page.waitForSelector(".lb", { state: "detached" });
      assert.ok(
        await isInside(page, "a.thumb[data-lightbox-index]"),
        "focus is back on a thumbnail",
      );
    });
  });
});

describe("report dialog", () => {
  it("is labelled, scanned open, and ties a too-short message to the field", async () => {
    await withPage({}, "/", async (page) => {
      await page.locator("[data-report-trigger]").first().click();
      await page.waitForSelector("dialog#report-dialog[open]");
      assert.ok(await isInside(page, "#report-desc"), "the text box has focus");

      await expectNoViolations(page, "report dialog open");

      // Sending is switched off in builds without a Turnstile site key (CI); the button is
      // hidden there and the check has nothing to press.
      const submit = page.locator("#report-submit");
      if (await submit.isVisible()) {
        await submit.click();
        const desc = page.locator("#report-desc");
        assert.equal(await desc.getAttribute("aria-invalid"), "true");
        assert.equal(await desc.getAttribute("aria-describedby"), "report-status");
        assert.ok(await isInside(page, "#report-desc"), "focus returns to the field");
        await desc.pressSequentially("x");
        assert.equal(await desc.getAttribute("aria-invalid"), null);
      }
    });
  });
});

describe("reading settings", () => {
  it("is scanned open, and Esc from inside the panel hands focus back to Aa", async () => {
    await withPage({}, chapterPath, async (page) => {
      const aa = page.locator(".rc .aa");
      await aa.focus();
      await page.keyboard.press("Enter");
      await page.waitForSelector("#reading-controls");

      await expectNoViolations(page, "reading settings open");

      await page.keyboard.press("Tab");
      assert.ok(await isInside(page, "#reading-controls"), "Tab enters the panel");
      await page.keyboard.press("Escape");
      await page.waitForSelector("#reading-controls", { state: "detached" });
      assert.equal(await focused(page), "button.aa");
    });
  });
});

/**
 * Tab (or Shift+Tab) through the page and collect every control that receives focus while
 * covered by one of the fixed bars. Stops when focus reaches `until` or after `limit`
 * presses. Forward tabbing exercises the bars at the bottom edge, backward the top ones.
 */
async function obscuredWhileTabbing(
  page: Page,
  bars: string[],
  until: string | null,
  key: "Tab" | "Shift+Tab" = "Tab",
  limit = 250,
) {
  const offenders: string[] = [];
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press(key);
    const hit = await page.evaluate(
      ({ bars, until }) => {
        const el = document.activeElement;
        if (!el || el === document.body) return { stop: false, offender: null };
        if (until && el.closest(until)) return { stop: true, offender: null };
        const r = el.getBoundingClientRect();
        for (const selector of bars) {
          const bar = document.querySelector(selector);
          if (!bar || bar.contains(el)) continue;
          const b = bar.getBoundingClientRect();
          if (b.width === 0 || b.height === 0) continue;
          const overlapX = Math.min(r.right, b.right) - Math.max(r.left, b.left);
          const overlapY = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
          if (overlapX <= 0.5 || overlapY <= 0.5) continue;
          // Overlapping is not yet hidden: the skip link is drawn over the header. What
          // counts is which of the two is on top where the control's centre is.
          const x = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
          const y = Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1);
          const top = document.elementFromPoint(x, y);
          if (top && bar.contains(top)) {
            const text = (el.textContent ?? "").trim().slice(0, 40);
            return {
              stop: false,
              offender: `${el.tagName.toLowerCase()} "${text}" under ${selector}`,
            };
          }
        }
        return { stop: false, offender: null };
      },
      { bars, until },
    );
    if (hit.offender) offenders.push(hit.offender);
    if (hit.stop) break;
  }
  return offenders;
}

describe("focus is not hidden under fixed bars (WCAG 2.4.11)", () => {
  it("phone: nothing takes focus underneath the tab bar or the header", async () => {
    await withPage({ viewport: PHONE }, "/", async (page) => {
      const offenders = await obscuredWhileTabbing(page, [".tabbar", ".site-header"], ".tabbar");
      assert.deepEqual(offenders, []);
    });
  });

  it("story reader: nothing takes focus underneath the header or the reader bar going back up", async () => {
    await withPage({ viewport: PHONE }, chapterPath, async (page) => {
      // Start from the last control of the chapter and walk backwards: only then does the
      // browser scroll controls in at the top edge, where the two sticky bars are.
      await page.evaluate(() => {
        const controls = document.querySelectorAll<HTMLElement>("main a[href], main button");
        controls[controls.length - 1]?.focus();
      });
      assert.ok(await isInside(page, "main"), "the walk starts inside the chapter");
      const offenders = await obscuredWhileTabbing(
        page,
        [".site-header", ".reader-bar"],
        ".site-header",
        "Shift+Tab",
        120,
      );
      assert.deepEqual(offenders, []);
    });
  });

  // The notice is a full-width sheet on a phone and a card in the bottom-right corner from
  // 768px up, where on a tablet it lies over the right half of the footer.
  for (const [name, viewport] of [
    ["phone", PHONE],
    ["tablet", { width: 820, height: 1180 }],
    ["small laptop", { width: 1024, height: 768 }],
    ["desktop", DESKTOP],
  ] as const) {
    it(`${name}: the legal notice is scanned, covers nothing that takes focus, and Esc dismisses it`, async () => {
      await withPage({ viewport, acknowledged: false }, "/", async (page) => {
        await page.waitForSelector("aside.gate", { timeout: 15_000 });
        await settle(page);
        await expectNoViolations(page, `legal notice showing (${name})`);

        if (name === "phone") {
          // The notice sits above the tab bar rather than on top of it.
          const sheetBottom = await page
            .locator("aside.gate")
            .evaluate((el) => el.getBoundingClientRect().bottom);
          const barTop = await page
            .locator(".tabbar")
            .evaluate((el) => el.getBoundingClientRect().top);
          assert.ok(
            sheetBottom <= barTop + 0.5,
            `sheet ends at ${sheetBottom}, tab bar starts at ${barTop}`,
          );
        }

        const offenders = await obscuredWhileTabbing(page, ["aside.gate", ".tabbar"], "aside.gate");
        assert.deepEqual(offenders, []);
        assert.ok(await isInside(page, "aside.gate"), "Tab reaches the notice");

        // The height the sheet publishes for the scroll padding has to be right with the
        // page scrolled too (Tab has scrolled it by now); a resize makes it measure again.
        const [published, covered] = await page.evaluate(() => {
          window.dispatchEvent(new Event("resize"));
          const gate = document.querySelector("aside.gate");
          const top = gate ? gate.getBoundingClientRect().top : window.innerHeight;
          const value = getComputedStyle(document.documentElement).getPropertyValue("--sheet-h");
          return [Number.parseFloat(value), window.innerHeight - top];
        });
        assert.ok(
          Math.abs(published - covered) <= 1,
          `--sheet-h is ${published}px, the sheet covers ${covered}px`,
        );

        await page.keyboard.press("Escape");
        await page.waitForSelector("aside.gate", { state: "detached" });
        const cleared = await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue("--sheet-h"),
        );
        assert.equal(cleared, "", "--sheet-h is removed with the sheet");
      });
    });
  }
});

describe("page chrome", () => {
  it("the first Tab stop is the skip link, and it leads into <main>", async () => {
    await withPage({}, "/", async (page) => {
      await page.keyboard.press("Tab");
      const skip = await page.evaluate(() => {
        const el = document.activeElement as HTMLAnchorElement;
        const r = el.getBoundingClientRect();
        return {
          href: el.getAttribute("href"),
          visible: r.width > 0 && r.bottom > 0 && r.top >= 0,
        };
      });
      assert.deepEqual(skip, { href: "#main", visible: true });

      await page.keyboard.press("Enter");
      await page.keyboard.press("Tab");
      assert.ok(await isInside(page, "main#main"), "the next Tab stop is inside <main>");
    });
  });

  it("the current page is marked by more than colour (WCAG 1.4.1)", async () => {
    await withPage({}, "/blog/", async (page) => {
      const decoration = await page
        .locator('.primary-nav a[aria-current="page"]')
        .evaluate((el) => getComputedStyle(el).textDecorationLine);
      assert.match(decoration, /underline/);
    });
    await withPage({ viewport: PHONE }, "/blog/", async (page) => {
      const bar = await page.locator('.tabbar .tab[aria-current="page"]').evaluate((el) => {
        const style = getComputedStyle(el, "::before");
        return { content: style.content, height: style.height };
      });
      assert.notEqual(bar.content, "none");
      assert.equal(bar.height, "2px");
    });
  });

  it("each half of a legal page declares its own language (WCAG 3.1.2)", async () => {
    for (const path of ["/legal/accessibility/", "/en/legal/accessibility/"]) {
      await withPage({}, path, async (page) => {
        const halves = await page.evaluate(() => {
          const en = document.querySelector('[id="english"] + *');
          const vi = document.querySelector('[id="tiếng-việt"] + *');
          return {
            en: en?.matches(":lang(en)") ?? false,
            vi: vi?.matches(":lang(vi)") ?? false,
            // The wrappers take no box: the paragraph rhythm must survive them.
            rhythm: vi ? Number.parseFloat(getComputedStyle(vi).marginBlockStart) : 0,
          };
        });
        assert.deepEqual({ en: halves.en, vi: halves.vi }, { en: true, vi: true }, path);
        assert.ok(halves.rhythm > 0, `${path}: paragraphs inside a half keep their spacing`);
      });
    }
  });

  it("the home link stays a real target when the wordmark is hidden (WCAG 2.5.8)", async () => {
    await withPage({ viewport: { width: 320, height: 640 } }, "/", async (page) => {
      const box = await page.locator(".site-header .brand").boundingBox();
      assert.ok(box && box.width >= 24 && box.height >= 24, JSON.stringify(box));
    });
  });

  /** Pages wider than the viewport, three loads at a time. */
  async function overflowing(width: number, routes: string[]): Promise<string[]> {
    const context = await newContext(browser, { viewport: { width, height: 700 } });
    const wide: string[] = [];
    try {
      for (let i = 0; i < routes.length; i += 3) {
        await Promise.all(
          routes.slice(i, i + 3).map(async (path) => {
            const page = await open(context, path);
            const overflow = await page.evaluate(
              () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
            );
            await page.close();
            if (overflow > 0) wide.push(`${path} (+${overflow}px)`);
          }),
        );
      }
    } finally {
      await context.close();
    }
    return wide;
  }

  // 320px is the WCAG 1.4.10 floor, and every page in the sitemap is held to it.
  it("no page scrolls sideways at 320px — every page (WCAG 1.4.10)", async () => {
    assert.deepEqual(await overflowing(320, paths), []);
  });

  // 360 and 390 are the common phone widths, where the header used to be wider than the
  // screen (it needs 378px in Vietnamese, 400px in English).
  for (const width of [360, 390]) {
    it(`no page scrolls sideways at ${width}px (WCAG 1.4.10)`, async () => {
      const routes = ["/", "/en/", "/blog/", chapterPath, albumPath, "/en/legal/ai-usage/"];
      assert.deepEqual(await overflowing(width, routes), []);
    });
  }
});

describe("forced colours (Windows High Contrast)", () => {
  const forced = { forcedColors: "active" } as const;
  const style = (page: Page, selector: string, property: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);

  it("the search field and the active result keep a visible indicator", async () => {
    await withPage(forced, "/", async (page) => {
      await page.keyboard.press("/");
      const field = page.locator("#search-modal [role=combobox]");
      await field.waitFor();
      assert.equal(await style(page, "#search-modal .search-row", "outline-style"), "solid");

      await field.fill("SkullMute");
      await page.waitForSelector("#search-modal [role=option]");
      await page.keyboard.press("ArrowDown");
      assert.equal(await style(page, "#search-modal .result.active", "outline-style"), "solid");
    });
  });

  it("the scrollbar switch shows its knob and its state", async () => {
    await withPage(forced, "/", async (page) => {
      const button = page.locator(".sb-switch");
      await button.scrollIntoViewIfNeeded();
      const colours = async () => ({
        knob: await style(page, ".sb-switch .knob", "background-color"),
        track: await style(page, ".sb-switch .track", "background-color"),
      });
      const off = await colours();
      assert.notEqual(off.knob, off.track, "the knob stands out from the track when off");
      await button.click();
      assert.equal(await button.getAttribute("aria-checked"), "true");
      const on = await colours();
      assert.notEqual(on.knob, on.track, "the knob stands out from the track when on");
      assert.notEqual(on.track, off.track, "on and off look different");
    });
  });

  it("the chosen reading option is filled, not just recoloured", async () => {
    await withPage(forced, chapterPath, async (page) => {
      await page.locator(".rc .aa").click();
      await page.waitForSelector("#reading-controls");
      const chosen = await style(page, "#reading-controls button.active", "background-color");
      const other = await style(page, "#reading-controls button:not(.active)", "background-color");
      assert.notEqual(chosen, other);
    });
  });
});
