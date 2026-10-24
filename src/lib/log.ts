// Structured logs for Workers Logs (wrangler.jsonc `observability.logs`): one JSON object per
// line, so every field — event, ray, status, path… — is a queryable column in the dashboard
// instead of text to grep. Never log secrets, tokens, cookies or request bodies.

type Level = "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

/** Errors serialize to `{}` with JSON.stringify; keep what helps and drop the rest. */
function plain(value: unknown): unknown {
  if (!(value instanceof Error)) return value;
  return {
    name: value.name,
    message: value.message,
    stack: value.stack?.split("\n").slice(0, 6).join("\n"),
  };
}

function emit(level: Level, event: string, fields: LogFields = {}): void {
  const entry: LogFields = { level, event };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) entry[key] = plain(value);
  }
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
};

/** The fields every request-scoped line should carry: the Cloudflare ray id and the path. */
export function requestFields(request: Request): LogFields {
  return {
    ray: request.headers.get("cf-ray") ?? undefined,
    method: request.method,
    path: new URL(request.url).pathname,
  };
}
