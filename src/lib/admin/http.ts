import { BodyTooLargeError, isJsonRequest, readJsonLimited } from "../body";
import { log } from "../log";
import { ConflictError, GitHubError } from "./github";

/** Largest JSON body any admin endpoint accepts (a long post is ~50 KB of Markdown). */
const MAX_ADMIN_JSON_BYTES = 512 * 1024;

/** JSON response helper for the admin API (never cached). */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Map the admin's known failure types to HTTP; anything else is a 500 with a log line. */
export function errorResponse(error: unknown): Response {
  if (error instanceof BodyTooLargeError) return json({ error: "too_large" }, 413);
  if (error instanceof ConflictError)
    return json({ error: "conflict", message: error.message }, 409);
  if (error instanceof GitHubError) {
    log.error("admin.github_failed", { status: error.status, needs: error.needs, error });
    // 401/403 from a fine-grained token = missing permission or repo not selected.
    if (error.status === 401 || error.status === 403) {
      return json({ error: "github_permission", needs: error.needs, message: error.message }, 502);
    }
    return json({ error: "github", message: error.message }, 502);
  }
  log.error("admin.failed", { error });
  return json({ error: "internal" }, 500);
}

/**
 * Read a JSON request body, or null when it isn't one: wrong Content-Type (a form or a
 * text/plain body is never a legitimate admin request — CSRF defence in depth on top of the
 * middleware's origin check) or invalid JSON. Oversized bodies throw BodyTooLargeError,
 * which errorResponse maps to 413.
 */
export async function readJson<T>(request: Request): Promise<T | null> {
  if (!isJsonRequest(request)) return null;
  return readJsonLimited<T>(request, MAX_ADMIN_JSON_BYTES);
}

/** A plain JSON object (not null, not an array). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
