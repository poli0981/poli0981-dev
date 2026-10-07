import { PUBLIC_TURNSTILE_SITE_KEY } from "astro:env/client";
import { toLocale, useTranslations } from "@/i18n";
import type { Locale } from "@/i18n/routing";
import { withSecurityHeaders } from "../security-headers";

// The gate page IS the requested page with its <body> swapped out. The <head> stays
// byte-for-byte — title, description, canonical, hreflang, OG/Twitter tags, CSS, fonts,
// the hashed theme bootstrap and the CSP meta — so link previews (Zalo, Telegram… which
// aren't verified bots) still show the real title, and the page's own CSP already allows
// everything the gate needs: /gate.js is 'self', Turnstile is challenges.cloudflare.com.
// What could leak or run content is removed: the body, external scripts, modulepreloads
// and JSON-LD (the Q&A page carries every answer in it).

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ESCAPES[char]);

function gateMarkup(locale: Locale): string {
  const t = useTranslations(locale).humanCheck;
  const privacy = locale === "en" ? "/en/legal/privacy/" : "/legal/privacy/";
  const data: Record<string, string> = {
    sitekey: PUBLIC_TURNSTILE_SITE_KEY ?? "",
    lang: locale,
    "msg-verifying": t.verifying,
    "msg-ok": t.ok,
    "msg-error": t.error,
    "msg-slow-down": t.slowDown,
    "msg-load-failed": t.loadFailed,
  };
  const attrs = Object.entries(data)
    .map(([key, value]) => `data-${key}="${escapeHtml(value)}"`)
    .join(" ");
  return `<main class="human-check" data-human-check ${attrs}>
  <div class="human-check-card">
    <h1 class="human-check-title">${escapeHtml(t.title)}</h1>
    <p class="human-check-lead">${escapeHtml(t.lead)}</p>
    <div id="human-check-widget" class="human-check-widget"></div>
    <p class="human-check-status" role="status" aria-live="polite"></p>
    <button type="button" class="human-check-retry" hidden>${escapeHtml(t.retry)}</button>
    <noscript><p class="human-check-noscript">${escapeHtml(t.noscript)}</p></noscript>
    <p class="human-check-note"><a href="${privacy}">${escapeHtml(t.privacy)}</a></p>
  </div>
</main>
<script src="/gate.js" defer></script>`;
}

/** Turn a 200 text/html page response into the gate page for the same URL. */
export function renderGate(page: Response): Response {
  let locale: Locale = "vi";
  const rewritten = new HTMLRewriter()
    .on("html", {
      element(html) {
        locale = toLocale(html.getAttribute("lang") ?? undefined);
      },
    })
    .on("head script[src]", { element: (el) => void el.remove() })
    .on('link[rel="modulepreload"]', { element: (el) => void el.remove() })
    .on('script[type="application/ld+json"]', { element: (el) => void el.remove() })
    .on("body", {
      element(body) {
        body.setInnerContent(gateMarkup(locale), { html: true });
      },
    })
    .transform(page);

  const response = withSecurityHeaders(rewritten);
  // Status stays 200: many link-preview fetchers ignore non-2xx responses, which would
  // throw away the (real) <head> metadata kept above.
  response.headers.set("Cache-Control", "no-store, private");
  response.headers.set("X-Robots-Tag", "noindex");
  for (const header of ["ETag", "Last-Modified", "Content-Length"]) response.headers.delete(header);
  return response;
}
