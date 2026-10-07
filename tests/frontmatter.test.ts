// The admin rewrites frontmatter on save; untouched files must come back byte-for-byte,
// and an edit must change only the edited keys. Runs against the real content submodule.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildFile, splitFile } from "../src/lib/admin/frontmatter.ts";

const CONTENT = new URL("../src/content/", import.meta.url).pathname;
const ENTRY_DIRS = ["blog", "stories", "projects", "faq", "gallery", "legal", "now"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.mdx?$/.test(name) ? [path] : [];
  });
}

describe("admin frontmatter round-trip", () => {
  const entries = ENTRY_DIRS.flatMap((dir) => {
    try {
      return files(join(CONTENT, dir));
    } catch {
      return []; // submodule not checked out
    }
  });

  it("rebuilds every content entry byte-for-byte when nothing changed", (t) => {
    if (entries.length === 0) return t.skip("src/content is not checked out");
    for (const path of entries) {
      const text = readFileSync(path, "utf8");
      const { data, body } = splitFile(text);
      assert.equal(buildFile(text, data, body), text, path);
    }
  });

  it("changes only the edited keys and keeps flow lists and quoting", () => {
    const original = `---\ntitle: "Old"\ndate: 2026-08-08\ntags: [diary, share]\n---\n\nBody text.\n`;
    const { data, body } = splitFile(original);
    const edited = buildFile(original, { ...data, title: "New: title", draft: true }, body);
    assert.equal(
      edited,
      `---\ntitle: "New: title"\ndate: 2026-08-08\ntags: [diary, share]\ndraft: true\n---\n\nBody text.\n`,
    );
  });

  it("drops emptied keys and writes new files with a body separator", () => {
    const created = buildFile(null, { title: "T", lang: "vi", tags: [], updated: "" }, "Hello");
    assert.equal(created, `---\ntitle: T\nlang: vi\n---\n\nHello\n`);
    assert.equal(buildFile(null, { title: "T" }, ""), `---\ntitle: T\n---\n`);
  });
});
