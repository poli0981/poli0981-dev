import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { GITHUB_CONTENT_TOKEN } from "astro:env/server";
import { listAudit } from "@/lib/admin/audit";
import { recentContentCommits } from "@/lib/admin/github";
import { errorResponse, json } from "@/lib/admin/http";

// The activity page: the admin's own audit log (KV, 90 days) next to the content repo's
// latest commits, which also show edits made outside the admin (GitHub, a local clone).
export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const kv = env.KV as KVNamespace | undefined;
    const [audit, commits] = await Promise.all([
      kv ? listAudit(kv) : [],
      GITHUB_CONTENT_TOKEN ? recentContentCommits(GITHUB_CONTENT_TOKEN) : [],
    ]);
    return json({ audit, commits });
  } catch (error) {
    return errorResponse(error);
  }
};
