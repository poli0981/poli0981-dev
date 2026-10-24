import type { APIRoute } from "astro";
import { GITHUB_CONTENT_TOKEN } from "astro:env/server";
import { collectionOf, validateFrontmatter } from "@/lib/admin/collections";
import { buildFile, splitFile, type Frontmatter } from "@/lib/admin/frontmatter";
import { commitContent, listContentFiles, readContentFile } from "@/lib/admin/github";
import { errorResponse, isPlainObject, json, readJson } from "@/lib/admin/http";
import { log } from "@/lib/log";

// Content entries of poli0981/content. Saving commits straight to the content repo's
// main branch; nothing goes live until "Publish" (api/admin/publish).
export const prerender = false;

const MAX_FILE_BYTES = 200_000;

export const GET: APIRoute = async ({ url }) => {
  if (!GITHUB_CONTENT_TOKEN) return json({ error: "not_configured" }, 503);
  try {
    const path = url.searchParams.get("path");
    if (path) {
      const collection = collectionOf(path);
      if (!collection) return json({ error: "not_editable" }, 400);
      const file = await readContentFile(GITHUB_CONTENT_TOKEN, path);
      if (!file) return json({ error: "not_found" }, 404);
      const { data, body } = splitFile(file.text);
      return json({ path, sha: file.sha, collection: collection.id, frontmatter: data, body });
    }

    const { head, files } = await listContentFiles(GITHUB_CONTENT_TOKEN);
    const entries = files.flatMap((file) => {
      const collection = collectionOf(file.path);
      if (!collection) return [];
      const { data } = splitFile(file.text);
      return [
        {
          path: file.path,
          sha: file.sha,
          collection: collection.id,
          title: String(data[collection.titleKey] ?? file.path),
          lang: typeof data.lang === "string" ? data.lang : null,
          date: String(data.date ?? data.updated ?? data.effectiveDate ?? "") || null,
          draft: data.draft === true,
        },
      ];
    });
    return json({ head, entries });
  } catch (error) {
    return errorResponse(error);
  }
};

interface SaveBody {
  path: string;
  /** Blob sha the editor loaded; null when creating the file. */
  sha: string | null;
  frontmatter: Frontmatter;
  body: string;
}

export const PUT: APIRoute = async ({ request, locals }) => {
  if (!GITHUB_CONTENT_TOKEN) return json({ error: "not_configured" }, 503);
  try {
    const input = await readJson<SaveBody>(request);
    if (
      !input ||
      typeof input.path !== "string" ||
      typeof input.body !== "string" ||
      (input.sha !== null && typeof input.sha !== "string") ||
      !isPlainObject(input.frontmatter)
    ) {
      return json({ error: "invalid" }, 400);
    }
    const collection = collectionOf(input.path);
    if (!collection) return json({ error: "not_editable" }, 400);
    // New files: Markdown only (MDX runs code at build time), and only where adding an
    // entry is safe (see CollectionSpec.creatable — e.g. a second /now file would replace
    // the live page).
    if (input.sha === null) {
      if (!input.path.endsWith(".md")) return json({ error: "md_only" }, 400);
      if (!collection.creatable) return json({ error: "not_creatable" }, 400);
    }
    const errors = validateFrontmatter(collection, input.frontmatter);
    if (errors.length > 0) return json({ error: "invalid_fields", fields: errors }, 400);

    const original = input.sha ? await readContentFile(GITHUB_CONTENT_TOKEN, input.path) : null;
    // Creating a slug that already exists is its own error, not an edit conflict.
    if (input.sha === null && (await readContentFile(GITHUB_CONTENT_TOKEN, input.path))) {
      return json({ error: "already_exists" }, 409);
    }
    const text = buildFile(original?.text ?? null, input.frontmatter, input.body);
    if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) {
      return json({ error: "too_large" }, 413);
    }
    const verb = input.sha ? "update" : "add";
    const email = locals.admin?.email ?? "unknown";
    const commit = await commitContent(
      GITHUB_CONTENT_TOKEN,
      `content(${collection.id}): ${verb} ${input.path}\n\nvia admin (${email})`,
      [{ path: input.path, text, expectSha: input.sha }],
    );
    const saved = await readContentFile(GITHUB_CONTENT_TOKEN, input.path);
    log.info("admin.content_saved", { path: input.path, verb, commit, admin: email });
    return json({ commit, path: input.path, sha: saved?.sha ?? null });
  } catch (error) {
    return errorResponse(error);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!GITHUB_CONTENT_TOKEN) return json({ error: "not_configured" }, 503);
  try {
    const input = await readJson<{ path: string; sha: string }>(request);
    if (!input || typeof input.path !== "string" || typeof input.sha !== "string") {
      return json({ error: "invalid" }, 400);
    }
    const collection = collectionOf(input.path);
    if (!collection) return json({ error: "invalid" }, 400);
    // Only entries the admin may create can be deleted: removing a legal page, the /now
    // entry or an album's metadata would break the live site (and fail the next build).
    if (!collection.creatable) return json({ error: "not_deletable" }, 400);
    const email = locals.admin?.email ?? "unknown";
    const commit = await commitContent(
      GITHUB_CONTENT_TOKEN,
      `content: delete ${input.path}\n\nvia admin (${email})`,
      [{ path: input.path, text: null, expectSha: input.sha }],
    );
    log.info("admin.content_deleted", { path: input.path, commit, admin: email });
    return json({ commit });
  } catch (error) {
    return errorResponse(error);
  }
};
