import type { APIRoute } from "astro";
import { GITHUB_CONTENT_TOKEN } from "astro:env/server";
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
  if (!GITHUB_CONTENT_TOKEN) return json({ error: "not_configured" }, 503);
  try {
    await dispatchPublish(GITHUB_CONTENT_TOKEN);
    return json({ dispatched: true }, 202);
  } catch (error) {
    return errorResponse(error);
  }
};
