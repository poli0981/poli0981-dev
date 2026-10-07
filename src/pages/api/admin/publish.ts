import type { APIRoute } from "astro";
import { GITHUB_CONTENT_TOKEN, GITHUB_PUBLISH_TOKEN } from "astro:env/server";
import { dispatchPublish, publishStatus } from "@/lib/admin/github";
import { errorResponse, json } from "@/lib/admin/http";

// Publish = run .github/workflows/content-bump.yml on the site repo: it points the
// src/content submodule at content's main, opens/updates the content/bump PR, and lets
// CI + auto-merge deploy it (Workers Builds). Edits that touch .mdx wait for review.
export const prerender = false;

export const GET: APIRoute = async () => {
  if (!GITHUB_CONTENT_TOKEN) return json({ error: "not_configured" }, 503);
  try {
    return json(await publishStatus(GITHUB_CONTENT_TOKEN));
  } catch (error) {
    return errorResponse(error);
  }
};

export const POST: APIRoute = async () => {
  // Dispatching needs Actions write on the site repo — the publish token's only power.
  // Falls back to the content token for single-token setups.
  const token = GITHUB_PUBLISH_TOKEN ?? GITHUB_CONTENT_TOKEN;
  if (!token) return json({ error: "not_configured" }, 503);
  try {
    await dispatchPublish(token);
    return json({ dispatched: true }, 202);
  } catch (error) {
    return errorResponse(error);
  }
};
