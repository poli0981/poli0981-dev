import { ConflictError, GitHubError } from "./github";

/** JSON response helper for the admin API (never cached). */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Map the admin's known failure types to HTTP; anything else is a 500 with a log line. */
export function errorResponse(error: unknown): Response {
  if (error instanceof ConflictError)
    return json({ error: "conflict", message: error.message }, 409);
  if (error instanceof GitHubError) {
    console.error("[admin] GitHub:", error.message);
    // 401/403 from a fine-grained token = missing permission or repo not selected.
    if (error.status === 401 || error.status === 403) {
      return json({ error: "github_permission", needs: error.needs, message: error.message }, 502);
    }
    return json({ error: "github", message: error.message }, 502);
  }
  console.error("[admin]", error);
  return json({ error: "internal" }, 500);
}

/** Read a JSON request body, or null when it isn't valid JSON. */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
