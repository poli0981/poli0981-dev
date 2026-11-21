import { env } from "cloudflare:workers";
import { GITHUB_CONTENT_TOKEN, GITHUB_PUBLISH_TOKEN } from "astro:env/server";
import { log } from "../log";
import { recordAudit } from "./audit";
import { dispatchPublish } from "./github";

// Every admin save or delete publishes by itself: it starts .github/workflows/content-bump.yml,
// which points src/content at the content repo's main, and CI + auto-merge + Workers Builds
// take it live. Saves in quick succession don't pile up — the workflow's concurrency group
// keeps one run going and one waiting, and the waiting one always reads the newest main.

/** The token that may start the publish workflow (falls back to the content token). */
export const publishToken = (): string | undefined => GITHUB_PUBLISH_TOKEN ?? GITHUB_CONTENT_TOKEN;

/** "queued" when the workflow was started, "failed" when it could not be (the save stands). */
export type AutoPublish = "queued" | "failed";

/**
 * Start a publish after a content commit. Never throws: the commit already succeeded, so a
 * dispatch problem is reported back to the editor (which offers "Xuất bản" by hand) instead
 * of turning a good save into an error.
 */
export async function autoPublish(admin: string, commit: string): Promise<AutoPublish> {
  const token = publishToken();
  if (!token) return "failed";
  try {
    await dispatchPublish(token);
  } catch (error) {
    log.warn("admin.autopublish_failed", {
      admin,
      commit,
      error: error instanceof Error ? error.message : String(error),
    });
    return "failed";
  }
  await recordAudit(env.KV, {
    admin,
    action: "publish.auto",
    target: "content → site",
    detail: commit,
  });
  return "queued";
}
