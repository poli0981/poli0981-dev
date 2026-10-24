# Security Policy

## Reporting a vulnerability

Email **security@poli0981.dev**. Please include steps to reproduce and the affected URL.
Do not open a public issue for a security problem.

Expect an acknowledgement within 7 days. This is a personal site maintained by one
person, in their spare time — there is no bug bounty and no payout.

Machine-readable contact: <https://poli0981.dev/.well-known/security.txt> (RFC 9116).

## Scope

**In scope**

- `poli0981.dev`, including its `/api/*` endpoints, `/media/*` and `/ext-img/*`
- `admin.poli0981.dev` — anything that reaches the admin or its API without passing
  Cloudflare Access, the Worker's own Access JWT check or the email allowlist, or that lets
  an admin page run attacker-controlled script
- The Turnstile bot gate in front of the pages (a way to see page content without a pass)
- The widgets cron worker and this repository's build, CI and deploy pipeline

**Out of scope**

- Findings that require an already-compromised Cloudflare, GitHub or Access identity
- Attacks on Cloudflare Access's own login flow (report those to Cloudflare)
- Volumetric denial of service
- Missing hardening headers with no demonstrated impact
- Reports that are only raw automated-scanner output, with no working proof of concept
- Anything about the third-party services the site links out to (YouTube, Steam, Discord…)

## Supported versions

Only the currently deployed site (`main` → Cloudflare Workers) is supported. Releases are
tagged (`v2.0.0` onwards, see [`CHANGELOG.md`](CHANGELOG.md)) for reference only — there are
no backports. `https://poli0981.dev/api/health` reports the version and commit that is live.

## What the site actually handles

Useful context when judging impact — the site is static and stores almost nothing:

- No visitor accounts or logins, no ad or analytics trackers. The only cookie is
  `__Host-gate`, a signed 48-hour pass set after the Turnstile bot check (expiry, random
  value and HMAC — no identifier; see `src/lib/gate/`).
- User-submitted input: the bug-report form (Turnstile-gated, schema-validated, size-capped,
  forwarded to an issue in a **private** repository and a Discord webhook) and the bot-check
  token exchange at `/api/gate`. Both are rate-limited per client.
- IP addresses are used transiently for rate limiting and the IP denylist; they are not
  stored with reports. Workers Logs keep request logs for 7 days.
- The admin is single-owner: Cloudflare Access in front, plus the Worker verifying the Access
  JWT, a 24-hour token age and an email allowlist on every request; every action is written to
  an audit log.

The hardening in place is described in
[`poli0981.dev-docs/06_SECURITY.md`](poli0981.dev-docs/06_SECURITY.md), and the privacy
statement at [`/legal/privacy`](https://poli0981.dev/legal/privacy/).
