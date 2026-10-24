// Browser-side modules, run against a minimal fake window/document: the bug-report helpers,
// the client error buffer, motion preferences and the admin's API client.
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { jsonResponse, mockFetch } from "./support/fakes.ts";

type Listener = (event: Event) => void;
const win = new EventTarget() as EventTarget & Record<string, unknown>;
Object.assign(win, {
  innerWidth: 390,
  innerHeight: 844,
  matchMedia: (query: string) => ({ matches: query.includes("reduce") }),
});
const appended: Record<string, unknown>[] = [];
const g = globalThis as unknown as Record<string, unknown>;
g.window = win;
g.location = new URL("https://poli0981.dev/blog/post/?token=secret");
g.document = {
  documentElement: { dataset: { theme: "light" }, lang: "en" },
  createElement: () => ({}),
  head: {
    appendChild(script: Record<string, unknown>) {
      appended.push(script);
      queueMicrotask(() => (script.onerror as Listener | undefined)?.(new Event("error")));
    },
  },
};

const bugbuffer = await import("../src/lib/bugbuffer.ts");
const report = await import("../src/lib/report.ts");
const motion = await import("../src/lib/motion.ts");
const adminApi = await import("../src/components/admin/api.ts");
const adminFormat = await import("../src/components/admin/format.ts");
const adminUi = await import("../src/components/admin/ui.ts");

let fetched: ReturnType<typeof mockFetch> | null = null;
afterEach(() => fetched?.restore());

const dispatch = (type: string, fields: Record<string, unknown>) => {
  const event = Object.assign(new Event(type), fields);
  win.dispatchEvent(event);
};

describe("client error buffer", () => {
  it("scrubs tokens, emails and query strings, and caps the length", () => {
    const scrubbed = bugbuffer.scrub(
      `fetch /api/x?token=abc failed for me@example.com with key ${"k".repeat(30)} ${"x".repeat(600)}`,
    );
    assert.doesNotMatch(scrubbed, /token=abc|me@example\.com|k{30}/);
    assert.match(scrubbed, /\[email\]/);
    assert.match(scrubbed, /\[token\]/);
    assert.equal(scrubbed.length <= 500, true);
    assert.equal(bugbuffer.scrub("a@b"), "a@b"); // no dot after "@": not an email
  });

  it("records window errors, rejections and console.error — at most 20", () => {
    dispatch("error", {
      message: "Boom at https://poli0981.dev/x?y=1",
      filename: "https://poli0981.dev/_astro/a.js?v=2",
      lineno: 3,
      colno: 7,
      error: { stack: "Error: Boom\n at a\n at b\n at c\n at d" },
    });
    dispatch("unhandledrejection", { reason: { message: "nope", stack: "s" } });
    dispatch("unhandledrejection", { reason: "plain string" });
    console.error("logged", { a: 1 });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    console.error(circular);
    const log = report.reportLog();
    assert.equal(log[0].type, "error");
    assert.equal(log[0].message, "Boom at https://poli0981.dev/x");
    assert.equal(log[0].source, "https://poli0981.dev/_astro/a.js");
    assert.equal(log[0].stack?.split("\n").length, 3);
    assert.equal(log[1].message, "nope");
    assert.equal(log[2].message, "plain string");
    assert.equal(log[3].message, 'logged {"a":1}');
    assert.equal(log[4].type, "console");
    for (let i = 0; i < 25; i++) console.error(`flood ${i}`);
    assert.equal(report.reportLog().length, 20);
  });
});

describe("bug-report client", () => {
  it("collects page metadata without the query string", () => {
    assert.deepEqual(report.collectMeta("ref-1"), {
      route: "/blog/post/",
      ua: navigator.userAgent,
      viewport: "390x844",
      theme: "light",
      locale: "en",
      ref: "ref-1",
    });
    assert.equal(report.REPORT_ENABLED, true);
  });

  it("retries the Turnstile script after a failed load, and reuses a loaded one", async () => {
    await assert.rejects(report.loadTurnstile(), /turnstile-load-failed/);
    await assert.rejects(report.loadTurnstile(), /turnstile-load-failed/);
    assert.equal(appended.length, 2); // a second attempt really loaded it again
    const api = { render: () => "id", reset: () => {} };
    win.turnstile = api;
    assert.equal(await report.loadTurnstile(), api);
  });

  it("posts the report and returns only the status", async () => {
    fetched = mockFetch(() => jsonResponse({ ok: true }, 201));
    const result = await report.submitReport({
      description: "something broke",
      meta: report.collectMeta(),
      turnstileToken: "t",
    });
    assert.deepEqual(result, { status: 201 });
    assert.equal(fetched.calls[0].url, "https://poli0981.dev/api/report");
  });
});

describe("motion", () => {
  it("reads the reduced-motion preference", () => {
    assert.equal(motion.prefersReducedMotion(), true);
  });
});

describe("admin display helpers", () => {
  it("says how long ago, in Vietnamese", () => {
    const now = Date.parse("2026-10-24T12:00:00Z");
    assert.equal(adminFormat.ago("2026-10-24T11:59:30Z", now), "30 giây trước");
    assert.equal(adminFormat.ago("2026-10-24T09:00:00Z", now), "3 giờ trước");
    assert.match(adminFormat.ago("2026-10-25T12:00:00Z", now), /^ngày mai$/i);
    assert.equal(adminFormat.ago("2024-10-24T12:00:00Z", now), "2 năm trước");
    assert.equal(adminFormat.ago(null, now), "");
    assert.equal(adminFormat.ago("not a date", now), "");
  });

  it("formats dates and short commit ids", () => {
    assert.match(adminFormat.dateTime("2026-10-24T12:00:00Z"), /\d{2}\/10\/2026/);
    assert.equal(adminFormat.dateTime(undefined), "");
    assert.equal(adminFormat.dateTime("nope"), "");
    assert.equal(adminFormat.shortSha("8a1316280f298a28"), "8a13162");
    assert.equal(adminFormat.shortSha(null), "");
  });
});

describe("admin UI signals", () => {
  it("raises toasts and the session banner as window events", () => {
    const seen: string[] = [];
    win.addEventListener("admin:toast", (event) => {
      const { message, kind } = (event as CustomEvent<{ message: string; kind: string }>).detail;
      seen.push(`${kind}:${message}`);
    });
    win.addEventListener("admin:session-expired", () => seen.push("expired"));
    adminUi.toast("Đã lưu");
    adminUi.toast("Lỗi", "error");
    adminUi.sessionExpired();
    assert.deepEqual(seen, ["ok:Đã lưu", "error:Lỗi", "expired"]);
  });

  it("asks through the dialog when it is there, else window.confirm", async () => {
    const listener = (event: Event) => {
      event.preventDefault();
      (event as CustomEvent<{ resolve: (ok: boolean) => void }>).detail.resolve(true);
    };
    win.addEventListener("admin:confirm", listener);
    assert.equal(await adminUi.confirmAction("Xoá?", { danger: true }), true);
    win.removeEventListener("admin:confirm", listener);
    win.confirm = () => false;
    assert.equal(await adminUi.confirmAction("Xoá?"), false);
  });
});

describe("admin API client", () => {
  it("sends JSON and turns failures into ApiError", async () => {
    fetched = mockFetch((call) =>
      call.method === "GET"
        ? jsonResponse({ items: [] })
        : jsonResponse({ error: "already_exists" }, 409),
    );
    assert.deepEqual(await adminApi.api("/api/admin/media"), { items: [] });
    await assert.rejects(adminApi.api("/api/admin/content", "PUT", { a: 1 }), (error: unknown) => {
      return (
        error instanceof adminApi.ApiError &&
        error.status === 409 &&
        error.data.error === "already_exists"
      );
    });
    assert.equal(fetched.calls[1].headers.get("content-type"), "application/json");
  });

  it("uploads with FormData and survives non-JSON error bodies", async () => {
    fetched = mockFetch(() => new Response("gateway timeout", { status: 504 }));
    await assert.rejects(
      adminApi.uploadImage(new File([new Uint8Array([1])], "a.png"), "alt"),
      (error: unknown) => {
        return error instanceof adminApi.ApiError && error.message === "HTTP 504";
      },
    );
    fetched.restore();
    fetched = mockFetch(() => jsonResponse({ item: { id: "x" }, created: true }, 201));
    assert.deepEqual(await adminApi.uploadImage(new File([new Uint8Array([1])], "a.png")), {
      item: { id: "x" },
      created: true,
    });
  });

  it("reports a lapsed Access session instead of a confusing error", async () => {
    let expired = 0;
    win.addEventListener("admin:session-expired", () => (expired += 1));
    fetched = mockFetch(() => new Response("Forbidden", { status: 403 }));
    await assert.rejects(adminApi.api("/api/admin/content"), (error: unknown) => {
      return error instanceof adminApi.ApiError && error.data.error === "session_expired";
    });
    assert.equal(expired, 1);
    assert.equal(fetched.calls[0].redirect, "manual");
    assert.match(
      adminApi.describeError(new adminApi.ApiError(401, { error: "session_expired" })),
      /đăng nhập lại/,
    );
  });

  it("describes every error the admin API returns", () => {
    const describe = (status: number, data: Record<string, unknown> = {}) =>
      adminApi.describeError(new adminApi.ApiError(status, data));
    assert.match(describe(409, { error: "already_exists" }), /slug/);
    assert.match(
      describe(400, { error: "invalid_fields", fields: [{ field: "lang" }, { field: "date" }] }),
      /lang, date/,
    );
    assert.match(
      describe(502, { error: "github_permission", needs: "contents=write" }),
      /contents=write/,
    );
    assert.match(describe(409), /Xung đột/);
    assert.match(describe(413), /20 MB/);
    assert.match(describe(415), /không được hỗ trợ/);
    assert.match(describe(429), /đợi một phút/);
    assert.match(describe(503), /chưa được cấu hình/);
    assert.match(describe(500, { message: "boom" }), /Lỗi 500: boom/);
    assert.match(describe(400, { error: "not_deletable" }), /không xoá được/);
    assert.equal(adminApi.describeError(new Error("plain")), "plain");
    assert.equal(adminApi.describeError("text"), "text");
  });
});
