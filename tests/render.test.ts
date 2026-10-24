// src/lib/gate/render.ts: the gate page is the requested page with its <body> swapped out.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { installHTMLRewriter } from "./support/fakes.ts";
import { renderGate } from "../src/lib/gate/render.ts";

const page = (lang: string) =>
  new Response(
    `<!doctype html><html lang="${lang}"><head><title>Real title</title>` +
      `<meta name="description" content="desc">` +
      `<script src="/_astro/island.js"></script>` +
      `<link rel="modulepreload" href="/_astro/chunk.js">` +
      `<script type="application/ld+json">{"answer":"secret"}</script>` +
      `</head><body><main>full article text</main></body></html>`,
    {
      headers: {
        "content-type": "text/html",
        etag: '"abc"',
        "last-modified": "x",
        "content-length": "1",
      },
    },
  );

before(installHTMLRewriter);

describe("gate page", () => {
  it("keeps the <head> metadata, drops scripts and JSON-LD, swaps the body", async () => {
    const response = renderGate(page("vi"));
    const html = await response.text();
    assert.match(html, /<title>Real title<\/title>/);
    assert.match(html, /name="description"/);
    assert.doesNotMatch(html, /island\.js|modulepreload|ld\+json|full article text/);
    assert.match(html, /data-human-check/);
    assert.match(html, /Xác minh bạn là người/);
    assert.match(html, /href="\/legal\/privacy\/"/);
    assert.match(html, /<script src="\/gate\.js" defer><\/script>/);
  });

  it("speaks the page's language and is never cached or indexed", async () => {
    const response = renderGate(page("en"));
    const html = await response.text();
    assert.match(html, /href="\/en\/legal\/privacy\/"/);
    assert.match(html, /data-lang="en"/);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, private");
    assert.equal(response.headers.get("x-robots-tag"), "noindex");
    for (const header of ["etag", "last-modified", "content-length"]) {
      assert.equal(response.headers.get(header), null, header);
    }
    assert.equal(response.headers.get("x-frame-options"), "DENY");
  });
});
