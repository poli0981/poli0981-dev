import { handle } from "@astrojs/cloudflare/handler";
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      // www → apex for every route (the middleware only ever saw on-demand routes).
      if (url.hostname.startsWith("www.")) {
        url.hostname = url.hostname.slice(4);
        return Response.redirect(url.toString(), 301);
      }

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
