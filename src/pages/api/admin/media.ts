import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { GITHUB_CONTENT_TOKEN } from "astro:env/server";
import { listContentFiles } from "@/lib/admin/github";
import { errorResponse, json, readJson } from "@/lib/admin/http";
import { assertDeclaredSize, BodyTooLargeError } from "@/lib/body";
import { log } from "@/lib/log";
import { MEDIA_ID } from "@/lib/media";
import {
  deleteMedia,
  listMedia,
  MAX_UPLOAD_BYTES,
  processUpload,
  readMediaRecord,
  UploadError,
  writeMediaRecord,
} from "@/lib/media/process";

// The R2 media library: list, upload (transform once → R2), edit alt text, delete.
export const prerender = false;

/** Multipart framing (boundaries, the alt field, headers) on top of the file itself. */
const FORM_OVERHEAD_BYTES = 64 * 1024;

export const GET: APIRoute = async () => {
  try {
    return json({ items: await listMedia(env) });
  } catch (error) {
    return errorResponse(error);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  let form: FormData;
  try {
    // Refuse an oversized upload from its Content-Length, before formData() buffers it.
    assertDeclaredSize(request, MAX_UPLOAD_BYTES + FORM_OVERHEAD_BYTES);
    form = await request.formData();
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json({ error: "too_large" }, 413);
    return json({ error: "invalid" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "no_file" }, 400);
  const alt = String(form.get("alt") ?? "").slice(0, 300);
  try {
    const { record, created } = await processUpload(env, await file.arrayBuffer(), {
      name: file.name,
      alt,
    });
    if (created) {
      log.info("admin.media_uploaded", {
        id: record.id,
        bytes: record.bytes,
        admin: locals.admin?.email,
      });
    }
    return json({ item: record, created }, created ? 201 : 200);
  } catch (error) {
    if (error instanceof UploadError)
      return json({ error: "rejected", message: error.message }, error.status);
    return errorResponse(error);
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const input = await readJson<{ id: string; alt: string }>(request);
    if (
      !input ||
      typeof input.id !== "string" ||
      !MEDIA_ID.test(input.id) ||
      typeof input.alt !== "string"
    ) {
      return json({ error: "invalid" }, 400);
    }
    const record = await readMediaRecord(env, input.id);
    if (!record) return json({ error: "not_found" }, 404);
    record.alt = input.alt.trim().slice(0, 300);
    await writeMediaRecord(env, record);
    return json({ item: record });
  } catch (error) {
    return errorResponse(error);
  }
};

export const DELETE: APIRoute = async ({ request, url, locals }) => {
  try {
    const input = await readJson<{ id: string }>(request);
    if (!input || typeof input.id !== "string" || !MEDIA_ID.test(input.id)) {
      return json({ error: "invalid" }, 400);
    }
    // Refuse while any content still points at it — the live site would break, and a
    // publish would fail the build anyway.
    if (GITHUB_CONTENT_TOKEN) {
      const { files } = await listContentFiles(GITHUB_CONTENT_TOKEN);
      const usedIn = files.filter((f) => f.text.includes(input.id)).map((f) => f.path);
      if (usedIn.length) return json({ error: "in_use", usedIn }, 409);
    }
    await deleteMedia(env, input.id, url.origin);
    log.info("admin.media_deleted", { id: input.id, admin: locals.admin?.email });
    return json({ deleted: input.id });
  } catch (error) {
    return errorResponse(error);
  }
};
