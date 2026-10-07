import { createRemoteJWKSet, jwtVerify } from "jose";

// Cloudflare Access protects admin.poli0981.dev at the edge; this is the second lock.
// Every admin request must carry a valid Access JWT (Cf-Access-Jwt-Assertion) for THIS
// application: signature against the team's JWKS, `aud` = the app's AUD tag, `iss` = the
// team domain, not expired. Without it — a workers.dev or preview URL, a forged header,
// another Access app's token — the admin answers 403, whatever the edge did.

export interface AdminIdentity {
  email: string;
}

interface AccessEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Optional comma-separated allowlist on top of the Access policy. */
  ADMIN_EMAILS?: string;
}

// One JWKS fetcher per team for the isolate's lifetime; jose caches and refreshes keys.
const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function verifyAccess(
  request: Request,
  env: AccessEnv,
): Promise<AdminIdentity | null> {
  const team = env.ACCESS_TEAM_DOMAIN?.replace(/\/+$/, "");
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
    });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if (!email) return null; // service tokens carry no email — not an admin
    const allowlist = (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    if (allowlist.length > 0 && !allowlist.includes(email)) return null;
    return { email };
  } catch {
    return null;
  }
}
