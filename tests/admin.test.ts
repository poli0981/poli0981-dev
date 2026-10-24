// The admin: GitHub access (lib/admin/github), HTTP helpers, Access JWT verification and the
// /api/admin/* routes, against an in-memory content repo.
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import type { APIContext } from "astro";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { setServerEnv } from "./support/stubs/astro-env-server.ts";
import { setWorkerEnv } from "./support/stubs/cloudflare-workers.ts";
import { FakeGitHub } from "./support/github.ts";
import {
  captureLogs,
  FakeCache,
  FakeImages,
  FakeR2,
  installCaches,
  mockFetch,
} from "./support/fakes.ts";
import { verifyAccess } from "../src/lib/admin/access.ts";
import {
  commitContent,
  ConflictError,
  dispatchPublish,
  GitHubError,
  listContentFiles,
  publishStatus,
  readContentFile,
} from "../src/lib/admin/github.ts";
import { errorResponse, isPlainObject, json, readJson } from "../src/lib/admin/http.ts";
import { BodyTooLargeError } from "../src/lib/body.ts";
import * as contentApi from "../src/pages/api/admin/content.ts";
import * as galleryApi from "../src/pages/api/admin/gallery.ts";
import * as mediaApi from "../src/pages/api/admin/media.ts";
import * as publishApi from "../src/pages/api/admin/publish.ts";

const TOKEN = "content-token";
const POST_MD = `---\ntitle: "Đêm đầu"\ndescription: Mô tả\nlang: vi\ndate: 2026-10-01\ntags: [dev, diary]\n---\n\nThân bài.\n`;

let github: FakeGitHub;
afterEach(() => github?.restore());

const admin = { admin: { email: "owner@example.com" } };
const ctx = (request: Request) =>
  ({ request, url: new URL(request.url), locals: admin }) as unknown as APIContext;
const jsonRequest = (method: string, body: unknown, path = "/api/admin/content") =>
  new Request(`https://admin.poli0981.dev${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const call = async (handler: unknown, request: Request) =>
  (await (handler as (c: APIContext) => Promise<Response>)(ctx(request))) as Response;

describe("lib/admin/github", () => {
  beforeEach(() => {
    github = new FakeGitHub({
      "blog/dem-dau.md": POST_MD,
      "stories/series/c1.md": "---\ntitle: C1\n---\n",
    });
  });

  it("lists every text file of the content repo in one GraphQL call", async () => {
    const { head, files } = await listContentFiles(TOKEN);
    assert.equal(head, "commit-0");
    assert.deepEqual(files.map((f) => f.path).sort(), ["blog/dem-dau.md", "stories/series/c1.md"]);
    assert.equal(github.calls.length, 1);
    assert.equal(github.calls[0].headers.get("authorization"), `Bearer ${TOKEN}`);
  });

  it("reads one file (UTF-8) or null when it is missing", async () => {
    const file = await readContentFile(TOKEN, "blog/dem-dau.md");
    assert.equal(file?.text, POST_MD);
    assert.equal(file?.sha, github.sha("blog/dem-dau.md"));
    assert.equal(await readContentFile(TOKEN, "blog/none.md"), null);
  });

  it("commits atomically, refuses stale edits and retries one race", async () => {
    const sha = github.sha("blog/dem-dau.md");
    github.raceRefUpdates = 1;
    const commit = await commitContent(TOKEN, "msg", [
      { path: "blog/dem-dau.md", text: "new", expectSha: sha },
    ]);
    assert.equal(commit, "commit-1");
    assert.equal(github.files.get("blog/dem-dau.md"), "new");

    await assert.rejects(
      commitContent(TOKEN, "msg", [{ path: "blog/dem-dau.md", text: "x", expectSha: sha }]),
      ConflictError,
    );
    await commitContent(TOKEN, "delete", [
      { path: "blog/dem-dau.md", text: null, expectSha: github.sha("blog/dem-dau.md") },
    ]);
    assert.equal(github.files.has("blog/dem-dau.md"), false);
  });

  it("gives up after a second race and reports GitHub's needed permission", async () => {
    github.raceRefUpdates = 2;
    await assert.rejects(
      commitContent(TOKEN, "msg", [{ path: "blog/x.md", text: "x", expectSha: null }]),
      (error: unknown) => error instanceof GitHubError && error.status === 422,
    );
    github.failAll = { status: 403, needs: "contents=write" };
    await assert.rejects(listContentFiles(TOKEN), (error: unknown) => {
      return (
        error instanceof GitHubError && error.status === 403 && error.needs === "contents=write"
      );
    });
  });

  it("maps publish state: open PR, build check and the last workflow run", async () => {
    github.files.set("blog/new.md", "x"); // content main moved on
    github.head = "commit-9";
    github.openPr = { number: 120, headSha: "abc", autoMerge: true };
    github.buildCheck = { status: "completed", conclusion: "success" };
    github.lastRun = { status: "completed", conclusion: "success" };
    const status = await publishStatus(TOKEN);
    assert.equal(status.contentHead, "commit-9");
    assert.equal(status.published, "commit-0");
    assert.deepEqual(status.pr, {
      number: 120,
      url: "https://github.com/poli0981/poli0981-dev/pull/120",
      autoMerge: true,
      checks: "success",
    });
    assert.equal(status.run?.url, "https://github.com/run/1");

    github.buildCheck = { status: "in_progress", conclusion: null };
    assert.equal((await publishStatus(TOKEN)).pr?.checks, "pending");
    github.buildCheck = { status: "completed", conclusion: "failure" };
    assert.equal((await publishStatus(TOKEN)).pr?.checks, "failure");
    github.buildCheck = null;
    github.openPr = { number: 121, headSha: "def", autoMerge: false };
    assert.equal((await publishStatus(TOKEN)).pr?.checks, null);
    github.openPr = null;
    github.lastRun = null;
    const idle = await publishStatus(TOKEN);
    assert.equal(idle.pr, null);
    assert.equal(idle.run, null);
  });

  it("dispatches the publish workflow on main", async () => {
    await dispatchPublish("publish-token");
    assert.deepEqual(github.dispatched, ["main"]);
  });
});

describe("lib/admin/http", () => {
  it("maps known errors to responses", async () => {
    const statusOf = (error: unknown) => errorResponse(error).status;
    const { result, logs } = await captureLogs(() => [
      statusOf(new BodyTooLargeError()),
      statusOf(new ConflictError("changed")),
      statusOf(new GitHubError("no", 403, "contents=write")),
      statusOf(new GitHubError("down", 500)),
      statusOf(new Error("boom")),
    ]);
    assert.deepEqual(result, [413, 409, 502, 502, 500]);
    assert.deepEqual(
      logs.map((line) => line.event),
      ["admin.github_failed", "admin.github_failed", "admin.failed"],
    );
    const permission = (await errorResponse(
      new GitHubError("no", 401, "actions=write"),
    ).json()) as Record<string, unknown>;
    assert.equal(permission.error, "github_permission");
    assert.equal(permission.needs, "actions=write");
  });

  it("reads JSON only from JSON requests, within the size limit", async () => {
    assert.deepEqual(await readJson(jsonRequest("PUT", { a: 1 })), { a: 1 });
    assert.equal(await readJson(jsonRequest("PUT", "{nope")), null);
    const form = new Request("https://admin.poli0981.dev/x", {
      method: "POST",
      body: "a=1",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    assert.equal(await readJson(form), null);
    await assert.rejects(readJson(jsonRequest("PUT", "x".repeat(600 * 1024))), BodyTooLargeError);
    assert.equal(json({ ok: 1 }).headers.get("cache-control"), "no-store");
    assert.equal(isPlainObject([]), false);
    assert.equal(isPlainObject({}), true);
  });
});

describe("lib/admin/access", () => {
  let keys: Awaited<ReturnType<typeof generateKeyPair>>;
  let fetched: ReturnType<typeof mockFetch>;
  const team = "https://access-team.cloudflareaccess.com";

  // One key pair for the suite: verifyAccess caches each team's key set for the isolate's
  // lifetime, so a new pair per test would be checked against the first test's keys.
  before(async () => {
    keys = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(keys.publicKey)), kid: "k1", alg: "RS256" };
    fetched = mockFetch(() => new Response(JSON.stringify({ keys: [jwk] })));
  });
  after(() => fetched.restore());

  const token = (claims: Record<string, unknown>, audience = "aud-1", issuer = team) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(keys.privateKey);

  const verify = async (jwt: string | null, env: Record<string, string> = {}) =>
    verifyAccess(
      new Request(
        "https://admin.poli0981.dev/",
        jwt ? { headers: { "cf-access-jwt-assertion": jwt } } : {},
      ),
      {
        ACCESS_TEAM_DOMAIN: `${team}//`,
        ACCESS_AUD: "aud-1",
        ADMIN_EMAILS: "owner@example.com, second@example.com",
        ...env,
      },
    );

  it("accepts a token for this app and normalizes the email", async () => {
    assert.deepEqual(await verify(await token({ email: "Owner@Example.com" })), {
      email: "owner@example.com",
    });
  });

  it("refuses missing config, other apps, service tokens and non-allowlisted emails", async () => {
    assert.equal(await verify(null), null);
    assert.equal(await verify(await token({ email: "a@b.c" }), { ACCESS_AUD: "" }), null);
    assert.equal(await verify(await token({ email: "a@b.c" }, "other-app")), null);
    assert.equal(
      await verify(await token({ email: "a@b.c" }, "aud-1", "https://evil.example")),
      null,
    );
    assert.equal(await verify(await token({ common_name: "service" })), null);
    assert.equal(await verify(await token({ email: "intruder@example.com" })), null);
    assert.deepEqual(await verify(await token({ email: "second@example.com" })), {
      email: "second@example.com",
    });
    assert.equal(await verify("not.a.jwt"), null);
  });

  it("fails closed without an allowlist and refuses tokens older than a day", async () => {
    const owner = await token({ email: "owner@example.com" });
    assert.equal(await verify(owner, { ADMIN_EMAILS: "" }), null);
    assert.equal(await verify(owner, { ADMIN_EMAILS: " , " }), null);
    // Still unexpired, but issued 25 hours ago: past the 24-hour cap.
    const stale = Math.floor(Date.now() / 1000) - 25 * 3600;
    const old = await new SignJWT({ email: "owner@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(team)
      .setAudience("aud-1")
      .setIssuedAt(stale)
      .setExpirationTime(stale + 48 * 3600)
      .sign(keys.privateKey);
    assert.equal(await verify(old), null);
  });
});

describe("/api/admin/content", () => {
  beforeEach(() => {
    setServerEnv({ GITHUB_CONTENT_TOKEN: TOKEN });
    github = new FakeGitHub({
      "blog/dem-dau.md": POST_MD,
      "legal/terms.md": "---\ntitle: Terms\n---\n",
      "README.md": "# not content",
    });
  });

  it("answers 503 without a token", async () => {
    setServerEnv({});
    assert.equal(
      (await call(contentApi.GET, new Request("https://admin.poli0981.dev/api/admin/content")))
        .status,
      503,
    );
    assert.equal((await call(contentApi.PUT, jsonRequest("PUT", {}))).status, 503);
    assert.equal((await call(contentApi.DELETE, jsonRequest("DELETE", {}))).status, 503);
  });

  it("lists editable entries with their titles", async () => {
    const response = await call(
      contentApi.GET,
      new Request("https://admin.poli0981.dev/api/admin/content"),
    );
    const { entries } = (await response.json()) as {
      entries: { path: string; title: string; lang: string | null; date: string | null }[];
    };
    assert.deepEqual(
      entries.map((e) => [e.path, e.title, e.lang, e.date]),
      [
        ["blog/dem-dau.md", "Đêm đầu", "vi", "2026-10-01"],
        ["legal/terms.md", "Terms", null, null],
      ],
    );
  });

  it("opens one entry, refusing paths the admin may not touch", async () => {
    const open = (path: string) =>
      call(
        contentApi.GET,
        new Request(
          `https://admin.poli0981.dev/api/admin/content?path=${encodeURIComponent(path)}`,
        ),
      );
    const entry = (await (await open("blog/dem-dau.md")).json()) as {
      frontmatter: Record<string, unknown>;
      body: string;
    };
    assert.equal(entry.frontmatter.title, "Đêm đầu");
    assert.equal(entry.body, "Thân bài.\n");
    assert.equal((await open("README.md")).status, 400);
    assert.equal((await open("blog/missing.md")).status, 404);
  });

  const valid = { title: "Mới", description: "Mô tả", lang: "vi", date: "2026-10-24" };

  it("creates a Markdown entry, then edits it keeping untouched formatting", async () => {
    const created = await call(
      contentApi.PUT,
      jsonRequest("PUT", { path: "blog/moi.md", sha: null, frontmatter: valid, body: "Hello" }),
    );
    assert.equal(created.status, 200);
    const { sha } = (await created.json()) as { sha: string };
    assert.equal(sha, github.sha("blog/moi.md"));
    assert.match(github.files.get("blog/moi.md") ?? "", /^---\ntitle: Mới\n/);

    const original = github.sha("blog/dem-dau.md");
    const edited = await call(
      contentApi.PUT,
      jsonRequest("PUT", {
        path: "blog/dem-dau.md",
        sha: original,
        frontmatter: {
          ...valid,
          title: "Đêm đầu",
          date: "2026-10-01",
          tags: ["dev", "diary"],
          description: "Mô tả mới",
        },
        body: "Thân bài.",
      }),
    );
    assert.equal(edited.status, 200);
    assert.match(github.files.get("blog/dem-dau.md") ?? "", /tags: \[dev, diary\]/);
    assert.match(github.files.get("blog/dem-dau.md") ?? "", /description: Mô tả mới/);
  });

  it("validates before writing anything", async () => {
    const put = (body: unknown) => call(contentApi.PUT, jsonRequest("PUT", body));
    assert.equal((await put({ path: 1 })).status, 400);
    assert.equal(
      (await put({ path: "blog/x.md", sha: null, frontmatter: [], body: "" })).status,
      400,
    );
    assert.equal(
      (await put({ path: "README.md", sha: null, frontmatter: valid, body: "" })).status,
      400,
    );
    assert.deepEqual(
      await (await put({ path: "blog/x.mdx", sha: null, frontmatter: valid, body: "" })).json(),
      { error: "md_only" },
    );
    assert.deepEqual(
      await (
        await put({ path: "legal/new.md", sha: null, frontmatter: { title: "x" }, body: "" })
      ).json(),
      { error: "not_creatable" },
    );
    const invalid = await put({
      path: "blog/x.md",
      sha: null,
      frontmatter: { ...valid, lang: "fr", date: "soon" },
      body: "",
    });
    assert.deepEqual(await invalid.json(), {
      error: "invalid_fields",
      fields: [
        { field: "lang", code: "option" },
        { field: "date", code: "format" },
      ],
    });
    assert.equal(github.commits, 0);
  });

  it("refuses to create over an existing slug, oversized files and stale edits", async () => {
    const put = (body: unknown) => call(contentApi.PUT, jsonRequest("PUT", body));
    assert.deepEqual(
      await (
        await put({ path: "blog/dem-dau.md", sha: null, frontmatter: valid, body: "" })
      ).json(),
      { error: "already_exists" },
    );
    assert.equal(
      (await put({ path: "blog/big.md", sha: null, frontmatter: valid, body: "x".repeat(210_000) }))
        .status,
      413,
    );
    assert.equal(
      (await put({ path: "blog/dem-dau.md", sha: "stale", frontmatter: valid, body: "" })).status,
      409,
    );
  });

  it("deletes creatable entries only", async () => {
    const del = (body: unknown) => call(contentApi.DELETE, jsonRequest("DELETE", body));
    assert.deepEqual(
      await (await del({ path: "legal/terms.md", sha: github.sha("legal/terms.md") })).json(),
      { error: "not_deletable" },
    );
    assert.equal((await del({ path: "README.md", sha: "x" })).status, 400);
    assert.equal((await del({ path: 3 })).status, 400);
    const ok = await del({ path: "blog/dem-dau.md", sha: github.sha("blog/dem-dau.md") });
    assert.equal(ok.status, 200);
    assert.equal(github.files.has("blog/dem-dau.md"), false);
  });

  it("turns GitHub failures into 502s", async () => {
    github.failAll = { status: 403, needs: "contents=write" };
    const { result } = await captureLogs(() =>
      call(contentApi.GET, new Request("https://admin.poli0981.dev/api/admin/content")),
    );
    assert.equal(result.status, 502);
  });
});

describe("/api/admin/gallery", () => {
  const photos = [{ id: "0123456789abcdef", w: 800, h: 600, caption: { vi: "Ảnh", en: "Photo" } }];

  beforeEach(() => {
    setServerEnv({ GITHUB_CONTENT_TOKEN: TOKEN });
    github = new FakeGitHub({
      "gallery/game.md": "---\ntitle: Game\nlang: vi\nalbum: game\n---\n",
      "gallery/game-en.md": "---\ntitle: Games\nlang: en\nalbum: game\n---\n",
      "gallery-photos/game.json": JSON.stringify({ photos }),
      "gallery-photos/broken.json": "{not json",
    });
  });

  it("lists albums with titles per language and their R2 photos", async () => {
    const response = await call(
      galleryApi.GET,
      new Request("https://admin.poli0981.dev/api/admin/gallery"),
    );
    const { albums } = (await response.json()) as {
      albums: { album: string; titles: Record<string, string>; photos: unknown[] }[];
    };
    assert.deepEqual(
      albums.map((a) => a.album),
      ["broken", "game"],
    );
    assert.deepEqual(albums[1].titles, { vi: "Game", en: "Games" });
    assert.equal(albums[1].photos.length, 1);
    assert.deepEqual(albums[0].photos, []);
  });

  it("saves a photo list and creates a new album's two entries", async () => {
    const put = (body: unknown) =>
      call(galleryApi.PUT, jsonRequest("PUT", body, "/api/admin/gallery"));
    assert.equal(
      (await put({ album: "game", photos, sha: github.sha("gallery-photos/game.json") })).status,
      200,
    );

    const created = await put({
      album: "trip",
      photos,
      sha: null,
      create: {
        date: "2026-10-24",
        vi: { title: "Chuyến đi" },
        en: { title: "Trip", description: "Hello" },
      },
    });
    assert.equal(created.status, 200);
    assert.match(github.files.get("gallery/trip-en.md") ?? "", /description: Hello/);
    assert.equal(JSON.parse(github.files.get("gallery-photos/trip.json") ?? "{}").photos.length, 1);
  });

  it("refuses bad input and existing albums", async () => {
    const put = (body: unknown) =>
      call(galleryApi.PUT, jsonRequest("PUT", body, "/api/admin/gallery"));
    assert.equal((await put({ album: "Bad Name", photos, sha: null })).status, 400);
    assert.equal((await put({ album: "game", photos: [{ id: "nope" }], sha: null })).status, 400);
    assert.equal(
      (
        await put({
          album: "new",
          photos,
          sha: null,
          create: { date: "x", vi: { title: "a" }, en: { title: "b" } },
        })
      ).status,
      400,
    );
    const exists = await put({
      album: "game",
      photos,
      sha: null,
      create: { date: "2026-10-24", vi: { title: "a" }, en: { title: "b" } },
    });
    assert.equal(exists.status, 409);
    setServerEnv({});
    assert.equal((await put({})).status, 503);
    assert.equal(
      (await call(galleryApi.GET, new Request("https://admin.poli0981.dev/api/admin/gallery")))
        .status,
      503,
    );
  });
});

describe("/api/admin/media", () => {
  let r2: FakeR2;
  let cache: FakeCache;
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  beforeEach(() => {
    r2 = new FakeR2();
    cache = installCaches();
    setWorkerEnv({ MEDIA: r2.asBinding(), IMAGES: new FakeImages().asBinding() });
    setServerEnv({ GITHUB_CONTENT_TOKEN: TOKEN });
    github = new FakeGitHub({ "blog/a.md": "uses 0123456789abcdef" });
  });

  const upload = (bytes: Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}) => {
    const form = new FormData();
    form.append("file", new File([bytes], "photo.png", { type: "image/png" }));
    form.append("alt", "A photo");
    return call(
      mediaApi.POST,
      new Request("https://admin.poli0981.dev/api/admin/media", {
        method: "POST",
        body: form,
        headers,
      }),
    );
  };

  it("uploads once, then answers the same file from the library", async () => {
    const first = await upload(PNG);
    assert.equal(first.status, 201);
    const { item } = (await first.json()) as { item: { id: string; alt: string } };
    assert.equal(item.alt, "A photo");
    assert.equal((await upload(PNG)).status, 200);

    const listed = (await (
      await call(mediaApi.GET, new Request("https://admin.poli0981.dev/api/admin/media"))
    ).json()) as { items: { id: string }[] };
    assert.deepEqual(
      listed.items.map((i) => i.id),
      [item.id],
    );
  });

  it("refuses non-images, missing files and oversized uploads", async () => {
    assert.equal(
      (await upload(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).status,
      415,
    );
    const empty = new FormData();
    assert.equal(
      (
        await call(
          mediaApi.POST,
          new Request("https://admin.poli0981.dev/api/admin/media", {
            method: "POST",
            body: empty,
          }),
        )
      ).status,
      400,
    );
    assert.equal((await upload(PNG, { "content-length": String(30 * 1024 * 1024) })).status, 413);
    assert.equal(
      (
        await call(
          mediaApi.POST,
          new Request("https://admin.poli0981.dev/api/admin/media", { method: "POST", body: "x" }),
        )
      ).status,
      400,
    );
  });

  it("edits alt text and deletes unused images everywhere", async () => {
    const { item } = (await (await upload(PNG)).json()) as { item: { id: string } };
    const patch = (body: unknown) =>
      call(mediaApi.PATCH, jsonRequest("PATCH", body, "/api/admin/media"));
    assert.equal((await patch({ id: item.id, alt: "  Renamed  " })).status, 200);
    assert.equal((await patch({ id: "0000000000000000", alt: "x" })).status, 404);
    assert.equal((await patch({ id: "bad", alt: "x" })).status, 400);

    const del = (body: unknown) =>
      call(mediaApi.DELETE, jsonRequest("DELETE", body, "/api/admin/media"));
    assert.equal((await del({ id: "bad" })).status, 400);
    const deleted = await del({ id: item.id });
    assert.equal(deleted.status, 200);
    assert.equal(r2.store.size, 0);
    assert.ok(cache.deleted.length > 0);
  });

  it("refuses to delete an image content still uses", async () => {
    await r2.put(
      "private/meta/0123456789abcdef.json",
      JSON.stringify({ id: "0123456789abcdef", variants: [] }),
    );
    const response = await call(
      mediaApi.DELETE,
      jsonRequest("DELETE", { id: "0123456789abcdef" }, "/api/admin/media"),
    );
    assert.equal(response.status, 409);
    assert.deepEqual(((await response.json()) as { usedIn: string[] }).usedIn, ["blog/a.md"]);
  });
});

describe("/api/admin/publish", () => {
  beforeEach(() => {
    github = new FakeGitHub({});
  });

  it("reports status (flagging single-token mode) and dispatches", async () => {
    setServerEnv({ GITHUB_CONTENT_TOKEN: TOKEN });
    const status = (await (
      await call(publishApi.GET, new Request("https://admin.poli0981.dev/api/admin/publish"))
    ).json()) as { singleToken: boolean };
    assert.equal(status.singleToken, true);
    setServerEnv({ GITHUB_CONTENT_TOKEN: TOKEN, GITHUB_PUBLISH_TOKEN: "publish-token" });
    const dispatched = await call(
      publishApi.POST,
      new Request("https://admin.poli0981.dev/api/admin/publish", { method: "POST" }),
    );
    assert.equal(dispatched.status, 202);
    assert.equal(github.calls.at(-1)?.headers.get("authorization"), "Bearer publish-token");
  });

  it("is unavailable without tokens and maps GitHub errors", async () => {
    setServerEnv({});
    assert.equal(
      (await call(publishApi.GET, new Request("https://admin.poli0981.dev/api/admin/publish")))
        .status,
      503,
    );
    assert.equal(
      (
        await call(
          publishApi.POST,
          new Request("https://admin.poli0981.dev/api/admin/publish", { method: "POST" }),
        )
      ).status,
      503,
    );
    setServerEnv({ GITHUB_CONTENT_TOKEN: TOKEN });
    github.failAll = { status: 403 };
    const { result } = await captureLogs(() =>
      call(
        publishApi.POST,
        new Request("https://admin.poli0981.dev/api/admin/publish", { method: "POST" }),
      ),
    );
    assert.equal(result.status, 502);
    const { result: statusResult } = await captureLogs(() =>
      call(publishApi.GET, new Request("https://admin.poli0981.dev/api/admin/publish")),
    );
    assert.equal(statusResult.status, 502);
  });
});
