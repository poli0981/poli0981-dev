// The widgets cron worker (workers/widgets): sources, picture mirroring, status, alerts.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { captureLogs, FakeKV, jsonResponse, mockFetch, type FetchCall } from "./support/fakes.ts";
import {
  decodeXml,
  fetchGitHub,
  fetchSteam,
  fetchYouTube,
  mirrorImage,
  normalizeGitHub,
  normalizeSteam,
  parseYouTube,
  refresh,
  staleStatus,
  type WidgetsEnv,
} from "../workers/widgets/src/feeds.ts";
import cron from "../workers/widgets/src/index.ts";

const HASH = "0123456789abcdef0123456789abcdef01234567";
const FEED = `<?xml version="1.0"?><feed>
  <entry><yt:videoId>abcdefghijk</yt:videoId><title>Tom &amp; Jerry &lt;3</title><published>2026-10-01T00:00:00Z</published></entry>
  <entry><yt:videoId>broken</yt:videoId><title>no date</title></entry>
  <entry><yt:videoId>bbbbbbbbbbb</yt:videoId><title>Two</title><published>2026-09-01T00:00:00Z</published></entry>
</feed>`;

const image = () =>
  new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });

let fetched: ReturnType<typeof mockFetch> | null = null;
afterEach(() => fetched?.restore());

function upstream(
  overrides: Partial<
    Record<"yt" | "steam" | "gh" | "img" | "discord", (c: FetchCall) => Response>
  > = {},
) {
  fetched = mockFetch((call) => {
    const url = call.url;
    if (url.startsWith("https://www.youtube.com/"))
      return overrides.yt?.(call) ?? new Response(FEED);
    if (url.startsWith("https://api.steampowered.com/"))
      return (
        overrides.steam?.(call) ??
        jsonResponse({
          response: {
            games: [
              { appid: 570, name: "Dota 2", playtime_2weeks: 90, img_icon_url: HASH },
              { appid: 1, playtime_2weeks: undefined, img_icon_url: "not-a-hash" },
            ],
          },
        })
      );
    if (url.startsWith("https://api.github.com/"))
      return (
        overrides.gh?.(call) ??
        jsonResponse([
          {
            type: "PushEvent",
            repo: { name: "poli0981/a" },
            created_at: "t1",
            payload: { commits: [1, 2] },
          },
          { type: "WatchEvent" },
          {
            type: "ReleaseEvent",
            repo: { name: "poli0981/b" },
            created_at: "t2",
            payload: { release: { tag_name: "v1" } },
          },
          { type: "ReleaseEvent", payload: {} },
          { type: "PushEvent" },
        ])
      );
    if (url.startsWith("https://i.ytimg.com/") || url.startsWith("https://media.steampowered.com/"))
      return overrides.img?.(call) ?? image();
    if (url.startsWith("https://discord.example/"))
      return overrides.discord?.(call) ?? new Response(null, { status: 204 });
    throw new Error(`unexpected ${url}`);
  });
  return fetched;
}

const env = (kv: FakeKV) =>
  ({
    KV: kv.asBinding(),
    YT_CHANNEL_ID: "UC123",
    STEAM_API_KEY: "key&x",
    STEAM_ID64: "765",
    DISCORD_WEBHOOK_CI: "https://discord.example/hook",
  }) as unknown as WidgetsEnv;

describe("widget sources", () => {
  it("parses the YouTube feed and decodes entities", () => {
    assert.equal(decodeXml("&lt;b&gt; &quot;q&quot; &#39;a&apos; &amp;amp;"), `<b> "q" 'a' &amp;`);
    assert.deepEqual(
      parseYouTube(FEED).map((v) => [v.id, v.title]),
      [
        ["abcdefghijk", "Tom & Jerry <3"],
        ["bbbbbbbbbbb", "Two"],
      ],
    );
  });

  it("normalizes Steam games and GitHub events", () => {
    const games = normalizeSteam({
      response: { games: [{ appid: 1, img_icon_url: HASH }, { appid: 2 }] },
    });
    assert.deepEqual(
      games.map((g) => [g.name, g.playtime2w, g.iconHash]),
      [
        ["N/A", 0, HASH],
        ["N/A", 0, null],
      ],
    );
    assert.deepEqual(normalizeSteam({}), []);
    const events = normalizeGitHub([
      { type: "PushEvent", repo: { name: "r" }, created_at: "t", payload: { commits: [1] } },
      { type: "IssuesEvent" },
      { type: "ReleaseEvent", payload: {} },
      { type: "PushEvent" },
      { type: "PushEvent" },
    ]);
    assert.deepEqual(
      events.map((e) => e.detail),
      ["1 commits", "release", "0 commits"],
    );
    assert.equal(events[1].repo, "N/A");
  });

  it("mirrors pictures into KV under the /ext-img keys, refusing junk", async () => {
    const kv = new FakeKV();
    upstream({
      img: (call) =>
        call.url.endsWith("big.jpg")
          ? new Response(new Uint8Array(3 * 1024 * 1024), {
              headers: { "content-type": "image/jpeg" },
            })
          : call.url.endsWith("html.jpg")
            ? new Response("<html>", { headers: { "content-type": "text/html" } })
            : call.url.endsWith("throw.jpg")
              ? (() => {
                  throw new Error("down");
                })()
              : image(),
    });
    assert.equal(await mirrorImage(kv.asBinding(), "yt:ok", "https://i.ytimg.com/ok.jpg"), true);
    assert.deepEqual(kv.store.get("widgets:img:yt:ok")?.metadata, { type: "image/jpeg" });
    assert.equal(kv.store.get("widgets:img:yt:ok")?.ttl, 14 * 24 * 60 * 60);
    for (const name of ["big", "html", "throw"]) {
      assert.equal(
        await mirrorImage(kv.asBinding(), `yt:${name}`, `https://i.ytimg.com/${name}.jpg`),
        false,
        name,
      );
    }
  });

  it("fetches each source with the pictures pointing at /ext-img", async () => {
    const kv = new FakeKV();
    const { calls } = upstream();
    const videos = await fetchYouTube(env(kv));
    assert.deepEqual(
      videos.map((v) => v.thumb),
      ["/ext-img/yt/abcdefghijk", "/ext-img/yt/bbbbbbbbbbb"],
    );
    const games = await fetchSteam(env(kv));
    assert.deepEqual(
      games.map((g) => g.icon),
      [`/ext-img/steam/570/${HASH}`, ""],
    );
    assert.ok(calls.some((c) => c.url.includes("key=key%26x")));
    // Push, release, release-without-a-tag — WatchEvent skipped, capped at three.
    assert.deepEqual(
      (await fetchGitHub()).map((e) => e.detail),
      ["2 commits", "v1", "release"],
    );
    assert.ok(kv.store.has(`widgets:img:steam:570:${HASH}`));
  });

  it("leaves the picture empty when mirroring fails, and throws on upstream errors", async () => {
    const kv = new FakeKV();
    upstream({ img: () => new Response("x", { status: 404 }) });
    assert.deepEqual(
      (await fetchYouTube(env(kv))).map((v) => v.thumb),
      ["", ""],
    );
    assert.deepEqual(
      (await fetchSteam(env(kv))).map((g) => g.icon),
      ["", ""],
    );
    fetched?.restore();
    upstream({
      yt: () => new Response("", { status: 500 }),
      steam: () => new Response("", { status: 403 }),
      gh: () => new Response("", { status: 503 }),
    });
    await assert.rejects(fetchYouTube(env(kv)), /youtube 500/);
    await assert.rejects(fetchSteam(env(kv)), /steam 403/);
    await assert.rejects(fetchGitHub(), /github 503/);
  });
});

describe("refresh and status", () => {
  it("keeps the previous feed on failure and grades how stale it is", async () => {
    const now = Date.parse("2026-10-24T12:00:00Z");
    assert.equal(staleStatus(null, now), "na");
    assert.equal(staleStatus({ updated: "2026-10-24T00:00:00Z", items: [] }, now), "stale");
    assert.equal(staleStatus({ updated: "2026-10-20T00:00:00Z", items: [] }, now), "na");

    const kv = new FakeKV();
    const status = { yt: "na", steam: "na", gh: "na", lastRun: "" } as const;
    const mutable = { ...status };
    assert.deepEqual(
      await refresh(
        kv.asBinding(),
        "widgets:yt",
        "yt",
        mutable,
        "2026-10-24T12:00:00Z",
        async () => [1],
      ),
      { ok: true },
    );
    assert.equal(mutable.yt, "ok");
    const failed = await refresh(
      kv.asBinding(),
      "widgets:yt",
      "yt",
      mutable,
      "2026-10-24T12:30:00Z",
      async () => {
        throw new Error("down");
      },
    );
    assert.equal(failed.ok, false);
    assert.equal(mutable.yt, "stale");
    assert.equal(JSON.parse(kv.text("widgets:yt") ?? "{}").updated, "2026-10-24T12:00:00Z");
  });
});

describe("scheduled()", () => {
  let kv: FakeKV;
  beforeEach(() => {
    kv = new FakeKV();
  });

  const tick = () => captureLogs(() => cron.scheduled({} as ScheduledController, env(kv)));

  it("writes every feed and the status, and resets the failure counter", async () => {
    upstream();
    await kv.put("widgets:fails", "2");
    const { logs } = await tick();
    assert.deepEqual(JSON.parse(kv.text("widgets:status") ?? "{}"), {
      yt: "ok",
      steam: "ok",
      gh: "ok",
      lastRun: JSON.parse(kv.text("widgets:status") ?? "{}").lastRun,
    });
    assert.equal(kv.text("widgets:fails"), "0");
    assert.equal(logs.at(-1)?.event, "widgets.run");
  });

  it("alerts Discord exactly on the third fully-failed run in a row", async () => {
    const down = () => new Response("", { status: 500 });
    const { calls } = upstream({ yt: down, steam: down, gh: down });
    for (let run = 1; run <= 4; run++) {
      const { logs } = await tick();
      assert.equal(logs.filter((line) => line.event === "widgets.source_failed").length, 3);
      assert.equal(kv.text("widgets:fails"), String(run));
    }
    const alerts = calls.filter((c) => c.url.startsWith("https://discord.example/"));
    assert.equal(alerts.length, 1);
    assert.deepEqual(JSON.parse(alerts[0].body).allowed_mentions, { parse: [] });
  });

  it("skips the alert without a webhook and survives Discord failing", async () => {
    const down = () => new Response("", { status: 500 });
    upstream({
      yt: down,
      steam: down,
      gh: down,
      discord: () => {
        throw new Error("discord down");
      },
    });
    await kv.put("widgets:fails", "2");
    await tick(); // third failure: the alert throws, the run must not
    assert.equal(kv.text("widgets:fails"), "3");
    const noHook = { ...env(kv), DISCORD_WEBHOOK_CI: "" } as unknown as WidgetsEnv;
    await kv.put("widgets:fails", "2");
    await captureLogs(() => cron.scheduled({} as ScheduledController, noHook));
    assert.equal(kv.text("widgets:fails"), "3");
  });
});
