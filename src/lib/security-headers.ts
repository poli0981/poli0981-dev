// Non-CSP security headers (docs 06 §1.1), shared by the worker entry (every page and
// asset response that passes through the Worker) and the Astro middleware (on-demand
// routes). The CSP itself is a per-page <meta> emitted by Astro — never set a
// Content-Security-Policy header on pages, it would clobber the per-page hashes.
// frame-ancestors can't be enforced from a meta tag, hence X-Frame-Options.
// public/_headers carries the same set for assets served without the Worker.
const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"],
  ["Cross-Origin-Opener-Policy", "same-origin"],
  ["X-Frame-Options", "DENY"],
  ["Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload"],
];

/** Set the security headers on a response whose headers are mutable. */
export function applySecurityHeaders(headers: Headers): void {
  for (const [name, value] of SECURITY_HEADERS) headers.set(name, value);
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
