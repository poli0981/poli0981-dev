import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectionOf,
  COLLECTIONS,
  galleryPhotosPath,
  newEntryPath,
  validateFrontmatter,
} from "../src/lib/admin/collections.ts";

describe("frontmatter validation", () => {
  const blog = COLLECTIONS.blog;
  const valid = { title: "T", description: "D", lang: "vi", date: "2026-10-24" };

  it("accepts a complete entry and leaves unknown keys to the build", () => {
    assert.deepEqual(
      validateFrontmatter(blog, { ...valid, tags: ["a"], draft: false, cover: "./x.jpg" }),
      [],
    );
  });

  it("reports missing required fields and wrongly shaped values", () => {
    assert.deepEqual(validateFrontmatter(blog, { lang: "vi", tags: [] }), [
      { field: "title", code: "required" },
      { field: "description", code: "required" },
      { field: "date", code: "required" },
    ]);
    assert.deepEqual(
      validateFrontmatter(blog, {
        ...valid,
        title: "x".repeat(121),
        description: 5,
        lang: "fr",
        date: "not a date",
        tags: ["ok", 3],
        draft: "yes",
        coverMedia: { id: "nope", w: 1, h: 1 },
      }),
      [
        { field: "title", code: "max" },
        { field: "description", code: "type" },
        { field: "lang", code: "option" },
        { field: "date", code: "format" },
        { field: "tags", code: "type" },
        { field: "coverMedia", code: "type" },
        { field: "draft", code: "type" },
      ],
    );
  });

  it("checks URLs, numbers and media references", () => {
    const projects = COLLECTIONS.projects;
    const base = { name: "N", tagline: "T", lang: "en", year: 2026 };
    assert.deepEqual(
      validateFrontmatter(projects, { ...base, repo: "https://github.com/x/y" }),
      [],
    );
    assert.deepEqual(validateFrontmatter(projects, { ...base, repo: "javascript:alert(1)" }), [
      { field: "repo", code: "format" },
    ]);
    assert.deepEqual(validateFrontmatter(projects, { ...base, url: 42 }), [
      { field: "url", code: "type" },
    ]);
    assert.deepEqual(validateFrontmatter(projects, { ...base, url: "not a url" }), [
      { field: "url", code: "format" },
    ]);
    assert.deepEqual(validateFrontmatter(projects, { ...base, year: Number.NaN }), [
      { field: "year", code: "type" },
    ]);
    const cover = { id: "0123456789abcdef", w: 800, h: 600, alt: "a" };
    assert.deepEqual(validateFrontmatter(projects, { ...base, coverMedia: cover }), []);
    assert.deepEqual(validateFrontmatter(projects, { ...base, coverMedia: { ...cover, w: 0 } }), [
      { field: "coverMedia", code: "type" },
    ]);
    assert.deepEqual(validateFrontmatter(projects, { ...base, coverMedia: { ...cover, alt: 1 } }), [
      { field: "coverMedia", code: "type" },
    ]);
  });

  it("names gallery photo lists by album slug", () => {
    assert.equal(galleryPhotosPath("trip-2026"), "gallery-photos/trip-2026.json");
    assert.equal(galleryPhotosPath("../x"), null);
  });

  it("holds the admin to the content schema's own rules", () => {
    const stories = COLLECTIONS.stories;
    // chapter: z.number().int().positive()
    assert.deepEqual(validateFrontmatter(stories, { ...valid, chapter: 2 }), []);
    assert.deepEqual(validateFrontmatter(stories, { ...valid, chapter: 1.5 }), [
      { field: "chapter", code: "type" },
    ]);
    assert.deepEqual(validateFrontmatter(stories, { ...valid, chapter: 0 }), [
      { field: "chapter", code: "min" },
    ]);
    // One cover only: a local `cover` (kept untouched by the admin) or an R2 `coverMedia`.
    const cover = { id: "0123456789abcdef", w: 800, h: 600 };
    assert.deepEqual(validateFrontmatter(blog, { ...valid, cover: "./x.jpg", coverMedia: cover }), [
      { field: "coverMedia", code: "conflict" },
    ]);
    // An album is a slug (the folder and gallery-photos/<album>.json are named after it).
    const gallery = COLLECTIONS.gallery;
    const album = { title: "A", lang: "vi", date: "2026-10-24", album: "game" };
    assert.deepEqual(validateFrontmatter(gallery, album), []);
    assert.deepEqual(validateFrontmatter(gallery, { ...album, album: "Game Shots" }), [
      { field: "album", code: "format" },
    ]);
  });
});

describe("admin collections", () => {
  it("creates entries only where adding one is safe", () => {
    assert.equal(newEntryPath("blog", "first-post"), "blog/first-post.md");
    assert.equal(newEntryPath("faq", "how-to"), "faq/how-to.md");
    assert.equal(
      newEntryPath("stories", "chuong-03", "dem-khong-tieng"),
      "stories/dem-khong-tieng/chuong-03.md",
    );
    // /now takes the first matching entry, legal is a fixed set, albums need photos.
    assert.equal(newEntryPath("now", "hello-world"), null);
    assert.equal(newEntryPath("legal", "cookies"), null);
    assert.equal(newEntryPath("gallery", "trip"), null);
  });

  it("rejects bad slugs; a story without a series is a one-shot", () => {
    assert.equal(newEntryPath("blog", "Hello World"), null);
    assert.equal(newEntryPath("blog", "../x"), null);
    assert.equal(newEntryPath("stories", "chuong-03", "Bad Series"), null);
    assert.equal(newEntryPath("stories", "mot-dem"), "stories/mot-dem.md");
  });

  it("only maps editable content paths to a collection", () => {
    assert.equal(collectionOf("now/now-en.md")?.id, "now");
    assert.equal(collectionOf("blog/lan-dau-viet-truyen.mdx")?.id, "blog");
    assert.equal(collectionOf("stories/dem-khong-tieng/chuong-01.md")?.id, "stories");
    assert.equal(collectionOf("stories/mot-dem.md")?.id, "stories");
    for (const path of [
      "README.md",
      "blog/../README.md",
      "gallery-photos/game.json",
      "blog/x.txt",
      ".github/x.md",
      "stories/a/b/c.md",
    ]) {
      assert.equal(collectionOf(path), null, path);
    }
  });
});
