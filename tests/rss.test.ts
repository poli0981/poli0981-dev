// The three RSS endpoints: combined, blog-only and story-only feeds.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { APIContext } from "astro";
import { setCollection } from "./support/stubs/astro-content.ts";
import { GET as allFeed } from "../src/pages/rss.xml.ts";
import { GET as blogFeed } from "../src/pages/blog/rss.xml.ts";
import { GET as storyFeed } from "../src/pages/truyen/rss.xml.ts";

const entry = (id: string, lang: string, date: string) => ({
  id,
  data: {
    title: `Title ${id}`,
    description: `About ${id}`,
    lang,
    date: new Date(date),
    tags: ["dev"],
    draft: false,
  },
});

before(() => {
  setCollection("blog", [
    entry("post-vi", "vi", "2026-10-01"),
    entry("post-en", "en", "2026-10-03"),
  ]);
  setCollection("stories", [entry("series/ch-1", "vi", "2026-10-02")]);
});

const xml = async (feed: (context: APIContext) => Promise<Response>, site?: string) =>
  (await feed({ site: site ? new URL(site) : undefined } as APIContext)).text();

describe("RSS feeds", () => {
  it("mixes blog posts and chapters, newest first, both locales", async () => {
    const body = await xml(allFeed, "https://poli0981.dev");
    const links = [...body.matchAll(/<link>([^<]+)<\/link>/g)].map((m) => m[1]);
    assert.deepEqual(links.slice(1), [
      "https://poli0981.dev/en/blog/post-en/",
      "https://poli0981.dev/truyen/series/ch-1/",
      "https://poli0981.dev/blog/post-vi/",
    ]);
    assert.match(body, /<dc:language>en-us<\/dc:language>/);
  });

  it("splits blog and story feeds, falling back to the site URL", async () => {
    const blog = await xml(blogFeed);
    assert.match(blog, /poli0981\.dev — blog/);
    assert.doesNotMatch(blog, /ch-1/);
    const stories = await xml(storyFeed);
    assert.match(stories, /poli0981\.dev — truyện/);
    assert.match(stories, /About series\/ch-1/);
    assert.doesNotMatch(stories, /post-vi/);
  });
});
