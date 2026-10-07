// Unit tests for the Turnstile gate's pure parts. Node runs TypeScript directly (type
// stripping), so: `npm test` → node --test tests/
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PASS_COOKIE,
  PASS_TTL_SECONDS,
  issuePass,
  passCookieHeader,
  readPassCookie,
  verifyPass,
} from "../src/lib/gate/cookie.ts";
import { gateDecision, gateSettings } from "../src/lib/gate/policy.ts";

const SECRET = "test-secret-not-for-production";
const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);

describe("gate pass cookie", () => {
  it("accepts a fresh pass and rejects it after 48 hours", async () => {
    const pass = await issuePass(SECRET, NOW);
    assert.equal(await verifyPass(pass, SECRET, NOW), true);
    assert.equal(await verifyPass(pass, SECRET, NOW + (PASS_TTL_SECONDS - 1) * 1000), true);
    assert.equal(await verifyPass(pass, SECRET, NOW + PASS_TTL_SECONDS * 1000), false);
  });

  it("rejects a pass signed with another secret", async () => {
    const pass = await issuePass("some-other-secret", NOW);
    assert.equal(await verifyPass(pass, SECRET, NOW), false);
  });

  it("rejects a tampered expiry", async () => {
    const [version, expiry, nonce, signature] = (await issuePass(SECRET, NOW)).split(".");
    const extended = [version, String(Number(expiry) + 3600), nonce, signature].join(".");
    assert.equal(await verifyPass(extended, SECRET, NOW), false);
  });

  it("rejects a pass dated further ahead than one can be issued", async () => {
    const future = await issuePass(SECRET, NOW + 30 * 24 * 3600 * 1000);
    assert.equal(await verifyPass(future, SECRET, NOW), false);
  });

  it("rejects garbage without throwing", async () => {
    for (const value of [
      null,
      "",
      "v1",
      "v1.a.b.c",
      "v2.1.2.3",
      "v1.9999999999.x.!!!",
      "x".repeat(500),
    ]) {
      assert.equal(await verifyPass(value, SECRET, NOW), false, String(value));
    }
  });

  it("builds a __Host- cookie that the parser reads back", async () => {
    const pass = await issuePass(SECRET, NOW);
    const header = passCookieHeader(pass);
    assert.match(header, /^__Host-gate=/);
    assert.match(header, /; Max-Age=172800; Path=\/; Secure; HttpOnly; SameSite=Lax$/);
    assert.equal(readPassCookie(`theme=dark; ${PASS_COOKIE}=${pass}; other=1`), pass);
    assert.equal(readPassCookie("theme=dark"), null);
    assert.equal(readPassCookie(null), null);
  });
});

describe("gate settings", () => {
  const secrets = { GATE_SECRET: "s", TURNSTILE_SECRET: "t" };
  it("is off unless the mode is on/force and both secrets exist", () => {
    assert.equal(gateSettings({ GATE_MODE: "off", ...secrets }), null);
    assert.equal(gateSettings({ GATE_MODE: "on", GATE_SECRET: "s" }), null);
    assert.equal(gateSettings({ GATE_MODE: "on", TURNSTILE_SECRET: "t" }), null);
    assert.deepEqual(gateSettings({ GATE_MODE: "on", ...secrets }), { mode: "on", secret: "s" });
    assert.deepEqual(gateSettings({ GATE_MODE: "force", ...secrets }), {
      mode: "force",
      secret: "s",
    });
  });
});

describe("gate decision", () => {
  const url = (path: string, host = "poli0981.dev") => new URL(`https://${host}${path}`);
  const human = new Headers({ "x-verified-bot": "false" });

  it("checks ordinary page views", () => {
    assert.equal(gateDecision("GET", url("/"), human, "on"), "check");
    assert.equal(gateDecision("GET", url("/blog/some-post/"), human, "on"), "check");
    assert.equal(gateDecision("GET", url("/pagefind/pagefind.js"), human, "on"), "check");
  });

  it("lets verified bots through — and only on an exact 'true'", () => {
    assert.equal(
      gateDecision("GET", url("/"), new Headers({ "x-verified-bot": "true" }), "on"),
      "pass",
    );
    assert.equal(
      gateDecision("GET", url("/"), new Headers({ "x-verified-bot": "TRUE " }), "on"),
      "check",
    );
  });

  it("fails open when the Transform Rule header is missing, unless forced", () => {
    assert.equal(gateDecision("GET", url("/"), new Headers(), "on"), "unconfigured");
    assert.equal(gateDecision("GET", url("/"), new Headers(), "force"), "check");
  });

  it("never gates non-GET, the admin host, APIs, media or legal pages", () => {
    assert.equal(gateDecision("HEAD", url("/"), human, "on"), "pass");
    assert.equal(gateDecision("POST", url("/"), human, "on"), "pass");
    assert.equal(gateDecision("GET", url("/admin/", "admin.poli0981.dev"), human, "on"), "pass");
    for (const path of [
      "/api/gate",
      "/admin/",
      "/media/v1/abc/avif-800",
      "/legal/privacy/",
      "/en/legal/terms/",
    ]) {
      assert.equal(gateDecision("GET", url(path), human, "on"), "pass", path);
    }
  });
});
