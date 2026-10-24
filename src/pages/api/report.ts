import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { TURNSTILE_SECRET, GITHUB_ISSUES_TOKEN, DISCORD_WEBHOOK_BUG } from "astro:env/server";
import { BodyTooLargeError, readTextLimited } from "@/lib/body";
import { log } from "@/lib/log";
import { verifyTurnstile } from "@/lib/turnstile-server";

// On-demand so middleware runs (RL_REPORT: 5 per 60 s per client). Secrets are optional
// at build so the site ships before they're provisioned; when TURNSTILE_SECRET or the GitHub
// token is missing this route replies 503 and the client dialog degrades to a Discord fallback.
export const prerender = false;

/** Private repo (wrangler.jsonc var): reports carry browser details and are never public. */
const DEFAULT_REPORT_REPO = "poli0981/site-reports";
const MAX_BODY = 32_000;
const TIMEOUT_MS = 10_000;

const schema = z.object({
  description: z.string().min(10).max(2000),
  console: z
    .array(
      z.object({
        ts: z.string().max(40),
        type: z.string().max(40),
        message: z.string().max(1000),
        source: z.string().max(500).optional(),
        line: z.number().optional(),
        col: z.number().optional(),
        stack: z.string().max(2000).optional(),
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
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/**
 * Reporter-supplied text is rendered as Markdown on GitHub. Break `@user` mentions (a zero-
 * width space after "@" — nobody gets pinged by a stranger's report) and backticks in
 * values that sit inside inline code.
 */
const noMentions = (text: string) => text.replace(/@(?=[\w-])/g, "@​");
const inlineCode = (text: string) => `\`${text.replace(/`/g, "'")}\``;

/** A code fence longer than any backtick run inside, so the log can't close it early. */
function fenced(lines: string[]): string[] {
  let longest = 0;
  for (const line of lines) {
    for (const run of line.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  }
  const fence = "`".repeat(Math.max(3, longest + 1));
  return [fence, ...lines, fence];
}

function issueTitle(body: ReportBody): string {
  const summary = body.description.slice(0, 60).replace(/\s+/g, " ").trim();
  return `[web-report] ${noMentions(summary)}`;
}

function issueBody(body: ReportBody): string {
  const lines = [
    noMentions(body.description),
    "",
    "---",
    `- Route: ${inlineCode(body.meta.route)}`,
    `- Viewport: ${noMentions(body.meta.viewport)}`,
    `- Theme: ${noMentions(body.meta.theme)}`,
    `- Locale: ${noMentions(body.meta.locale)}`,
    body.meta.ref ? `- Ref: ${inlineCode(body.meta.ref)}` : "",
    `- UA: ${noMentions(body.meta.ua)}`,
  ];
  if (body.console?.length) {
    lines.push(
      "",
      "<details><summary>Console log</summary>",
      "",
      ...fenced(body.console.map((c) => `[${c.ts}] ${c.type}: ${c.message}`)),
      "</details>",
    );
  }
  return lines.filter(Boolean).join("\n");
}

async function createIssue(body: ReportBody, token: string): Promise<string | null> {
  const repo = (env as { REPORT_REPO?: string }).REPORT_REPO || DEFAULT_REPORT_REPO;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "poli0981-dev-report-bot",
      },
      body: JSON.stringify({
        title: issueTitle(body),
        body: issueBody(body),
        labels: ["bug", "from-site"],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      log.error("report.github_failed", { status: res.status, repo });
      return null;
    }
    const data = (await res.json()) as { html_url?: string };
    return data.html_url ?? null;
  } catch (error) {
    log.error("report.github_failed", { repo, error });
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
        // Never let reporter text ping anyone, whatever it contains.
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: "Báo lỗi mới từ website",
            description: body.description.slice(0, 500),
            color: 0x0f766e,
            fields: [
              { name: "Route", value: body.meta.route || "—", inline: true },
              { name: "Ref", value: body.meta.ref || "—", inline: true },
              ...(issueUrl ? [{ name: "Issue", value: issueUrl }] : []),
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // Best-effort — never block the response on Discord.
    log.warn("report.discord_failed", { error });
  }
}

export const POST: APIRoute = async ({ request }) => {
  if (!TURNSTILE_SECRET || !GITHUB_ISSUES_TOKEN) return json({ error: "not_configured" }, 503);

  let raw: string;
  try {
    raw = await readTextLimited(request, MAX_BODY);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json({ error: "too_large" }, 413);
    throw error;
  }

  let parsed: ReportBody;
  try {
    parsed = schema.parse(JSON.parse(raw));
  } catch {
    return json({ error: "invalid" }, 400);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? undefined;
  const verdict = await verifyTurnstile({
    secret: TURNSTILE_SECRET,
    token: parsed.turnstileToken,
    action: "report",
    ip,
  });
  if (!verdict.ok) return json({ error: "turnstile_failed", reason: verdict.reason }, 400);

  const issueUrl = await createIssue(parsed, GITHUB_ISSUES_TOKEN);
  if (DISCORD_WEBHOOK_BUG) await notifyDiscord(parsed, issueUrl, DISCORD_WEBHOOK_BUG);
  log.info("report.received", { route: parsed.meta.route, filed: issueUrl !== null });

  // GitHub failed but Discord fired — the report is not lost (docs 10 §3). The issue lives
  // in a private repo, so its URL is not echoed back to the reporter.
  if (!issueUrl) return json({ ok: true, degraded: true }, 202);
  return json({ ok: true }, 201);
};
