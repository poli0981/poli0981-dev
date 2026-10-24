import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { RATE_LIMIT_WINDOW_SECONDS, allowRequest, apiGroup, clientSubject } from "./lib/ratelimit";
import { verifyAccess } from "./lib/admin/access";
import { log, requestFields } from "./lib/log";
import { applySecurityHeaders } from "./lib/security-headers";

/** Admin pages and APIs (matched on the route pattern, so URL-encoding can't dodge it). */
const ADMIN_ROUTE = /^\/(api\/)?admin(\/|$)/;

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;

  // www → apex and the IP denylist happen in the worker entry (src/worker.ts), before any
  // route — including the prerendered pages this middleware never sees.

  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  // Bindings may be absent under plain `astro dev`; guard so the build/prerender is safe.
  const assets = env.ASSETS as Fetcher | undefined;

  // Serve a prerendered error page via ASSETS, preserving the HTTP status.
  // `path` MUST carry the trailing slash: the pages build to /403/index.html, and with
  // `html_handling: "auto-trailing-slash"` a fetch of "/403" answers 307 with an EMPTY
  // body — which this would then re-wrap as a blank 403.
  const serveError = async (path: string, status: number): Promise<Response> => {
    // Without ASSETS (plain `astro dev`) the page is rendered by a rewrite, which answers with
    // the page's own 200 — re-wrap it either way so the error status survives.
    const res = assets ? await assets.fetch(new URL(path, url)) : await context.rewrite(path);
    const response = new Response(res.body, { status, headers: res.headers });
    response.headers.set("Cache-Control", "no-store");
    return response;
  };

  // Admin: a valid Cloudflare Access JWT for this application, every time (lib/admin/
  // access). `astro dev` has no Access in front of it, so it gets a stand-in identity —
  // import.meta.env.DEV is statically false in every production build.
  const isAdmin = ADMIN_ROUTE.test(context.routePattern ?? url.pathname);
  if (isAdmin) {
    const identity = import.meta.env.DEV
      ? { email: "dev@localhost" }
      : await verifyAccess(request, env as unknown as Record<string, string | undefined>);
    if (!identity) {
      log.warn("admin.access_denied", requestFields(request));
      return new Response("Forbidden", {
        status: 403,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }
    context.locals.admin = identity;
    // CSRF: anything that changes state must come from an admin page on this origin.
    // (Sibling subdomains are "same-site", so SameSite cookies alone don't cover it.)
    if (request.method !== "GET" && request.method !== "HEAD") {
      const fetchSite = request.headers.get("sec-fetch-site");
      if (
        (fetchSite && fetchSite !== "same-origin") ||
        request.headers.get("origin") !== url.origin
      ) {
        log.warn("admin.cross_origin_refused", requestFields(request));
        return new Response("Cross-origin request refused", { status: 403 });
      }
    }
  }

  // Per-group rate limit on /api/* (Workers Rate Limiting bindings, see lib/ratelimit) →
  // custom 429 + Retry-After. The zone WAF rule (docs 07 §6) is the hard outer limit.
  if (url.pathname.startsWith("/api/")) {
    const group = apiGroup(url.pathname);
    const subject = context.locals.admin ? `user:${context.locals.admin.email}` : clientSubject(ip);
    if (!(await allowRequest(group, subject))) {
      log.warn("ratelimit.exceeded", { ...requestFields(request), group });
      const res = await serveError("/429/", 429);
      res.headers.set("Retry-After", String(RATE_LIMIT_WINDOW_SECONDS));
      return res;
    }
  }

  const response = await next();

  // Security headers (lib/security-headers — the page CSP itself stays in the <meta>).
  applySecurityHeaders(response.headers);
  if (isAdmin) {
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    // Admin responses are for admin pages only — no other origin may embed or read them.
    response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  }
  return response;
});
