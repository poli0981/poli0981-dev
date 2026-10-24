// R2 media: URL/variant helpers, the upload pipeline, /media serving, and /ext-img.
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  fakeContext,
  FakeCache,
  FakeImages,
  FakeKV,
  FakeR2,
  installCaches,
} from "./support/fakes.ts";
import {
  MEDIA_ID,
  mediaFallbackSrc,
  mediaPictureHtml,
  mediaSrcset,
  mediaUrl,
  variantKey,
  variantWidths,
} from "../src/lib/media.ts";
import { galleryPhotoListSchema, mediaRefSchema } from "../src/lib/media-schema.ts";
import {
  deleteMedia,
  listMedia,
  processUpload,
  readMediaRecord,
  UploadError,
  writeMediaRecord,
} from "../src/lib/media/process.ts";
import { serveMedia } from "../src/lib/media/serve.ts";
import { externalImageKey, externalImagePath, serveExternalImage } from "../src/lib/ext-img.ts";

describe("media URLs", () => {
  it("builds capped, de-duplicated variant widths", () => {
    assert.deepEqual(variantWidths("avif", 3000), [480, 800, 1200]);
    assert.deepEqual(variantWidths("avif", 1000), [480, 800, 1000]);
    assert.deepEqual(variantWidths("webp", 600), [600]);
    assert.deepEqual(variantWidths("webp", 800), [800]);
  });

  it("derives keys, URLs, srcsets and the <picture> snippet", () => {
    const media = { id: "0123456789abcdef", w: 1600, h: 900 };
    assert.equal(variantKey(media.id, "webp", 800), "v1/0123456789abcdef/webp-800");
    assert.equal(mediaUrl(media.id, "avif", 480), "/media/v1/0123456789abcdef/avif-480");
    assert.equal(
      mediaSrcset(media, "webp"),
      "/media/v1/0123456789abcdef/webp-800 800w, /media/v1/0123456789abcdef/webp-1600 1600w",
    );
    assert.equal(mediaFallbackSrc(media), "/media/v1/0123456789abcdef/webp-800");
    const html = mediaPictureHtml(media, `Quote "this" & <that>`);
    assert.match(html, /alt="Quote &quot;this&quot; &amp; &lt;that&gt;"/);
    assert.match(html, /<source type="image\/avif"/);
    assert.ok(MEDIA_ID.test(media.id));
  });

  it("validates media references and album photo lists", () => {
    assert.equal(mediaRefSchema.safeParse({ id: "0123456789abcdef", w: 1, h: 1 }).success, true);
    assert.equal(mediaRefSchema.safeParse({ id: "XYZ", w: 1, h: 1 }).success, false);
    const photo = { id: "0123456789abcdef", w: 10, h: 10, caption: { vi: "a", en: "b" } };
    assert.equal(galleryPhotoListSchema.safeParse({ photos: [photo] }).success, true);
    assert.equal(
      galleryPhotoListSchema.safeParse({ photos: [{ ...photo, caption: { vi: "a" } }] }).success,
      false,
    );
  });
});

describe("media upload pipeline", () => {
  let r2: FakeR2;
  let images: FakeImages;
  let env: Env;

  beforeEach(() => {
    r2 = new FakeR2();
    images = new FakeImages();
    env = { MEDIA: r2.asBinding(), IMAGES: images.asBinding() } as unknown as Env;
    installCaches();
  });

  const bytes = (...head: number[]) => new Uint8Array([...head, ...new Array(16).fill(0)]).buffer;
  const JPEG = bytes(0xff, 0xd8, 0xff);
  const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

  it("sniffs every accepted format by magic bytes, never by the claimed type", async () => {
    const samples = [
      JPEG,
      bytes(0x89, ...ascii("PNG")),
      bytes(...ascii("GIF8")),
      bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")),
      bytes(0, 0, 0, 0, ...ascii("ftypavif")),
      bytes(0, 0, 0, 0, ...ascii("ftypheic")),
    ];
    for (const sample of samples) {
      const { created } = await processUpload(env, sample.slice(0), { name: "x", alt: "" });
      assert.equal(created, true);
      r2.store.clear();
    }
    await assert.rejects(
      processUpload(env, bytes(...ascii("<svg")), { name: "x.svg", alt: "" }),
      (error: unknown) => error instanceof UploadError && error.status === 415,
    );
    await assert.rejects(
      processUpload(env, new ArrayBuffer(21 * 1024 * 1024), { name: "big", alt: "" }),
      (error: unknown) => error instanceof UploadError && error.status === 413,
    );
  });

  it("stores a metadata-free master, every variant and a record — once", async () => {
    images.fallbackFrom.add("image/avif"); // Cloudflare may answer an AVIF request with WebP
    const { record, created } = await processUpload(env, JPEG.slice(0), {
      name: "n".repeat(300),
      alt: " Alt ",
    });
    assert.equal(created, true);
    assert.equal(record.alt, "Alt");
    assert.equal(record.name.length, 200);
    assert.deepEqual([record.w, record.h], [2400, 1600]);
    assert.deepEqual(
      record.variants.map((v) => [v.key.split("/")[2], v.contentType]),
      [
        ["avif-480", "image/webp"],
        ["avif-800", "image/webp"],
        ["avif-1200", "image/webp"],
        ["webp-800", "image/webp"],
        ["webp-1600", "image/webp"],
      ],
    );
    assert.ok(r2.store.has(`private/master/${record.id}`));

    const again = await processUpload(env, JPEG.slice(0), { name: "x", alt: "" });
    assert.equal(again.created, false);
    assert.equal(images.outputs.length, 6); // master + 5 variants, never repeated
  });

  it("refuses an image whose size can't be read", async () => {
    images.infoFails = true;
    await assert.rejects(
      processUpload(env, JPEG.slice(0), { name: "x", alt: "" }),
      (error: unknown) => error instanceof UploadError && error.status === 400,
    );
  });

  it("lists the library newest first across pages, reads and rewrites records", async () => {
    r2.pageSize = 1;
    for (const [id, createdAt] of [
      ["aaaaaaaaaaaaaaaa", "2026-10-01T00:00:00Z"],
      ["bbbbbbbbbbbbbbbb", "2026-10-03T00:00:00Z"],
    ] as const) {
      await writeMediaRecord(env, {
        id,
        w: 1,
        h: 2,
        alt: "a",
        name: "n",
        bytes: 1,
        createdAt,
        variants: [],
      });
    }
    await r2.put("private/meta/cccccccccccccccc.json", "{}"); // no custom metadata
    const items = await listMedia(env);
    // Newest first; the record without custom metadata falls back to its upload time.
    assert.deepEqual(
      items.map((i) => i.id),
      ["bbbbbbbbbbbbbbbb", "aaaaaaaaaaaaaaaa", "cccccccccccccccc"],
    );
    assert.equal(items[2].createdAt, "2026-10-01T00:00:00.000Z");
    assert.equal((await readMediaRecord(env, "aaaaaaaaaaaaaaaa"))?.w, 1);
    assert.equal(await readMediaRecord(env, "dddddddddddddddd"), null);
  });

  it("deletes every object of an image and purges this colo's cache", async () => {
    const cache = installCaches(new FakeCache());
    const { record } = await processUpload(env, JPEG.slice(0), { name: "x", alt: "" });
    await deleteMedia(env, record.id, "https://poli0981.dev");
    assert.equal(r2.store.size, 0);
    assert.equal(cache.deleted.length, record.variants.length);
    await deleteMedia(env, "eeeeeeeeeeeeeeee", "https://poli0981.dev"); // unknown id: no throw
  });
});

describe("/media serving", () => {
  const KEY = "v1/0123456789abcdef/webp-800";
  let r2: FakeR2;
  let env: Env;

  beforeEach(async () => {
    r2 = new FakeR2();
    await r2.put(KEY, "image-bytes", { httpMetadata: { contentType: "image/webp" } });
    env = { MEDIA: r2.asBinding() } as unknown as Env;
    installCaches();
  });

  const get = async (path: string, init: RequestInit = {}) => {
    const ctx = fakeContext();
    const response = await serveMedia(
      new Request(`https://poli0981.dev${path}`, init),
      env,
      ctx as unknown as ExecutionContext,
    );
    await ctx.settle();
    return response;
  };

  it("serves a variant immutable and sandboxed, then from the edge cache", async () => {
    const first = await get(`/media/${KEY}?w=1`);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("content-type"), "image/webp");
    assert.match(first.headers.get("cache-control") ?? "", /immutable/);
    assert.match(first.headers.get("content-security-policy") ?? "", /sandbox/);
    assert.equal(await first.text(), "image-bytes");
    r2.store.clear(); // the second read must come from the cache
    assert.equal(await (await get(`/media/${KEY}`)).text(), "image-bytes");
  });

  it("answers revalidation, HEAD, unknown keys and other methods", async () => {
    const etag = (await get(`/media/${KEY}`)).headers.get("etag") ?? "";
    assert.equal(
      (await get(`/media/${KEY}`, { headers: { "if-none-match": `W/"x", ${etag}` } })).status,
      304,
    );
    const head = await get(`/media/${KEY}`, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    assert.equal((await get("/media/v1/0123456789abcdef/webp-1600")).status, 404);
    assert.equal((await get("/media/private/master/0123456789abcdef")).status, 404);
    assert.equal((await get(`/media/${KEY}`, { method: "POST" })).status, 405);
  });
});

describe("/ext-img", () => {
  it("maps stored feed URLs to same-origin paths, and nothing else", () => {
    assert.equal(
      externalImagePath("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg"),
      "/ext-img/yt/abcdefghijk",
    );
    const hash = "0123456789abcdef0123456789abcdef01234567";
    assert.equal(
      externalImagePath(
        `https://media.steampowered.com/steamcommunity/public/images/apps/570/${hash}.jpg`,
      ),
      `/ext-img/steam/570/${hash}`,
    );
    assert.equal(externalImagePath("/ext-img/yt/abcdefghijk"), "/ext-img/yt/abcdefghijk");
    assert.equal(externalImagePath("https://evil.example/x.jpg"), null);
    assert.equal(externalImageKey(`/ext-img/steam/570/${hash}`), `widgets:img:steam:570:${hash}`);
    assert.equal(externalImageKey("/ext-img/yt/../../x"), null);
  });

  it("serves only mirrored pictures from KV", async () => {
    const kv = new FakeKV();
    await kv.put("widgets:img:yt:abcdefghijk", new Uint8Array([1, 2, 3]), {
      metadata: { type: "image/jpeg" },
    });
    const serve = (
      path: string,
      method = "GET",
      binding: KVNamespace | undefined = kv.asBinding(),
    ) => serveExternalImage(new Request(`https://poli0981.dev${path}`, { method }), binding);

    const hit = await serve("/ext-img/yt/abcdefghijk");
    assert.equal(hit.status, 200);
    assert.equal(hit.headers.get("content-type"), "image/jpeg");
    assert.match(hit.headers.get("content-security-policy") ?? "", /sandbox/);
    assert.deepEqual(new Uint8Array(await hit.arrayBuffer()), new Uint8Array([1, 2, 3]));
    assert.equal(await (await serve("/ext-img/yt/abcdefghijk", "HEAD")).text(), "");
    assert.equal((await serve("/ext-img/yt/zzzzzzzzzzz")).status, 404);
    assert.equal((await serve("/ext-img/elsewhere")).status, 404);
    const noKv = await serveExternalImage(
      new Request("https://poli0981.dev/ext-img/yt/abcdefghijk"),
      undefined,
    );
    assert.equal(noKv.status, 404);
    assert.equal((await serve("/ext-img/yt/abcdefghijk", "DELETE")).status, 405);

    await kv.put("widgets:img:yt:noTypeAtAll", new Uint8Array([9]));
    assert.equal(
      (await serve("/ext-img/yt/noTypeAtAll")).headers.get("content-type"),
      "image/jpeg",
    );
  });
});
