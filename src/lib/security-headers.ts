// Non-CSP security headers (docs 06 §1.1), shared by the worker entry (every page and
// asset response that passes through the Worker) and the Astro middleware (on-demand
// routes). The page CSP itself is a per-page <meta> emitted by Astro with script/style
// hashes — a header must never replace it. frame-ancestors, though, only works as a
// header, so it ships as its own header policy: browsers enforce every policy they
// receive, and one that contains nothing but frame-ancestors restricts framing alone.
// public/_headers carries the same set for assets served without the Worker.
const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"],
  ["Cross-Origin-Opener-Policy", "same-origin"],
  ["X-Frame-Options", "DENY"],
  ["Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload"],
];

const FRAME_ANCESTORS = "frame-ancestors 'none'";

/** Set the security headers on a response whose headers are mutable. */
export function applySecurityHeaders(headers: Headers): void {
  for (const [name, value] of SECURITY_HEADERS) headers.set(name, value);
  // Appended, not set: /media and /ext-img already carry their own CSP (sandbox), and
  // appending adds a second policy instead of replacing theirs. Idempotent, because
  // on-demand routes pass through both the middleware and the worker.
  const csp = headers.get("Content-Security-Policy");
  if (!csp?.includes("frame-ancestors")) headers.append("Content-Security-Policy", FRAME_ANCESTORS);
}

/**
 * Copy a response (bodies are streamed, not buffered) so its headers can be modified —
 * responses from fetch(), env.ASSETS and the Cache API have immutable headers — and add
 * the security headers.
 */
export function withSecurityHeaders(response: Response): Response {
  const copy = new Response(response.body, response);
  applySecurityHeaders(copy.headers);
  return copy;
}
