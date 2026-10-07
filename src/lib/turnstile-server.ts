// Server-side Turnstile verification (siteverify), shared by every form that carries a
// widget token. Besides `success`, it checks that the token was minted for this site and
// for this form (`action`) — a token solved on one widget can't be replayed on another.

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const HOSTNAMES = new Set(["poli0981.dev"]);

// Cloudflare's published dummy secrets (always-pass / always-fail / token-spent). Their
// responses carry hostname "localhost" and action "test", so those two checks are skipped
// — but only for these secrets, never for the real one.
const TEST_SECRET = /^[123]x0+AA$/;

export type TurnstileAction = "report" | "gate";

export type TurnstileVerdict = { ok: true } | { ok: false; reason: string };

interface SiteverifyResponse {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
}

export async function verifyTurnstile(options: {
  secret: string;
  token: string;
  action: TurnstileAction;
  ip?: string;
}): Promise<TurnstileVerdict> {
  const { secret, token, action, ip } = options;
  if (!token || token.length > 2048) return { ok: false, reason: "missing-input-response" };

  // One retry on a network error, under the same idempotency key so siteverify doesn't
  // reject the second attempt as a duplicate of the first.
  const idempotencyKey = crypto.randomUUID();
  let data: SiteverifyResponse | null = null;
  for (let attempt = 0; attempt < 2 && !data; attempt++) {
    const form = new FormData();
    form.append("secret", secret);
    form.append("response", token);
    form.append("idempotency_key", idempotencyKey);
    if (ip) form.append("remoteip", ip);
    try {
      const res = await fetch(SITEVERIFY, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(5000),
      });
      data = (await res.json()) as SiteverifyResponse;
    } catch {
      /* retried once, then reported below */
    }
  }

  if (!data) return { ok: false, reason: "siteverify-unreachable" };
  if (data.success !== true) {
    return { ok: false, reason: data["error-codes"]?.join(",") || "rejected" };
  }
  if (TEST_SECRET.test(secret)) return { ok: true };
  if (data.action !== action) return { ok: false, reason: "action-mismatch" };
  if (!data.hostname || !HOSTNAMES.has(data.hostname)) {
    return { ok: false, reason: "hostname-mismatch" };
  }
  return { ok: true };
}
