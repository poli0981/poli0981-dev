import type { APIRoute } from "astro";

// On-demand route so middleware (rate-limit, headers) runs for it.
export const prerender = false;

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
