# Security Policy

## Reporting a vulnerability

Email **security@poli0981.dev**. Please include steps to reproduce and the affected URL.
Do not open a public issue for a security problem.

Expect an acknowledgement within 7 days. This is a personal site maintained by one
person, in their spare time — there is no bug bounty and no payout.

Machine-readable contact: <https://poli0981.dev/.well-known/security.txt> (RFC 9116).

## Scope

**In scope**

- `poli0981.dev` and its `/api/*` endpoints
- This repository's build and deploy pipeline

**Out of scope**

- Findings that require an already-compromised Cloudflare or GitHub account
- Volumetric denial of service
- Missing hardening headers with no demonstrated impact
- Reports that are only raw automated-scanner output, with no working proof of concept
- Anything about the third-party services the site links out to (YouTube, Steam, Discord…)

## Supported versions

Only the currently deployed site (`main` → Cloudflare Workers) is supported. There are
no tagged releases and no backports.

## What the site actually handles

Useful context when judging impact — the site is static and stores almost nothing:

- No visitor accounts or logins, no ad or analytics trackers. The only cookie is
  `__Host-gate`, a signed 48-hour pass set after the Turnstile bot check (expiry, random
  value and HMAC — no identifier; see `src/lib/gate/`).
- User-submitted input: the bug-report form (Turnstile-gated, schema-validated, forwarded
  to a private GitHub issue and a Discord webhook) and the bot-check token exchange at
  `/api/gate`. Both are rate-limited per client.
- IP addresses are used transiently for rate limiting and are not stored with reports.

See [`/legal/privacy`](https://poli0981.dev/legal/privacy/) for the full statement.
