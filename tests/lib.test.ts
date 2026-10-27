// The small libraries: rate limiting, Turnstile, headers, bodies, logs, version, denylist,
// formatting, links, SEO, RSS, OG, i18n and nav.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, describe, it } from "node:test";
import { setWorkerEnv } from "./support/stubs/cloudflare-workers.ts";
import { captureLogs, FakeKV, FakeRateLimiter, jsonResponse, mockFetch } from "./support/fakes.ts";
import {
  allowRequest,
  apiGroup,
  clientSubject,
  RATE_LIMIT_WINDOW_SECONDS,
  SITE_RATE_LIMIT_SECONDS,
} from "../src/lib/ratelimit.ts";
import { verifyTurnstile } from "../src/lib/turnstile-server.ts";
import { applySecurityHeaders, withSecurityHeaders } from "../src/lib/security-headers.ts";
import {
  assertDeclaredSize,
  BodyTooLargeError,
  isJsonRequest,
  readJsonLimited,
  readTextLimited,
} from "../src/lib/body.ts";
import { log, requestFields } from "../src/lib/log.ts";
import { versionInfo } from "../src/lib/version.ts";
import {
  inRange,
  isValidRange,
  loadDenylist,
  matchEntry,
  parseDenylist,
  resetDenylistMemo,
} from "../src/lib/denylist.ts";
import { formatDate, isoDate, plainText } from "../src/lib/format.ts";
import {
  CONTACT_EMAILS,
  emailForScope,
  sameAsUrls,
  socialsForPersona,
  SOCIAL_LINKS,
} from "../src/lib/links.ts";
import {
  breadcrumbSchema,
  faqPageSchema,
  hreflangPair,
  personSchema,
  publisherRef,
  authorRef,
  resolveSeo,
  SITE,
} from "../src/lib/seo.ts";
import { blogFeedItem, storyFeedItem, RSS_XMLNS } from "../src/lib/rss.ts";
import { DEFAULT_OG, ogKey, ogUrl } from "../src/lib/og.ts";
import {
  alternatePath,
  homePath,
  localeFromPath,
  sectionFallbackPath,
  sectionPath,
} from "../src/i18n/routing.ts";
import { toLocale, useTranslations } from "../src/i18n/index.ts";
import vi from "../src/i18n/vi.ts";
import en from "../src/i18n/en.ts";
import { isActivePath, legalNav, menuNav, primaryNav } from "../src/lib/nav.ts";
import { DURATION, prefersReducedMotion } from "../src/lib/motion.ts";
import { USES, USES_STACK } from "../src/lib/uses.ts";

let fetched: ReturnType<typeof mockFetch> | null = null;
afterEach(() => fetched?.restore());

describe("rate limiting", () => {
  it("groups API paths and collapses IPv6 to its /64", () => {
    assert.equal(apiGroup("/api/report"), "report");
    assert.equal(apiGroup("/api/"), "api");
    assert.equal(clientSubject("203.0.113.9"), "203.0.113.9");
    assert.equal(clientSubject("::ffff:203.0.113.9"), "203.0.113.9");
    assert.equal(clientSubject("2001:db8:0:1:aaaa:bbbb:cccc:dddd"), "2001:db8:0:1::/64");
    assert.equal(clientSubject("2001:db8::1"), "2001:db8:0:0::/64");
    assert.equal(clientSubject("::1"), "0:0:0:0::/64");
  });

  it("uses the group's binding, RL_API otherwise, and allows when unbound", async () => {
    const report = new FakeRateLimiter(1);
    const api = new FakeRateLimiter(1);
    setWorkerEnv({ RL_REPORT: report, RL_API: api });
    assert.equal(await allowRequest("report", "a"), true);
    assert.equal(await allowRequest("report", "a"), false);
    assert.equal(await allowRequest("health", "a"), true);
    assert.deepEqual([...api.counts.keys()], ["health:a"]);
    assert.equal(await allowRequest("widgets", "a"), true);
    setWorkerEnv({});
    assert.equal(await allowRequest("gate", "a"), true);
  });

  it("sends a Retry-After equal to each binding's period in wrangler.jsonc", async () => {
    const config = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
    const period = (name: string) =>
      Number(new RegExp(`"name": "${name}"[^}]*"period": (\\d+)`).exec(config)?.[1]);
    assert.equal(period("RL_SITE"), SITE_RATE_LIMIT_SECONDS);
    for (const name of ["RL_REPORT", "RL_GATE", "RL_ADMIN", "RL_API"]) {
      assert.equal(period(name), RATE_LIMIT_WINDOW_SECONDS, name);
    }
  });
});

describe("Turnstile siteverify", () => {
  const SECRET = "0x4AAAAAAA-real-secret";
  const verify = (token = "tok") =>
    verifyTurnstile({ secret: SECRET, token, action: "report", ip: "198.51.100.1" });

  it("refuses empty and oversized tokens without a network call", async () => {
    fetched = mockFetch(() => {
      throw new Error("must not be called");
    });
    assert.deepEqual(await verify(""), { ok: false, reason: "missing-input-response" });
    assert.deepEqual(await verify("x".repeat(3000)), {
      ok: false,
      reason: "missing-input-response",
    });
  });

  it("accepts only this site's hostname and the right action", async () => {
    let verdict: Record<string, unknown> = {
      success: true,
      action: "report",
      hostname: "poli0981.dev",
    };
    fetched = mockFetch(() => jsonResponse(verdict));
    assert.deepEqual(await verify(), { ok: true });
    verdict = { success: true, action: "report", hostname: "evil.example" };
    assert.deepEqual(await verify(), { ok: false, reason: "hostname-mismatch" });
    verdict = { success: false, "error-codes": [] };
    assert.deepEqual(await verify(), { ok: false, reason: "rejected" });
    assert.match(fetched.calls[0].body, /idempotency_key=/);
  });

  it("retries a network error once with the same idempotency key, then gives up", async () => {
    let attempts = 0;
    fetched = mockFetch(() => {
      attempts += 1;
      if (attempts === 1) throw new Error("reset");
      return jsonResponse({ success: true, action: "report", hostname: "poli0981.dev" });
    });
    assert.deepEqual(await verify(), { ok: true });
    const key = (body: string) => /idempotency_key=([^&]+)/.exec(body)?.[1];
    assert.equal(key(fetched.calls[0].body), key(fetched.calls[1].body));
    fetched.restore();
    fetched = mockFetch(() => {
      throw new Error("down");
    });
    assert.deepEqual(await verify(), { ok: false, reason: "siteverify-unreachable" });
  });

  it("skips hostname/action checks only for Cloudflare's test secrets", async () => {
    fetched = mockFetch(() =>
      jsonResponse({ success: true, action: "test", hostname: "localhost" }),
    );
    const verdict = await verifyTurnstile({
      secret: "1x0000000000000000000000000000000AA",
      token: "t",
      action: "gate",
    });
    assert.deepEqual(verdict, { ok: true });
  });
});

describe("security headers", () => {
  it("sets the hardening headers and adds frame-ancestors without replacing a CSP", () => {
    const headers = new Headers({ "content-security-policy": "default-src 'none'; sandbox" });
    applySecurityHeaders(headers);
    applySecurityHeaders(headers); // idempotent: middleware and worker both run on app routes
    assert.equal(headers.get("x-frame-options"), "DENY");
    assert.equal(
      headers.get("content-security-policy"),
      "default-src 'none'; sandbox, frame-ancestors 'none'",
    );
  });

  it("copies immutable responses", async () => {
    const original = Response.redirect("https://poli0981.dev/", 301);
    const copy = withSecurityHeaders(original);
    assert.equal(copy.status, 301);
    assert.equal(
      copy.headers.get("strict-transport-security"),
      "max-age=31536000; includeSubDomains; preload",
    );
  });
});

describe("bounded request bodies", () => {
  const request = (body: BodyInit | null, headers: Record<string, string> = {}) =>
    // duplex: Node requires it for a streamed body (workerd does not).
    new Request("https://poli0981.dev/x", {
      method: "POST",
      body,
      headers,
      duplex: "half",
    } as RequestInit);

  it("refuses by Content-Length before reading, and by actual size while streaming", async () => {
    assert.throws(
      () => assertDeclaredSize(request("x", { "content-length": "999" }), 10),
      BodyTooLargeError,
    );
    assert.equal(await readTextLimited(request("hello"), 10), "hello");
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("12345"));
        controller.enqueue(new TextEncoder().encode("67890"));
        controller.close();
      },
    });
    await assert.rejects(readTextLimited(request(stream, {}), 8), BodyTooLargeError);
    assert.equal(await readTextLimited(new Request("https://poli0981.dev/x"), 8), "");
  });

  it("parses JSON leniently and recognizes JSON requests", async () => {
    assert.deepEqual(await readJsonLimited(request('{"a":1}'), 100), { a: 1 });
    assert.equal(await readJsonLimited(request("{bad"), 100), null);
    assert.equal(
      isJsonRequest(request("{}", { "content-type": "Application/JSON; charset=utf-8" })),
      true,
    );
    assert.equal(isJsonRequest(request("{}", { "content-type": "text/plain" })), false);
  });
});

describe("structured logs, version", () => {
  it("writes one JSON object per line, serializing errors and dropping undefined", async () => {
    const { logs } = await captureLogs(() => {
      log.info("a.event", { n: 1, skip: undefined });
      log.warn("b.event");
      log.error("c.event", { error: new TypeError("bad") });
    });
    assert.deepEqual(logs[0], { level: "info", event: "a.event", n: 1 });
    assert.equal(logs[1].level, "warn");
    assert.deepEqual((logs[2].error as Record<string, unknown>).name, "TypeError");
    const fields = requestFields(
      new Request("https://poli0981.dev/p?q=secret", { headers: { "cf-ray": "abc" } }),
    );
    assert.deepEqual(fields, { ray: "abc", method: "GET", path: "/p" });
  });

  it("reports the running version and build commit", () => {
    assert.deepEqual(versionInfo(undefined), {
      id: null,
      tag: null,
      timestamp: null,
      commit: null,
    });
    (globalThis as { __BUILD_COMMIT__?: string }).__BUILD_COMMIT__ = "abc1234";
    try {
      assert.equal(versionInfo({ CF_VERSION_METADATA: { id: "v1" } }).commit, "abc1234");
    } finally {
      delete (globalThis as { __BUILD_COMMIT__?: string }).__BUILD_COMMIT__;
    }
  });
});

describe("denylist", () => {
  it("matches IPv4/IPv6 addresses and CIDR ranges", () => {
    assert.equal(inRange("203.0.113.9", "203.0.113.9"), true);
    assert.equal(inRange("203.0.113.9", "203.0.113.0/24"), true);
    assert.equal(inRange("203.0.114.9", "203.0.113.0/24"), false);
    assert.equal(inRange("::ffff:203.0.113.9", "203.0.113.0/24"), true);
    assert.equal(inRange("2001:db8:1:2:3:4:5:6", "2001:db8:1:2::/64"), true);
    assert.equal(inRange("2001:db8:1:3::1", "2001:db8:1:2::/64"), false);
    assert.equal(inRange("::1", "::1"), true);
    assert.equal(inRange("1:2:3:4:5:6:7::", "1:2:3:4:5:6:7:0"), true);
    assert.equal(inRange("203.0.113.9", "2001:db8::/32"), false); // families differ
    assert.equal(inRange("not-an-ip", "203.0.113.0/24"), false);
    assert.equal(inRange("203.0.113.9", "203.0.113.0/33"), false);
  });

  it("validates ranges strictly", () => {
    for (const ok of ["0.0.0.0/0", "10.0.0.0/8", "::/0", "fe80::1"])
      assert.equal(isValidRange(ok), true, ok);
    for (const bad of [
      "300.1.1.1",
      "1.2.3",
      "1.2.3.4/x",
      "1.2.3.4/8/8",
      "1::2::3",
      "1:2:3:4:5:6:7:8:9",
      "fe80::1%eth0",
      "1.2.3.4/040x",
    ]) {
      assert.equal(isValidRange(bad), false, bad);
    }
  });

  it("skips expired entries and tolerates a hand-broken list", () => {
    const entries = [
      { cidr: "203.0.113.9", until: "2000-01-01T00:00:00Z" },
      { cidr: "203.0.113.0/24", reason: "spam" },
    ];
    assert.equal(matchEntry("203.0.113.9", entries)?.reason, "spam");
    assert.equal(matchEntry("198.51.100.1", entries), null);
    assert.deepEqual(parseDenylist("nope"), []);
    assert.deepEqual(parseDenylist([null, { cidr: 5 }, { cidr: "bad" }, { cidr: "10.0.0.0/8" }]), [
      { cidr: "10.0.0.0/8" },
    ]);
  });

  it("reads KV at most once a minute per isolate", async () => {
    resetDenylistMemo();
    const kv = new FakeKV();
    await kv.put("denylist", JSON.stringify([{ cidr: "10.0.0.0/8" }]));
    const now = Date.now();
    assert.equal((await loadDenylist(kv.asBinding(), now)).length, 1);
    await kv.put("denylist", "[]");
    assert.equal((await loadDenylist(kv.asBinding(), now + 30_000)).length, 1);
    assert.equal((await loadDenylist(kv.asBinding(), now + 61_000)).length, 0);
    assert.equal(kv.reads.length, 2);
    resetDenylistMemo();
  });
});

describe("formatting", () => {
  it("formats dates per locale in UTC", () => {
    const date = new Date(Date.UTC(2026, 9, 24, 23, 30));
    assert.equal(formatDate(date, "vi"), "24 thg 10, 2026");
    assert.equal(formatDate(date, "en"), "Oct 24, 2026");
    assert.equal(isoDate(date), "2026-10-24");
  });

  it("flattens the Markdown our FAQ answers use, in linear time", () => {
    const md =
      "# Title\n> quote\n- **bold** [link](https://x.y) ![img](a.png)\n```\ncode\n```\n_em_ `code`";
    assert.equal(plainText(md), "Title quote bold link em code");
    const start = performance.now();
    plainText("[".repeat(50_000) + "x");
    plainText("- ".repeat(50_000));
    assert.ok(performance.now() - start < 1000, "pathological input must stay fast");
  });
});

describe("links", () => {
  it("groups socials, resolves emails and dedupes sameAs URLs", () => {
    assert.ok(socialsForPersona("dev").every((link) => link.persona === "dev"));
    assert.equal(emailForScope("press").address, "press@poli0981.dev");
    assert.equal(emailForScope("unknown" as never).scope, "general");
    const urls = sameAsUrls();
    assert.equal(new Set(urls).size, urls.length);
    assert.ok(urls.every((url) => url.startsWith("http")));
    assert.equal(SOCIAL_LINKS.filter((link) => link.me).length, 1);
    assert.equal(CONTACT_EMAILS[0].scope, "general");
  });
});

describe("SEO, RSS and OG", () => {
  it("resolves page metadata with sensible defaults", () => {
    const home = resolveSeo({}, "/");
    assert.equal(home.title, "Kokone (SkullMute) — dev & storyteller");
    assert.equal(home.canonical, "https://poli0981.dev/");
    assert.equal(home.image, DEFAULT_OG);
    const page = resolveSeo(
      { title: "Blog", locale: "en", type: "article", noindex: true },
      "/en/blog/",
    );
    assert.equal(page.title, "Blog — poli0981.dev");
    assert.equal(page.description, SITE.defaultDescription.en);
    assert.equal(page.noindex, true);
  });

  it("pairs vi/en URLs and builds the JSON-LD blocks", () => {
    assert.deepEqual(hreflangPair("/truyen/a/b/"), { vi: "/truyen/a/b/", en: "/en/stories/a/b/" });
    assert.deepEqual(hreflangPair("/en/stories/"), { vi: "/truyen/", en: "/en/stories/" });
    assert.equal(personSchema()["@type"], "Person");
    assert.equal(authorRef().name, "Kokone");
    assert.equal(publisherRef()["@type"], "Organization");
    const crumbs = breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Blog", path: "/blog/" },
    ]);
    assert.equal((crumbs.itemListElement as { position: number }[])[1].position, 2);
    const faq = faqPageSchema([{ q: "Q?", answer: "A." }]);
    assert.equal((faq.mainEntity as { name: string }[])[0].name, "Q?");
  });

  it("builds feed items (stories never carry their text) and OG URLs", () => {
    const date = new Date("2026-10-01");
    const post = blogFeedItem({
      id: "hello",
      data: { title: "T", lang: "en", date, description: "D", tags: ["a"] },
    } as never);
    assert.equal(post.link, "/en/blog/hello/");
    assert.match(String(post.customData), /en-us/);
    const chapter = storyFeedItem({
      id: "series/ch-1",
      data: { title: "C", lang: "vi", date, description: "D" },
    } as never);
    assert.equal(chapter.link, "/truyen/series/ch-1/");
    assert.equal("content" in chapter, false);
    assert.ok(RSS_XMLNS.dc);
    assert.equal(ogKey("story", "series/ch-1"), "story-series__ch-1");
    assert.equal(ogUrl("blog", "hello"), "/og/blog-hello.png");
  });
});

describe("i18n and nav", () => {
  it("builds localized paths and swaps locales", () => {
    assert.equal(homePath("vi"), "/");
    assert.equal(homePath("en"), "/en/");
    assert.equal(sectionPath("stories", "en", "a", "b"), "/en/stories/a/b/");
    assert.equal(sectionPath("blog", "vi"), "/blog/");
    assert.equal(localeFromPath("/en/blog/"), "en");
    assert.equal(localeFromPath("/blog/"), "vi");
    assert.equal(alternatePath("/", "en"), "/en/");
    assert.equal(alternatePath("/en/", "vi"), "/");
    assert.equal(alternatePath("/truyen/x/", "en"), "/en/stories/x/");
    assert.equal(alternatePath("/unknown/x/", "en"), "/en/unknown/x/");
    assert.equal(alternatePath("/blog/", "vi"), "/blog/");
  });

  it("sends a language switch without a counterpart to the same section", () => {
    assert.equal(sectionFallbackPath("/blog/chi-tieng-viet/", "en"), "/en/blog/");
    assert.equal(sectionFallbackPath("/blog/tag/diary/", "en"), "/en/blog/");
    assert.equal(sectionFallbackPath("/en/stories/series/ch-1/", "vi"), "/truyen/");
    assert.equal(sectionFallbackPath("/unknown/x/", "en"), "/en/");
    assert.equal(sectionFallbackPath("/en/", "vi"), "/");
  });

  it("falls back to Vietnamese and keeps both dictionaries in step", () => {
    assert.equal(toLocale("en"), "en");
    assert.equal(toLocale("ja"), "vi");
    assert.equal(toLocale(undefined), "vi");
    assert.equal(useTranslations("en").nav.blog, "Blog");
    const keys = (value: unknown, prefix = ""): string[] =>
      typeof value === "object" && value !== null
        ? Object.entries(value).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
        : [prefix];
    assert.deepEqual(keys(en).sort(), keys(vi).sort());
  });

  it("lists nav items and matches active sections exactly", () => {
    assert.equal(primaryNav("en")[0].href, "/en/blog/");
    assert.ok(menuNav("vi").some((item) => item.href === "/now/"));
    assert.equal(legalNav("en").length, 6);
    assert.equal(isActivePath("/blog/post/", "/blog/"), true);
    assert.equal(isActivePath("/blogging/", "/blog/"), false);
    assert.equal(isActivePath("/en/blog/", "/en/"), false);
    assert.equal(isActivePath("/en/", "/en/"), true);
    assert.equal(isActivePath("/now", "/now"), true);
  });

  it("exposes motion tokens and the uses tables", () => {
    assert.equal(DURATION.fast, 0.15);
    assert.equal(prefersReducedMotion(), false); // no window in Node
    assert.ok(USES.length > 0 && USES_STACK.includes("TypeScript"));
  });
});
