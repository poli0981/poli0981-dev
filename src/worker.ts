import { handle } from "@astrojs/cloudflare/handler";
import { loadDenylist, matchEntry } from "./lib/denylist";
import { stampErrorRef } from "./lib/error-ref";
import { serveExternalImage } from "./lib/ext-img";
import { readPassCookie, verifyPass } from "./lib/gate/cookie";
import { gateDecision, gateSettings, VERIFIED_BOT_HEADER } from "./lib/gate/policy";
import { renderGate } from "./lib/gate/render";
import { routeHosts } from "./lib/hosts";
import { log, requestFields } from "./lib/log";
import { serveMedia } from "./lib/media/serve";
import { withSecurityHeaders } from "./lib/security-headers";
import { versionInfo } from "./lib/version";

// Custom Worker entry (wrangler.jsonc `main`). With `assets.run_worker_first` every page
// request reaches this code first — prerendered pages otherwise bypass the Worker and the
// Astro middleware entirely (the adapter serves them before middleware runs). Hashed build
// assets, feeds, the sitemap etc. are excluded there and never invoke the Worker.
//
// The build-time prerender worker always uses the adapter's own entry, so nothing here
// runs during `astro build`.

/**
 * On-demand Astro routes: always rendered by the app, never looked up in ASSETS. Every
 * `prerender = false` page must live under one of these (tests/worker.test.ts checks).
 */
export const APP_PREFIXES = ["/api/", "/admin", "/media/", "/ext-img/"];

/** Secrets aren't in the generated Env type (wrangler only sees `vars`). */
type GateEnv = { GATE_MODE?: string; GATE_SECRET?: string; TURNSTILE_SECRET?: string };

let warnedUnconfigured = false;

/**
 * The IP denylist (lib/denylist, managed from the admin) for every route the Worker sees —
 * pages included, which the Astro middleware never reaches. Fails OPEN: a KV hiccup must
 * not lock everyone out, and the zone WAF stays the hard outer layer (docs 07 §6).
 */
async function denied(request: Request, env: Env): Promise<Response | null> {
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip || !env.KV) return null;
  let entry;
  try {
    entry = matchEntry(ip, await loadDenylist(env.KV));
  } catch (error) {
    log.error("denylist.unavailable", { ...requestFields(request), error });
    return null;
  }
  if (!entry) return null;
  log.warn("denylist.blocked", { ...requestFields(request), range: entry.cidr });
  // The prerendered 403 page; `/403/` with the slash, or ASSETS answers a 307 (see middleware).
  const page = await env.ASSETS.fetch(new URL("/403/", request.url));
  const response = new Response(page.body, { status: 403, headers: page.headers });
  response.headers.set("Cache-Control", "no-store");
  return withSecurityHeaders(response);
}

/**
 * The Turnstile gate (docs 06 §3b): unless the request carries a valid 48-hour pass, a
 * page answers with the gate instead of its content. Returns the response to send, or
 * null to carry on normally.
 */
async function gate(request: Request, url: URL, env: Env): Promise<Response | null> {
  const settings = gateSettings(env as unknown as GateEnv);
  if (!settings) return null;

  const decision = gateDecision(request.method, url, request.headers, settings.mode);
  if (decision === "unconfigured") {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      log.error("gate.unconfigured", {
        detail: `no ${VERIFIED_BOT_HEADER} header — the zone Transform Rule is missing, so the gate is OFF (fail-open)`,
      });
    }
    return null;
  }
  if (decision === "pass") return null;
  if (await verifyPass(readPassCookie(request.headers.get("cookie")), settings.secret)) {
    return null;
  }

  // Search fragments hold the full text of every page — no pass, no index.
  if (url.pathname.startsWith("/pagefind/")) {
    return withSecurityHeaders(
      new Response("Forbidden", { status: 403, headers: { "cache-control": "no-store" } }),
    );
  }

  // Only a real page becomes the gate; redirects, 304s, 404s and non-HTML pass through.
  const page = await env.ASSETS.fetch(request);
  const type = page.headers.get("content-type") ?? "";
  if (page.status === 200 && type.includes("text/html")) return renderGate(page);
  return withSecurityHeaders(page);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      // www → apex for every route (the middleware only ever saw on-demand routes).
      if (url.hostname.startsWith("www.")) {
        url.hostname = url.hostname.slice(4);
        return Response.redirect(url.toString(), 301);
      }

      const blocked = await denied(request, env);
      if (blocked) return blocked;

      const hostRoute = routeHosts(url);
      if (hostRoute) return withSecurityHeaders(hostRoute);

      // R2 image variants (year-long immutable cache; see lib/media/serve) and the widgets'
      // third-party pictures, mirrored into KV by the cron worker (lib/ext-img).
      if (url.pathname.startsWith("/media/")) return await serveMedia(request, env, ctx);
      if (url.pathname.startsWith("/ext-img/")) {
        return withSecurityHeaders(await serveExternalImage(request, env.KV));
      }

      // The gate fails CLOSED: if deciding or rendering it throws, the visitor gets a 503 —
      // never the page the gate stands in front of (a throw here used to fall through to
      // the fail-open handler below and serve the real page).
      let gated: Response | null;
      try {
        gated = await gate(request, url, env);
      } catch (error) {
        log.error("gate.failed", { ...requestFields(request), error });
        return withSecurityHeaders(
          new Response("Service temporarily unavailable", {
            status: 503,
            headers: {
              "content-type": "text/plain; charset=utf-8",
              "cache-control": "no-store",
              "retry-after": "30",
            },
          }),
        );
      }
      if (gated) return gated;

      // Serve pages straight from ASSETS with the *original* request. The adapter's own
      // asset lookup fetches by URL string, which drops the method and conditional
      // headers — every revalidation would turn into a full 200 and HEAD into GET.
      // A miss is answered here as well: the asset layer sends the nearest 404.html up the
      // path with status 404 (`not_found_handling: "404-page"`), so /en/... gets the English
      // page. The app has nothing else for a path outside APP_PREFIXES, and its own lookup of
      // a localized error page (/en/404/index) is answered with a redirect.
      // In `astro dev` nothing is built yet, so let the app handle everything.
      const isRead = request.method === "GET" || request.method === "HEAD";
      if (
        !import.meta.env.DEV &&
        isRead &&
        !APP_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
      ) {
        return withSecurityHeaders(await env.ASSETS.fetch(request));
      }
    } catch (error) {
      // Fail open: a bug in edge logic must never take the static site down with it.
      log.error("worker.edge_failed", {
        ...requestFields(request),
        version: versionInfo(env).id,
        error,
      });
    }

    const response = await handle(request, env, ctx);
    return withSecurityHeaders(stampErrorRef(response, request.headers.get("cf-ray")));
  },
} satisfies ExportedHandler<Env>;
