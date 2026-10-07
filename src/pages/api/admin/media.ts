import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { GITHUB_CONTENT_TOKEN } from "astro:env/server";
import { listContentFiles } from "@/lib/admin/github";
import { errorResponse, json, readJson } from "@/lib/admin/http";
import { MEDIA_ID } from "@/lib/media";
import {
  deleteMedia,
  listMedia,
  processUpload,
  readMediaRecord,
  UploadError,
  writeMediaRecord,
} from "@/lib/media/process";

// The R2 media library: list, upload (transform once → R2), edit alt text, delete.
export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    return json({ items: await listMedia(env) });
  } catch (error) {
    return errorResponse(error);
  }
};

export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "invalid" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "no_file" }, 400);
  const alt = String(form.get("alt") ?? "");
  try {
    const { record, created } = await processUpload(env, await file.arrayBuffer(), {
      name: file.name,
      alt,
    });
    return json({ item: record, created }, created ? 201 : 200);
  } catch (error) {
    if (error instanceof UploadError)
      return json({ error: "rejected", message: error.message }, error.status);
    return errorResponse(error);
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  const input = await readJson<{ id: string; alt: string }>(request);
  if (!input || !MEDIA_ID.test(input.id ?? "") || typeof input.alt !== "string") {
    return json({ error: "invalid" }, 400);
  }
  try {
    const record = await readMediaRecord(env, input.id);
    if (!record) return json({ error: "not_found" }, 404);
    record.alt = input.alt.trim().slice(0, 300);
    await writeMediaRecord(env, record);
    return json({ item: record });
  } catch (error) {
    return errorResponse(error);
  }
};

export const DELETE: APIRoute = async ({ request, url }) => {
  const input = await readJson<{ id: string }>(request);
  if (!input || !MEDIA_ID.test(input.id ?? "")) return json({ error: "invalid" }, 400);
  try {
    // Refuse while any content still points at it — the live site would break, and a
    // publish would fail the build anyway.
    if (GITHUB_CONTENT_TOKEN) {
      const { files } = await listContentFiles(GITHUB_CONTENT_TOKEN);
      const usedIn = files.filter((f) => f.text.includes(input.id)).map((f) => f.path);
      if (usedIn.length) return json({ error: "in_use", usedIn }, 409);
    }
    await deleteMedia(env, input.id, url.origin);
    return json({ deleted: input.id });
  } catch (error) {
    return errorResponse(error);
  }
};
