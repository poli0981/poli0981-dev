import { createRemoteJWKSet, jwtVerify } from "jose";

// Cloudflare Access protects admin.poli0981.dev at the edge; this is the second lock.
// Every admin request must carry a valid Access JWT (Cf-Access-Jwt-Assertion) for THIS
// application: signature against the team's JWKS, `aud` = the app's AUD tag, `iss` = the
// team domain, not expired, issued within the last 24 hours. Without it — a workers.dev or
// preview URL, a forged header, another Access app's token — the admin answers 403,
// whatever the edge did. On top of that the email must be on ADMIN_EMAILS: Access decides
// who reaches the admin's URL, the allowlist who may act in it, so an Access policy
// widened by mistake does not open the admin. No allowlist, no admin (fail closed).

export interface AdminIdentity {
  email: string;
}

interface AccessEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Comma-separated allowlist on top of the Access policy; unset = nobody. */
  ADMIN_EMAILS?: string;
}

// One JWKS fetcher per team for the isolate's lifetime; jose caches and refreshes keys.
const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Older tokens are refused even if Access still considers the session valid. */
const MAX_TOKEN_AGE = "24h";

/** "https://team.cloudflareaccess.com/" → without the trailing slashes (no regex backtracking). */
function withoutTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end--;
  return value.slice(0, end);
}

export async function verifyAccess(
  request: Request,
  env: AccessEnv,
): Promise<AdminIdentity | null> {
  const team = env.ACCESS_TEAM_DOMAIN ? withoutTrailingSlashes(env.ACCESS_TEAM_DOMAIN) : undefined;
  const audience = env.ACCESS_AUD;
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!team || !audience || !token) return null;

  let jwks = jwksByTeam.get(team);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`));
    jwksByTeam.set(team, jwks);
  }

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: team,
      audience,
      algorithms: ["RS256"],
      maxTokenAge: MAX_TOKEN_AGE,
    });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if (!email) return null; // service tokens carry no email — not an admin
    const allowlist = (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    if (!allowlist.includes(email)) return null;
    return { email };
  } catch {
    return null;
  }
}
