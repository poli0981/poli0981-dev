// axe-core over every page of the build. The list comes from the build's own sitemap, so a
// new page or post is covered the day it exists and a deleted one cannot break the suite.
import { after, before, describe, it } from "node:test";
import type { Browser, BrowserContext } from "playwright";
import {
  expectNoViolations,
  firstMatch,
  launch,
  newContext,
  open,
  PHONE,
  sitemapPaths,
} from "./support.ts";

const paths = await sitemapPaths();

// Pages the sitemap leaves out on purpose, which visitors still land on. The two missing
// pages answer 404 with the site's own error page, one per language.
const NOT_FOUND = ["/khong-co-trang-nay/", "/en/no-such-page/"];
const unlisted = [...NOT_FOUND, "/offline/"];

// One page of every template for the second theme and the phone layout: the light palette
// and the narrow layout change colours and chrome, not the structure of every single post.
// A template added later belongs in this list.
const templates = [
  "/",
  "/en/",
  firstMatch(paths, /^\/about\/$/),
  firstMatch(paths, /^\/blog\/$/),
  firstMatch(paths, /^\/blog\/tag\/[^/]+\/$/),
  firstMatch(paths, /^\/blog\/(?!tag\/)[^/]+\/$/),
  firstMatch(paths, /^\/truyen\/$/),
  firstMatch(paths, /^\/truyen\/[^/]+\/[^/]+\/$/),
  firstMatch(paths, /^\/projects\/$/),
  firstMatch(paths, /^\/projects\/[^/]+\/$/),
  firstMatch(paths, /^\/gallery\/$/),
  firstMatch(paths, /^\/gallery\/[^/]+\/$/),
  firstMatch(paths, /^\/gaming\/$/),
  firstMatch(paths, /^\/dev\/$/),
  firstMatch(paths, /^\/dev\/uses\/$/),
  firstMatch(paths, /^\/qa\/$/),
  firstMatch(paths, /^\/links\/$/),
  firstMatch(paths, /^\/now\/$/),
  firstMatch(paths, /^\/legal\/accessibility\/$/),
  firstMatch(paths, /^\/en\/legal\/accessibility\/$/),
  ...NOT_FOUND,
];

let browser: Browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

function scan(title: string, routes: string[], options: Parameters<typeof newContext>[1]) {
  describe(title, { concurrency: 4 }, () => {
    let context: BrowserContext;
    before(async () => {
      context = await newContext(browser, options);
    });
    after(async () => {
      await context?.close();
    });

    for (const route of routes) {
      it(route, async () => {
        const page = await open(context, route, NOT_FOUND.includes(route) ? 404 : 200);
        try {
          await expectNoViolations(page, `${route} (${title})`);
        } finally {
          await page.close();
        }
      });
    }
  });
}

scan("dark theme, desktop — every page", [...paths, ...unlisted], { colorScheme: "dark" });
scan("light theme, desktop — one page per template", templates, { colorScheme: "light" });
scan("dark theme, phone — one page per template", templates, {
  colorScheme: "dark",
  viewport: PHONE,
});
scan("light theme, phone — one page per template", templates, {
  colorScheme: "light",
  viewport: PHONE,
});
// Below 384px the header swaps the language name for its code and, below 352px, drops the
// wordmark: scan those two layouts as well.
scan("dark theme, 360px — both home pages", ["/", "/en/"], {
  viewport: { width: 360, height: 780 },
});
scan("dark theme, 320px — both home pages", ["/", "/en/"], {
  viewport: { width: 320, height: 640 },
});
