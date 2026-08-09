import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";

const RATE_LIMIT = 5; // requests per window per IP on /api/*
const WINDOW_SECONDS = 60;

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

  // Soft rate-limit on /api/* → custom 429 + Retry-After. (The hard limit is a
  // Cloudflare zone rule; KV is eventually-consistent, so this is best-effort.)
  if (url.pathname.startsWith("/api/") && kv) {
    // Namespace the counter per endpoint group so e.g. widget polling can't exhaust the
    // report budget (and vice-versa). "/api/report" → "report", "/api/widgets" → "widgets".
    const group = url.pathname.split("/")[2] || "api";
    const key = `rl:${group}:${ip}`;
    const current = Number((await kv.get(key)) ?? "0");
    if (current >= RATE_LIMIT) {
      const res = await serveError("/429/", 429);
      res.headers.set("Retry-After", String(WINDOW_SECONDS));
      return res;
    }
    await kv.put(key, String(current + 1), { expirationTtl: WINDOW_SECONDS });
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
