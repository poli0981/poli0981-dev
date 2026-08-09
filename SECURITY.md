# Security Policy

## Reporting a vulnerability

Email **contact@poli0981.dev**. Please include steps to reproduce and the affected URL.
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

- No accounts, no login, no session cookies, no ad or analytics trackers.
- The only user-submitted input is the bug-report form, which is Turnstile-gated,
  schema-validated, and forwarded to a private GitHub issue and a Discord webhook.
- IP addresses are used transiently for rate limiting and are not stored with reports.

See [`/legal/privacy`](https://poli0981.dev/legal/privacy/) for the full statement.
