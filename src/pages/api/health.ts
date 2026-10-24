import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { versionInfo } from "@/lib/version";

// On-demand route so middleware (rate-limit, headers) runs for it. Reports the Worker
// version actually serving it, so a deploy can be verified from the outside.
export const prerender = false;

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ ok: true, version: versionInfo(env) }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
