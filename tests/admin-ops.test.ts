// The admin's operations side: the audit log (lib/admin/audit), the dashboard, activity and
// security routes, the denylist editing helpers, and gallery covers / album deletion.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { APIContext } from "astro";
import { setServerEnv } from "./support/stubs/astro-env-server.ts";
import { setWorkerEnv } from "./support/stubs/cloudflare-workers.ts";
import { FakeGitHub } from "./support/github.ts";
import { captureLogs, FakeKV, FakeR2 } from "./support/fakes.ts";

// gallery.ts reads the local album folders at module load: two local photos in "game".
const image = (src: string) => ({ src, width: 800, height: 600, format: "jpg" });
globalThis.$globFixtures = {
  "/src/assets/gallery/**/*.{avif,webp,jpg,jpeg,png}": {
    "/src/assets/gallery/game/a.jpg": image("a"),
    "/src/assets/gallery/game/b.jpg": image("b"),
  },
};

const { listAudit, recordAudit } = await import("../src/lib/admin/audit.ts");
const { readDenylist, writeDenylist, loadDenylist, resetDenylistMemo } =
  await import("../src/lib/denylist.ts");
const activityApi = await import("../src/pages/api/admin/activity.ts");
const contentApi = await import("../src/pages/api/admin/content.ts");
const galleryApi = await import("../src/pages/api/admin/gallery.ts");
const mediaApi = await import("../src/pages/api/admin/media.ts");
const overviewApi = await import("../src/pages/api/admin/overview.ts");
const publishApi = await import("../src/pages/api/admin/publish.ts");
const securityApi = await import("../src/pages/api/admin/security.ts");

const TOKEN = "content-token";
const OWNER = "owner@example.com";

let github: FakeGitHub | null = null;
afterEach(() => github?.restore());

const ctx = (request: Request) =>
  ({
    request,
    url: new URL(request.url),
    locals: { admin: { email: OWNER } },
  }) as unknown as APIContext;
const call = async (handler: unknown, request: Request) =>
  (await (handler as (c: APIContext) => Promise<Response>)(ctx(request))) as Response;
const get = (path: string) => new Request(`https://admin.poli0981.dev${path}`);
const send = (method: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://admin.poli0981.dev${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("lib/admin/audit", () => {
  it("keeps entries newest first, trimmed, for 90 days", async () => {
    const kv = new FakeKV();
    await recordAudit(kv.asBinding(), { admin: OWNER, action: "publish", target: "x" }, 1_000);
    await recordAudit(
      kv.asBinding(),
      { admin: OWNER, action: "content.save", target: "p".repeat(500), detail: "sha" },
      2_000,
    );
    const entries = await listAudit(kv.asBinding());
    assert.deepEqual(
      entries.map((e) => [e.action, e.at, e.target.length, e.detail]),
      [
        ["content.save", "1970-01-01T00:00:02.000Z", 200, "sha"],
        ["publish", "1970-01-01T00:00:01.000Z", 1, undefined],
      ],
    );
    assert.ok([...kv.store.values()].every((entry) => entry.ttl === 90 * 24 * 60 * 60));
    assert.equal((await listAudit(kv.asBinding(), 1)).length, 1);
  });

  it("never fails the action it logs", async () => {
    await recordAudit(undefined, { admin: OWNER, action: "publish", target: "x" });
    const kv = new FakeKV();
    kv.failWith = new Error("KV down");
    const { logs } = await captureLogs(() =>
      recordAudit(kv.asBinding(), { admin: OWNER, action: "publish", target: "x" }),
    );
    assert.equal(logs[0]?.event, "admin.audit_failed");
  });
});

describe("lib/denylist editing", () => {
  it("reads straight from KV and drops expired entries on write", async () => {
    const kv = new FakeKV();
    await kv.put("denylist", JSON.stringify([{ cidr: "198.51.100.7" }, { cidr: "not an ip" }]));
    assert.deepEqual(await readDenylist(kv.asBinding()), [{ cidr: "198.51.100.7" }]);

    resetDenylistMemo();
    await loadDenylist(kv.asBinding()); // memoized copy, about to go stale
    const kept = await writeDenylist(
      kv.asBinding(),
      [{ cidr: "198.51.100.7", until: new Date(5_000).toISOString() }, { cidr: "203.0.113.0/24" }],
      10_000,
    );
    assert.deepEqual(kept, [{ cidr: "203.0.113.0/24" }]);
    assert.deepEqual(await loadDenylist(kv.asBinding()), [{ cidr: "203.0.113.0/24" }]);
  });
});

describe("/api/admin/security", () => {
  let kv: FakeKV;
  beforeEach(() => {
    kv = new FakeKV();
    setWorkerEnv({ KV: kv.asBinding(), GATE_MODE: "on" });
    setServerEnv({ GITHUB_CONTENT_TOKEN: TOKEN, GATE_SECRET: "g", TURNSTILE_SECRET: "t" });
  });

  it("shows the list and the configuration — secret names, never values", async () => {
    const body = (await (await call(securityApi.GET, get("/api/admin/security"))).json()) as {
      denylist: unknown[];
      config: { gate: { mode: string; active: boolean }; secrets: Record<string, boolean> };
    };
    assert.deepEqual(body.denylist, []);
    assert.deepEqual(body.config.gate, { mode: "on", active: true });
    assert.equal(body.config.secrets.GITHUB_CONTENT_TOKEN, true);
    assert.equal(body.config.secrets.ADMIN_EMAILS, false);
    assert.doesNotMatch(JSON.stringify(body), /content-token/);
  });

  it("adds, replaces and removes entries, logging each change", async () => {
    const add = (body: unknown) =>
      call(
        securityApi.POST,
        send("POST", "/api/admin/security", body, { "cf-connecting-ip": "192.0.2.1" }),
      );
    const added = await add({ cidr: " 203.0.113.0/24 ", reason: "scraper", hours: 24 });
    assert.equal(added.status, 200);
    const [entry] = ((await added.json()) as { denylist: { cidr: string; until?: string }[] })
      .denylist;
    assert.equal(entry.cidr, "203.0.113.0/24");
    assert.ok(Date.parse(entry.until ?? "") > Date.now());

    // Same range again: replaced (now permanent), not duplicated.
    const replaced = (await (await add({ cidr: "203.0.113.0/24" })).json()) as {
      denylist: { until?: string }[];
    };
    assert.equal(replaced.denylist.length, 1);
    assert.equal(replaced.denylist[0].until, undefined);

    const removed = await call(
      securityApi.DELETE,
      send("DELETE", "/api/admin/security", { cidr: "203.0.113.0/24" }),
    );
    assert.deepEqual(((await removed.json()) as { denylist: unknown[] }).denylist, []);
    assert.deepEqual(
      (await listAudit(kv.asBinding())).map((e) => e.action),
      ["denylist.remove", "denylist.add", "denylist.add"],
    );
  });

  it("refuses bad ranges, odd durations and blocking yourself", async () => {
    const add = (body: unknown) =>
      call(
        securityApi.POST,
        send("POST", "/api/admin/security", body, { "cf-connecting-ip": "192.0.2.1" }),
      );
    assert.equal((await add({ cidr: "999.1.1.1" })).status, 400);
    assert.equal((await add({ cidr: "198.51.100.7", hours: 0 })).status, 400);
    assert.equal((await add({ cidr: "198.51.100.7", hours: 1.5 })).status, 400);
    assert.deepEqual(await (await add({ cidr: "192.0.2.0/24" })).json(), { error: "self_block" });
    assert.equal(
      (await call(securityApi.DELETE, send("DELETE", "/api/admin/security", { cidr: "1.2.3.4" })))
        .status,
      404,
    );
    assert.equal(
      (await call(securityApi.DELETE, send("DELETE", "/api/admin/security", { cidr: 4 }))).status,
      400,
    );
    setWorkerEnv({});
    assert.equal((await add({ cidr: "198.51.100.7" })).status, 503);
    assert.equal(
      (await call(securityApi.DELETE, send("DELETE", "/api/admin/security", { cidr: "x" }))).status,
      503,
    );
    assert.deepEqual(
      (
        (await (await call(securityApi.GET, get("/api/admin/security"))).json()) as {
          denylist: unknown[];
        }
      ).denylist,
      [],
    );
  });
});

describe("/api/admin/overview and /api/admin/activity", () => {
  let kv: FakeKV;
  beforeEach(() => {
    kv = new FakeKV();
    setWorkerEnv({ KV: kv.asBinding(), MEDIA: new FakeR2().asBinding() });
    setServerEnv({ GITHUB_CONTENT_TOKEN: TOKEN });
    github = new FakeGitHub({
      "blog/a.md": "---\ntitle: A\nlang: vi\ndraft: true\n---\n",
      "blog/b.md": "---\ntitle: B\nlang: en\n---\n",
      "now/now.md": "---\ntitle: Now\nlang: vi\n---\n",
      "README.md": "# not content",
    });
  });

  it("counts content per collection, the library and the widgets run", async () => {
    await kv.put(
      "widgets:status",
      JSON.stringify({ yt: "ok", steam: "stale", gh: "ok", lastRun: "t" }),
    );
    const body = (await (await call(overviewApi.GET, get("/api/admin/overview"))).json()) as {
      content: {
        head: string;
        collections: { id: string; total: number; drafts: number; vi: number; en: number }[];
      };
      media: { count: number };
      widgets: { steam: string };
      config: { singleToken: boolean };
    };
    const blog = body.content.collections.find((c) => c.id === "blog");
    assert.deepEqual(blog && [blog.total, blog.drafts, blog.vi, blog.en], [2, 1, 1, 1]);
    assert.equal(body.content.collections.find((c) => c.id === "now")?.total, 1);
    assert.equal(body.media.count, 0);
    assert.equal(body.widgets.steam, "stale");
    assert.equal(body.config.singleToken, true);

    setServerEnv({});
    setWorkerEnv({ MEDIA: new FakeR2().asBinding() });
    const bare = (await (await call(overviewApi.GET, get("/api/admin/overview"))).json()) as {
      content: unknown;
      widgets: unknown;
    };
    assert.equal(bare.content, null);
    assert.equal(bare.widgets, null);
  });

  it("lists the audit log next to the content repo's commits", async () => {
    const save = await call(
      contentApi.PUT,
      send("PUT", "/api/admin/content", {
        path: "blog/b.md",
        sha: github?.sha("blog/b.md"),
        frontmatter: { title: "B2", description: "d", lang: "en", date: "2026-10-24" },
        body: "x",
      }),
    );
    assert.equal(save.status, 200);
    const body = (await (await call(activityApi.GET, get("/api/admin/activity"))).json()) as {
      audit: { action: string; target: string; admin: string }[];
      commits: { message: string }[];
    };
    assert.deepEqual(
      body.audit.map((e) => [e.action, e.target, e.admin]),
      [["content.save", "blog/b.md", OWNER]],
    );
    assert.equal(body.commits[0]?.message, "content(blog): update blog/b.md");

    setServerEnv({});
    setWorkerEnv({});
    assert.deepEqual(await (await call(activityApi.GET, get("/api/admin/activity"))).json(), {
      audit: [],
      commits: [],
    });
  });

  it("logs a publish", async () => {
    await call(
      publishApi.POST,
      new Request("https://admin.poli0981.dev/api/admin/publish", { method: "POST" }),
    );
    assert.deepEqual(
      (await listAudit(kv.asBinding())).map((e) => e.action),
      ["publish"],
    );
  });
});

describe("/api/admin/media?usage", () => {
  it("says which content files use each image", async () => {
    const r2 = new FakeR2();
    await r2.put("private/meta/0123456789abcdef.json", "{}", {
      customMetadata: { w: "8", h: "6", name: "a.png", alt: "", createdAt: "t" },
    });
    await r2.put("private/meta/fedcba9876543210.json", "{}", {
      customMetadata: { w: "8", h: "6", name: "b.png", alt: "", createdAt: "t" },
    });
    setWorkerEnv({ MEDIA: r2.asBinding() });
    setServerEnv({ GITHUB_CONTENT_TOKEN: TOKEN });
    github = new FakeGitHub({ "blog/a.md": "<img src=/media/v1/0123456789abcdef/webp-800>" });
    const body = (await (await call(mediaApi.GET, get("/api/admin/media?usage"))).json()) as {
      items: unknown[];
      usage: Record<string, string[]>;
    };
    assert.equal(body.items.length, 2);
    assert.deepEqual(body.usage, {
      "0123456789abcdef": ["blog/a.md"],
      fedcba9876543210: [],
    });
    const plain = (await (await call(mediaApi.GET, get("/api/admin/media"))).json()) as object;
    assert.equal("usage" in plain, false);
  });
});

describe("/api/admin/gallery covers and deletion", () => {
  const photo = (id: string) => ({ id, w: 800, h: 600, caption: { vi: "Ảnh", en: "Photo" } });
  const photos = [photo("0123456789abcdef"), photo("fedcba9876543210")];
  let kv: FakeKV;

  beforeEach(() => {
    kv = new FakeKV();
    setWorkerEnv({ KV: kv.asBinding() });
    setServerEnv({ GITHUB_CONTENT_TOKEN: TOKEN });
    github = new FakeGitHub({
      "gallery/game.md": "---\ntitle: Game\nlang: vi\nalbum: game\ncoverIndex: 0\n---\n",
      "gallery/game-en.md": "---\ntitle: Games\nlang: en\nalbum: game\n---\n",
      "gallery-photos/game.json": JSON.stringify({ photos }),
      "gallery/other.md": "---\ntitle: Other\nlang: vi\nalbum: other\n---\n",
    });
  });

  const put = (body: unknown) => call(galleryApi.PUT, send("PUT", "/api/admin/gallery", body));

  it("reports where the R2 list starts, and moves the cover in both entries", async () => {
    const { albums } = (await (await call(galleryApi.GET, get("/api/admin/gallery"))).json()) as {
      albums: { album: string; coverIndex: number; local: number }[];
    };
    assert.deepEqual(
      albums.map((a) => [a.album, a.coverIndex, a.local]),
      [
        ["game", 0, 2],
        ["other", 0, 0],
      ],
    );

    const sha = github?.sha("gallery-photos/game.json");
    assert.equal((await put({ album: "game", photos, sha, cover: 1 })).status, 200);
    // Two local photos first, so the second R2 photo is index 3 — in vi and en alike.
    assert.match(github?.files.get("gallery/game.md") ?? "", /coverIndex: 3/);
    assert.match(github?.files.get("gallery/game-en.md") ?? "", /coverIndex: 3/);
    assert.equal(github?.files.get("gallery/other.md")?.includes("coverIndex"), false);
    assert.deepEqual(
      (await listAudit(kv.asBinding())).map((e) => [e.action, e.target]),
      [["gallery.save", "game"]],
    );
  });

  it("refuses a cover outside the photo list and uses it for a new album", async () => {
    const sha = github?.sha("gallery-photos/game.json");
    assert.equal((await put({ album: "game", photos, sha, cover: 2 })).status, 400);
    assert.equal((await put({ album: "game", photos, sha, cover: -1 })).status, 400);
    const created = await put({
      album: "trip",
      photos,
      sha: null,
      cover: 1,
      create: { date: "2026-10-24", vi: { title: "Chuyến đi" }, en: { title: "Trip" } },
    });
    assert.equal(created.status, 200);
    assert.match(github?.files.get("gallery/trip.md") ?? "", /coverIndex: 1/);
  });

  it("deletes an album's list and entries, and nothing else", async () => {
    const del = (body: unknown) =>
      call(galleryApi.DELETE, send("DELETE", "/api/admin/gallery", body));
    const response = await del({ album: "game" });
    assert.equal(response.status, 200);
    assert.deepEqual(((await response.json()) as { deleted: string[] }).deleted.sort(), [
      "gallery-photos/game.json",
      "gallery/game-en.md",
      "gallery/game.md",
    ]);
    assert.equal(github?.files.has("gallery/other.md"), true);
    assert.equal((await del({ album: "game" })).status, 404);
    assert.equal((await del({ album: "Bad Name" })).status, 400);
    assert.deepEqual(
      (await listAudit(kv.asBinding())).map((e) => e.action),
      ["gallery.delete"],
    );
    setServerEnv({});
    assert.equal((await del({ album: "other" })).status, 503);
  });
});
