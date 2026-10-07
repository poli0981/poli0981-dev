import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { RATE_LIMIT_WINDOW_SECONDS, allowRequest, apiGroup, clientSubject } from "./lib/ratelimit";

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;

  // www → apex (301).
  if (url.hostname.startsWith("www.")) {
    const apex = new URL(url);
    apex.hostname = url.hostname.slice(4);
    return context.redirect(apex.toString(), 301);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  // Bindings may be absent under plain `astro dev`; guard so the build/prerender is safe.
  const kv = env.KV as KVNamespace | undefined;
  const assets = env.ASSETS as Fetcher | undefined;

  // Serve a prerendered error page via ASSETS, preserving the HTTP status.
  // `path` MUST carry the trailing slash: the pages build to /403/index.html, and with
  // `html_handling: "auto-trailing-slash"` a fetch of "/403" answers 307 with an EMPTY
  // body — which this would then re-wrap as a blank 403.
  const serveError = async (path: string, status: number): Promise<Response> => {
    if (assets) {
      const res = await assets.fetch(new URL(path, url));
      return new Response(res.body, { status, headers: res.headers });
    }
    return context.rewrite(path);
  };

  // Denylist → custom 403.
  if (kv) {
    const denied = await kv.get(`denylist:${ip}`);
    if (denied !== null) return serveError("/403/", 403);
  }

  // Per-group rate limit on /api/* (Workers Rate Limiting bindings, see lib/ratelimit) →
  // custom 429 + Retry-After. The zone WAF rule (docs 07 §6) is the hard outer limit.
  if (url.pathname.startsWith("/api/")) {
    const group = apiGroup(url.pathname);
    if (!(await allowRequest(group, clientSubject(ip)))) {
      const res = await serveError("/429/", 429);
      res.headers.set("Retry-After", String(RATE_LIMIT_WINDOW_SECONDS));
      return res;
    }
  }

  const response = await next();

  // Non-CSP security headers (docs 06 §1.1). The CSP itself is delivered per-page as a
  // <meta> tag by Astro — do NOT set a Content-Security-Policy header here or it would
  // clobber the per-page script/style hashes. frame-ancestors isn't enforceable in meta,
  // so framing is blocked with X-Frame-Options instead.
  const h = response.headers;
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("X-Frame-Options", "DENY");
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");

  return response;
});
