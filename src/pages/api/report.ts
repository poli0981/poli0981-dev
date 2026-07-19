import type { APIRoute } from "astro";
import { z } from "zod";
import { TURNSTILE_SECRET, GITHUB_ISSUES_TOKEN, DISCORD_WEBHOOK_BUG } from "astro:env/server";

// On-demand so middleware runs (rate-limits /api/report at 5/60s/IP). Secrets are optional
// at build so the site ships before they're provisioned; when TURNSTILE_SECRET or the GitHub
// token is missing this route replies 503 and the client dialog degrades to a Discord fallback.
export const prerender = false;

const REPO = "poli0981/poli0981-dev";
const MAX_BODY = 32_000;

const schema = z.object({
  description: z.string().min(10).max(2000),
  console: z
    .array(
      z.object({
        ts: z.string(),
        type: z.string(),
        message: z.string(),
        source: z.string().optional(),
        line: z.number().optional(),
        col: z.number().optional(),
        stack: z.string().optional(),
      }),
    )
    .max(20)
    .optional(),
  meta: z.object({
    route: z.string().max(300),
    ua: z.string().max(400),
    viewport: z.string().max(20),
    theme: z.string().max(20),
    locale: z.string().max(10),
    ref: z.string().max(40).optional(),
  }),
  turnstileToken: z.string().min(1).max(4000),
});

type ReportBody = z.infer<typeof schema>;

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function verifyTurnstile(token: string, secret: string, ip?: string): Promise<boolean> {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

async function createIssue(body: ReportBody, token: string): Promise<string | null> {
  const title = `[web-report] ${body.description.slice(0, 60).replace(/\s+/g, " ").trim()}`;
  const lines = [
    body.description,
    "",
    "---",
    `- Route: \`${body.meta.route}\``,
    `- Viewport: ${body.meta.viewport}`,
    `- Theme: ${body.meta.theme}`,
    `- Locale: ${body.meta.locale}`,
    body.meta.ref ? `- Ref: \`${body.meta.ref}\`` : "",
    `- UA: ${body.meta.ua}`,
  ];
  if (body.console?.length) {
    lines.push(
      "",
      "<details><summary>Console log</summary>",
      "",
      "```",
      ...body.console.map((c) => `[${c.ts}] ${c.type}: ${c.message}`),
      "```",
      "</details>",
    );
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "poli0981-dev-report-bot",
      },
      body: JSON.stringify({
        title,
        body: lines.filter(Boolean).join("\n"),
        labels: ["bug", "from-site"],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { html_url?: string };
    return data.html_url ?? null;
  } catch {
    return null;
  }
}

async function notifyDiscord(
  body: ReportBody,
  issueUrl: string | null,
  webhook: string,
): Promise<void> {
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "Báo lỗi mới từ website",
            description: body.description.slice(0, 500),
            color: 0xb4453a,
            fields: [
              { name: "Route", value: body.meta.route || "—", inline: true },
              { name: "Ref", value: body.meta.ref || "—", inline: true },
              ...(issueUrl ? [{ name: "Issue", value: issueUrl }] : []),
            ],
          },
        ],
      }),
    });
  } catch {
    /* best-effort — never block the response on Discord */
  }
}

export const POST: APIRoute = async ({ request }) => {
  if (!TURNSTILE_SECRET || !GITHUB_ISSUES_TOKEN) return json({ error: "not_configured" }, 503);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: "too_large" }, 413);

  let parsed: ReportBody;
  try {
    parsed = schema.parse(JSON.parse(raw));
  } catch {
    return json({ error: "invalid" }, 400);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? undefined;
  const ok = await verifyTurnstile(parsed.turnstileToken, TURNSTILE_SECRET, ip);
  if (!ok) return json({ error: "turnstile_failed" }, 400);

  const issueUrl = await createIssue(parsed, GITHUB_ISSUES_TOKEN);
  if (DISCORD_WEBHOOK_BUG) await notifyDiscord(parsed, issueUrl, DISCORD_WEBHOOK_BUG);

  // GitHub failed but Discord fired — the report is not lost (docs 10 §3).
  if (!issueUrl) return json({ ok: true, degraded: true }, 202);
  return json({ ok: true, url: issueUrl }, 201);
};
