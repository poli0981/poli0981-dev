import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { routeHosts } from "../src/lib/hosts.ts";

const route = (url: string) => routeHosts(new URL(url));

describe("host routing", () => {
  it("sends the admin host's root to /admin/ and keeps admin + media there", () => {
    assert.equal(
      route("https://admin.poli0981.dev/")?.headers.get("location"),
      "https://admin.poli0981.dev/admin/",
    );
    assert.equal(route("https://admin.poli0981.dev/admin/edit/?path=blog/x.md"), null);
    assert.equal(route("https://admin.poli0981.dev/api/admin/content"), null);
    assert.equal(route("https://admin.poli0981.dev/media/v1/0123456789abcdef/avif-480"), null);
  });

  it("never serves public pages on the admin host", () => {
    const res = route("https://admin.poli0981.dev/blog/x/?a=1");
    assert.equal(res?.status, 301);
    assert.equal(res?.headers.get("location"), "https://poli0981.dev/blog/x/?a=1");
  });

  it("moves /admin off the public host and hides its API there", () => {
    const res = route("https://poli0981.dev/admin/media/");
    assert.equal(res?.status, 301);
    assert.equal(res?.headers.get("location"), "https://admin.poli0981.dev/admin/media/");
    assert.equal(route("https://poli0981.dev/api/admin/content")?.status, 404);
    assert.equal(route("https://poli0981.dev/administrator"), null); // not an admin path
  });

  it("leaves everything else alone (incl. local dev hosts)", () => {
    assert.equal(route("https://poli0981.dev/"), null);
    assert.equal(route("http://localhost:4321/admin/"), null);
  });
});
