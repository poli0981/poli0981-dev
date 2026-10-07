import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectionOf, newEntryPath } from "../src/lib/admin/collections.ts";

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

  it("rejects bad slugs and stories without a series", () => {
    assert.equal(newEntryPath("blog", "Hello World"), null);
    assert.equal(newEntryPath("blog", "../x"), null);
    assert.equal(newEntryPath("stories", "chuong-03"), null);
  });

  it("only maps editable content paths to a collection", () => {
    assert.equal(collectionOf("now/now-en.md")?.id, "now");
    assert.equal(collectionOf("blog/lan-dau-viet-truyen.mdx")?.id, "blog");
    assert.equal(collectionOf("stories/dem-khong-tieng/chuong-01.md")?.id, "stories");
    for (const path of [
      "README.md",
      "blog/../README.md",
      "gallery-photos/game.json",
      "blog/x.txt",
      ".github/x.md",
    ]) {
      assert.equal(collectionOf(path), null, path);
    }
  });
});
