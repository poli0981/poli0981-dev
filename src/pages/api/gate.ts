import type { APIRoute } from "astro";
import { GATE_SECRET, TURNSTILE_SECRET } from "astro:env/server";
import { BodyTooLargeError, readJsonLimited } from "@/lib/body";
import { issuePass, passCookieHeader } from "@/lib/gate/cookie";
import { log } from "@/lib/log";
import { verifyTurnstile } from "@/lib/turnstile-server";

// Trades a solved Turnstile challenge (action "gate") for the 48-hour pass cookie that
// src/worker.ts checks before serving any page. Rate-limited by the middleware (RL_GATE).
export const prerender = false;

/** `{"token":"…"}` with a Turnstile token (≤ 2 KB) — anything bigger is not a real request. */
const MAX_BODY_BYTES = 8 * 1024;

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

  let body: { token?: unknown } | null;
  try {
    body = await readJsonLimited<{ token?: unknown }>(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json({ error: "too_large" }, 413);
    throw error;
  }
  const token = body?.token;
  if (typeof token !== "string") return json({ error: "invalid" }, 400);

  const verdict = await verifyTurnstile({
    secret: TURNSTILE_SECRET,
    token,
    action: "gate",
    ip: request.headers.get("cf-connecting-ip") ?? undefined,
  });
  if (!verdict.ok) {
    log.warn("gate.turnstile_failed", { reason: verdict.reason });
    return json({ error: "turnstile_failed", reason: verdict.reason }, 400);
  }

  return new Response(null, {
    status: 204,
    headers: {
      "set-cookie": passCookieHeader(await issuePass(GATE_SECRET)),
      "cache-control": "no-store",
    },
  });
};
