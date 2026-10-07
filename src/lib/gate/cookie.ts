// The 48-hour "verified human" pass: a signed cookie, so checking it costs one HMAC and
// no storage. Format: v1.<expiry unix s>.<nonce>.<base64url HMAC-SHA256 of the rest>.
// Runs in the Worker and in Node (unit tests) — WebCrypto only.

export const PASS_COOKIE = "__Host-gate";
export const PASS_TTL_SECONDS = 48 * 60 * 60;

const VERSION = "v1";
const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    keyCache.set(secret, key);
  }
  return key;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** A fresh pass value, valid for PASS_TTL_SECONDS from `now` (ms). */
export async function issuePass(secret: string, now = Date.now()): Promise<string> {
  const expiry = Math.floor(now / 1000) + PASS_TTL_SECONDS;
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(9)));
  const payload = `${VERSION}.${expiry}.${nonce}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    encoder.encode(payload),
  );
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/** The Set-Cookie header value for a pass. `__Host-` ⇒ Secure, Path=/, no Domain. */
export function passCookieHeader(value: string): string {
  return `${PASS_COOKIE}=${value}; Max-Age=${PASS_TTL_SECONDS}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

/** True when `value` is an unexpired pass signed with `secret` (constant-time check). */
export async function verifyPass(
  value: string | null | undefined,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  if (!value || value.length > 200) return false;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return false;
  const expiry = Number(parts[1]);
  const nowSeconds = Math.floor(now / 1000);
  // Expired, or further in the future than a pass can ever be issued for.
  if (!Number.isInteger(expiry) || expiry <= nowSeconds || expiry > nowSeconds + PASS_TTL_SECONDS) {
    return false;
  }
  const signature = fromBase64Url(parts[3]);
  if (!signature) return false;
  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signature,
    encoder.encode(parts.slice(0, 3).join(".")),
  );
}

/** The pass cookie's value from a Cookie header, if present. */
export function readPassCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index !== -1 && part.slice(0, index).trim() === PASS_COOKIE) {
      return part.slice(index + 1).trim();
    }
  }
  return null;
}
