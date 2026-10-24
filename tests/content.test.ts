// Content plumbing: collection queries, getStaticPaths builders, gallery albums, widgets.
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { setCollection, clearCollections } from "./support/stubs/astro-content.ts";
import { setWorkerEnv } from "./support/stubs/cloudflare-workers.ts";
import { FakeKV } from "./support/fakes.ts";

// gallery.ts runs import.meta.glob at module load, so its fixtures exist before the import.
const image = (src: string) => ({ src, width: 800, height: 600, format: "jpg" });
globalThis.$globFixtures = {
  "/src/assets/gallery/**/*.{avif,webp,jpg,jpeg,png}": {
    "/src/assets/gallery/trip/trip-10.jpg": image("t10"),
    "/src/assets/gallery/trip/trip-2.jpg": image("t2"),
    "/src/assets/gallery/nocaptions/a.jpg": image("a"),
    "/src/assets/gallery/halfcaption/a.jpg": image("h"),
  },
  "/src/assets/gallery/**/captions.json": {
    "/src/assets/gallery/trip/captions.json": {
      "trip-2.jpg": { vi: "Hai", en: "Two" },
      "trip-10.jpg": { vi: "Mười", en: "Ten" },
    },
    "/src/assets/gallery/halfcaption/captions.json": { "a.jpg": { vi: "Chỉ vi" } },
  },
  "/src/content/gallery-photos/*.json": {
    "/src/content/gallery-photos/trip.json": {
      photos: [{ id: "0123456789abcdef", w: 10, h: 10, caption: { vi: "R2", en: "R2" } }],
    },
    "/src/content/gallery-photos/r2only.json": {
      photos: [{ id: "0123456789abcdef", w: 10, h: 10, caption: { vi: "R2", en: "R2" } }],
    },
    "/src/content/gallery-photos/broken.json": { photos: [{ id: "nope" }] },
  },
};

const collections = await import("../src/lib/collections.ts");
const pages = await import("../src/lib/pages.ts");
const gallery = await import("../src/lib/gallery.ts");
const widgets = await import("../src/lib/widgets.ts");

const d = (iso: string) => new Date(iso);
const post = (id: string, lang: string, date: string, extra: Record<string, unknown> = {}) => ({
  id,
  data: { title: `T ${id}`, lang, date: d(date), tags: [], draft: false, ...extra },
});

beforeEach(() => {
  clearCollections();
  setCollection("blog", [
    post("old", "vi", "2026-01-01", { tags: ["dev"], translationKey: "k" }),
    post("new", "vi", "2026-03-01", { tags: ["dev", "diary"] }),
    post("hidden", "vi", "2026-04-01", { draft: true }),
    post("old-en", "en", "2026-01-02", { translationKey: "k" }),
  ]);
  setCollection("stories", [
    post("series/ch-2", "vi", "2026-02-02", { chapter: 2 }),
    post("series/ch-1", "vi", "2026-02-01", { chapter: 1 }),
    post("one-shot", "vi", "2026-05-01"),
  ]);
  setCollection("projects", [
    post("a", "vi", "2026-01-01", { featured: false, year: 2026 }),
    post("b", "vi", "2026-01-01", { featured: true, year: 2024 }),
    post("c", "vi", "2026-01-01", { featured: false, year: 2025 }),
  ]);
  setCollection("faq", [
    { id: "q2", data: { lang: "vi", order: 2 } },
    { id: "q1", data: { lang: "vi", order: 1 } },
  ]);
  setCollection("gallery", [
    { id: "trip", data: { lang: "vi", album: "trip", date: d("2026-02-01") } },
    { id: "r2only", data: { lang: "vi", album: "r2only", date: d("2026-03-01") } },
  ]);
});

describe("collection queries", () => {
  it("drops drafts, filters by locale and sorts newest first", async () => {
    assert.deepEqual(
      (await collections.getBlogPosts("vi")).map((e) => e.id),
      ["new", "old"],
    );
    assert.deepEqual(
      (await collections.getAllBlogPosts()).map((e) => e.id),
      ["new", "old-en", "old"],
    );
    assert.deepEqual(
      (await collections.getStoryChapters("vi")).map((e) => e.id),
      ["one-shot", "series/ch-2", "series/ch-1"],
    );
    assert.equal((await collections.getAllStoryChapters()).length, 3);
    assert.deepEqual(
      (await collections.getProjects("vi")).map((e) => e.id),
      ["b", "a", "c"],
    );
    assert.deepEqual(
      (await collections.getFaqs("vi")).map((e) => e.id),
      ["q1", "q2"],
    );
    assert.deepEqual(
      (await collections.getGalleryAlbums("vi")).map((e) => e.id),
      ["r2only", "trip"],
    );
    assert.deepEqual(
      (await collections.getLatestMixed("vi", 2)).map((item) => [item.kind, item.entry.id]),
      [
        ["story", "one-shot"],
        ["blog", "new"],
      ],
    );
  });

  it("counts reading time, tags, translations and story ids", async () => {
    assert.equal(collections.readingTime(undefined), 1);
    assert.equal(collections.readingTime("word ".repeat(1000)), 5);
    assert.deepEqual(collections.collectTags(await collections.getBlogPosts("vi")), [
      { tag: "dev", count: 2 },
      { tag: "diary", count: 1 },
    ]);
    const [, old] = await collections.getBlogPosts("vi");
    assert.equal((await collections.findTranslation("blog", old as never))?.id, "old-en");
    const [newest] = await collections.getBlogPosts("vi");
    assert.equal(await collections.findTranslation("blog", newest as never), null);
    assert.deepEqual(collections.parseStoryId("series/ch-1"), { series: "series", slug: "ch-1" });
    assert.deepEqual(collections.parseStoryId("one-shot"), { series: null, slug: "one-shot" });
  });
});

describe("static paths", () => {
  it("links blog posts to their older/newer neighbours", async () => {
    const paths = await pages.blogPostPaths("vi");
    assert.deepEqual(
      paths.map((p) => [p.params.slug, p.props.prev?.href ?? null, p.props.next?.href ?? null]),
      [
        ["new", "/blog/old/", null],
        ["old", null, "/blog/new/"],
      ],
    );
    const tags = await pages.blogTagPaths("vi");
    assert.deepEqual(
      tags.map((t) => [t.params.tag, t.props.posts.length]),
      [
        ["dev", 2],
        ["diary", 1],
      ],
    );
    assert.deepEqual(
      (await pages.projectPaths("vi")).map((p) => p.params.slug),
      ["b", "a", "c"],
    );
  });

  it("orders story chapters within a series and skips one-shots", async () => {
    const paths = await pages.storyChapterPaths("vi");
    assert.deepEqual(
      paths.map((p) => [p.params.slug, p.props.prev?.href ?? null, p.props.next?.href ?? null]),
      [
        ["ch-1", null, "/truyen/series/ch-2/"],
        ["ch-2", "/truyen/series/ch-1/", null],
      ],
    );
    assert.equal(paths[0].props.seriesTocHref, "/truyen/");
  });

  it("builds album pages with their photos", async () => {
    const paths = await pages.galleryAlbumPaths("vi");
    assert.deepEqual(
      paths.map((p) => [p.params.album, p.props.photos.length]),
      [
        ["r2only", 1],
        ["trip", 3],
      ],
    );
  });

  it("lists every legal document, whatever its language", async () => {
    setCollection("legal", [
      { id: "privacy", data: { title: { vi: "Riêng tư", en: "Privacy" } } },
      { id: "terms", data: { title: { vi: "Điều khoản", en: "Terms" } } },
    ]);
    const paths = await pages.legalPaths();
    assert.deepEqual(
      paths.map((p) => [p.params.slug, p.props.entry.id]),
      [
        ["privacy", "privacy"],
        ["terms", "terms"],
      ],
    );
  });
});

describe("gallery albums", () => {
  it("merges local photos (natural filename order) with R2 photos", async () => {
    const photos = await gallery.getAlbumPhotos("trip");
    assert.deepEqual(
      photos.map((p) => (p.kind === "local" ? p.alt.en : `r2:${p.alt.en}`)),
      ["Two", "Ten", "r2:R2"],
    );
    assert.equal((await gallery.getAlbumCover("trip", 99)).kind, "media");
    assert.equal((await gallery.getAlbumCover("trip", -5)).alt.en, "Two");
  });

  it("fails the build on missing captions, invalid lists and empty albums", async () => {
    await assert.rejects(gallery.getAlbumPhotos("nocaptions"), /Missing .*captions\.json/);
    await assert.rejects(gallery.getAlbumPhotos("halfcaption"), /Missing vi\/en caption/);
    await assert.rejects(gallery.getAlbumPhotos("broken"), /Invalid/);
    await assert.rejects(gallery.getAlbumPhotos("nothing"), /has no photos/);
  });
});

describe("widgets snapshot", () => {
  it("reads the feeds from KV, or answers nulls without it", async () => {
    setWorkerEnv({});
    assert.deepEqual(await widgets.getWidgetSnapshot(), {
      yt: null,
      steam: null,
      gh: null,
      status: null,
    });
    const kv = new FakeKV();
    await kv.put("widgets:gh", JSON.stringify({ updated: "t", items: [] }));
    setWorkerEnv({ KV: kv.asBinding() });
    const snapshot = await widgets.getWidgetSnapshot();
    assert.deepEqual(snapshot.gh, { updated: "t", items: [] });
    assert.equal(snapshot.yt, null);
  });
});
