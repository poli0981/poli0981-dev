import type { APIRoute } from "astro";
import { GATE_SECRET, TURNSTILE_SECRET } from "astro:env/server";
import { issuePass, passCookieHeader } from "@/lib/gate/cookie";
import { verifyTurnstile } from "@/lib/turnstile-server";

// Trades a solved Turnstile challenge (action "gate") for the 48-hour pass cookie that
// src/worker.ts checks before serving any page. Rate-limited by the middleware (RL_GATE).
export const prerender = false;

const json = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const POST: APIRoute = async ({ request }) => {
  if (!GATE_SECRET || !TURNSTILE_SECRET) return json({ error: "not_configured" }, 503);

  // Only the gate page on this origin may ask for a pass.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return json({ error: "forbidden" }, 403);

  let token: unknown;
  try {
    ({ token } = (await request.json()) as { token?: unknown });
  } catch {
    return json({ error: "invalid" }, 400);
  }
  if (typeof token !== "string") return json({ error: "invalid" }, 400);

  const verdict = await verifyTurnstile({
    secret: TURNSTILE_SECRET,
    token,
    action: "gate",
    ip: request.headers.get("cf-connecting-ip") ?? undefined,
  });
  if (!verdict.ok) return json({ error: "turnstile_failed", reason: verdict.reason }, 400);

  return new Response(null, {
    status: 204,
    headers: {
      "set-cookie": passCookieHeader(await issuePass(GATE_SECRET)),
      "cache-control": "no-store",
    },
  });
};
