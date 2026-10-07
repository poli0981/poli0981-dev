import { handle } from "@astrojs/cloudflare/handler";
import { readPassCookie, verifyPass } from "./lib/gate/cookie";
import { gateDecision, gateSettings, VERIFIED_BOT_HEADER } from "./lib/gate/policy";
import { renderGate } from "./lib/gate/render";
import { serveMedia } from "./lib/media/serve";
import { withSecurityHeaders } from "./lib/security-headers";

// Custom Worker entry (wrangler.jsonc `main`). With `assets.run_worker_first` every page
// request reaches this code first — prerendered pages otherwise bypass the Worker and the
// Astro middleware entirely (the adapter serves them before middleware runs). Hashed build
// assets, feeds, the sitemap etc. are excluded there and never invoke the Worker.
//
// The build-time prerender worker always uses the adapter's own entry, so nothing here
// runs during `astro build`.

/** On-demand Astro routes: always rendered by the app, never looked up in ASSETS. */
const APP_PREFIXES = ["/api/", "/admin", "/media/"];

/** Secrets aren't in the generated Env type (wrangler only sees `vars`). */
type GateEnv = { GATE_MODE?: string; GATE_SECRET?: string; TURNSTILE_SECRET?: string };

let warnedUnconfigured = false;

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
      console.error(
        `[gate] no ${VERIFIED_BOT_HEADER} header — the zone Transform Rule is missing, so the gate is OFF (fail-open)`,
      );
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

      // R2 image variants (year-long immutable cache; see lib/media/serve).
      if (url.pathname.startsWith("/media/")) return await serveMedia(request, env, ctx);

      const gated = await gate(request, url, env);
      if (gated) return gated;

      // Serve pages straight from ASSETS with the *original* request. The adapter's own
      // asset lookup fetches by URL string, which drops the method and conditional
      // headers — every revalidation would turn into a full 200 and HEAD into GET.
      // In `astro dev` nothing is built yet, so let the app handle everything.
      const isRead = request.method === "GET" || request.method === "HEAD";
      if (
        !import.meta.env.DEV &&
        isRead &&
        !APP_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
      ) {
        const asset = await env.ASSETS.fetch(request);
        if (asset.status !== 404) return withSecurityHeaders(asset);
      }
    } catch (error) {
      // Fail open: a bug in edge logic must never take the static site down with it.
      console.error("[worker] edge logic failed; falling back to the Astro handler", error);
    }

    return withSecurityHeaders(await handle(request, env, ctx));
  },
} satisfies ExportedHandler<Env>;
