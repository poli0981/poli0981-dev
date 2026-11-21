import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { GITHUB_CONTENT_TOKEN } from "astro:env/server";
import { recordAudit } from "@/lib/admin/audit";
import { listContentFiles } from "@/lib/admin/github";
import { errorResponse, json, readJson } from "@/lib/admin/http";
import { assertDeclaredSize, BodyTooLargeError } from "@/lib/body";
import { log } from "@/lib/log";
import { MEDIA_ID } from "@/lib/media";
import { versionInfo } from "@/lib/version";
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

/**
 * Content files that mention an image: on the content repo's main AND in the content the
 * live site was built from. Main alone is not enough — an edit that dropped the image but is
 * not live yet would let the delete break the page visitors still see.
 */
async function filesUsing(token: string, id: string): Promise<string[]> {
  const live = versionInfo(env as unknown as Parameters<typeof versionInfo>[0]).content;
  const main = await listContentFiles(token);
  const snapshots = [main];
  if (live && live !== main.head) snapshots.push(await listContentFiles(token, live));
  const paths = snapshots.flatMap(({ files }) =>
    files.filter((file) => file.text.includes(id)).map((file) => file.path),
  );
  return [...new Set(paths)];
}

/** Multipart framing (boundaries, the alt field, headers) on top of the file itself. */
const FORM_OVERHEAD_BYTES = 64 * 1024;

export const GET: APIRoute = async ({ url }) => {
  try {
    const items = await listMedia(env);
    if (!url.searchParams.has("usage")) return json({ items });
    // ?usage: which content files mention each image (the library's "used in" line, and
    // the same test DELETE applies before removing one).
    const usage: Record<string, string[]> = {};
    if (GITHUB_CONTENT_TOKEN) {
      const { files } = await listContentFiles(GITHUB_CONTENT_TOKEN);
      for (const item of items) {
        usage[item.id] = files.filter((file) => file.text.includes(item.id)).map((f) => f.path);
      }
    }
    return json({ items, usage });
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
      await recordAudit(env.KV, {
        admin: locals.admin?.email ?? "unknown",
        action: "media.upload",
        target: record.id,
        detail: record.name,
      });
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

export const PATCH: APIRoute = async ({ request, locals }) => {
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
    await recordAudit(env.KV, {
      admin: locals.admin?.email ?? "unknown",
      action: "media.alt",
      target: record.id,
      detail: record.alt,
    });
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
      const usedIn = await filesUsing(GITHUB_CONTENT_TOKEN, input.id);
      if (usedIn.length) return json({ error: "in_use", usedIn }, 409);
    }
    await deleteMedia(env, input.id, url.origin);
    await recordAudit(env.KV, {
      admin: locals.admin?.email ?? "unknown",
      action: "media.delete",
      target: input.id,
    });
    log.info("admin.media_deleted", { id: input.id, admin: locals.admin?.email });
    return json({ deleted: input.id });
  } catch (error) {
    return errorResponse(error);
  }
};
