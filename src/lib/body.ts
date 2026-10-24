// Bounded request-body reading. `request.text()` / `.json()` / `.formData()` buffer the whole
// body before anyone can look at its size, so a 100 MB POST to a 32 KB endpoint would be held
// in the isolate's memory first. These refuse on Content-Length up front and stop reading as
// soon as a streamed body crosses the limit.

export class BodyTooLargeError extends Error {
  constructor() {
    super("request body too large");
  }
}

/** Throws BodyTooLargeError when the declared Content-Length is over `max` bytes. */
export function assertDeclaredSize(request: Request, max: number): void {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) throw new BodyTooLargeError();
}

/** The body as UTF-8 text, refusing anything over `max` bytes without buffering all of it. */
export async function readTextLimited(request: Request, max: number): Promise<string> {
  assertDeclaredSize(request, max);
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * The body parsed as JSON, or null when it isn't valid JSON. Size violations still throw,
 * so callers can answer 413 rather than 400.
 */
export async function readJsonLimited<T>(request: Request, max: number): Promise<T | null> {
  const text = await readTextLimited(request, max);
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** True when the request declares a JSON body (any `application/json` parameters allowed). */
export function isJsonRequest(request: Request): boolean {
  const type = request.headers.get("content-type") ?? "";
  return type.split(";")[0].trim().toLowerCase() === "application/json";
}
