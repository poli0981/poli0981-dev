import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { GITHUB_CONTENT_TOKEN } from "astro:env/server";
import { recordAudit } from "@/lib/admin/audit";
import { galleryPhotosPath, SLUG_PATTERN } from "@/lib/admin/collections";
import { buildFile, splitFile } from "@/lib/admin/frontmatter";
import {
  commitContent,
  listContentFiles,
  readContentFile,
  type FileChange,
  type RepoFile,
} from "@/lib/admin/github";
import { errorResponse, isPlainObject, json, readJson } from "@/lib/admin/http";
import { localPhotoCount } from "@/lib/gallery";
import { log } from "@/lib/log";
import { galleryPhotoListSchema } from "@/lib/media-schema";

// Gallery albums: the vi/en entries (gallery/<file>.md) and the album's R2 photo list
// (gallery-photos/<album>.json). Local photos under src/assets/gallery/ live in the site
// repo and are shown read-only — but they come first in the album, so the cover index
// (`coverIndex` in the entries) counts them: `local` tells the admin by how many.
export const prerender = false;

const ENTRY = /^gallery\/[^/]+\.mdx?$/;

/** The album's vi/en entries (any file under gallery/ whose `album` matches). */
function albumEntries(files: RepoFile[], album: string): RepoFile[] {
  return files.filter((file) => ENTRY.test(file.path) && splitFile(file.text).data.album === album);
}

interface AlbumSummary {
  album: string;
  /** Title per language. */
  titles: Record<string, string>;
  photos: unknown[];
  /** Blob sha of the R2 photo list; null when the album has none yet. */
  sha: string | null;
  /** The cover, as stored: an index into [local photos…, R2 photos…]. */
  coverIndex: number;
  /** How many local photos come before the R2 list. */
  local: number;
}

export const GET: APIRoute = async () => {
  if (!GITHUB_CONTENT_TOKEN) return json({ error: "not_configured" }, 503);
  try {
    const { files } = await listContentFiles(GITHUB_CONTENT_TOKEN);
    const albums = new Map<string, AlbumSummary>();
    const albumFor = (album: string): AlbumSummary => {
      let entry = albums.get(album);
      if (!entry) {
        entry = {
          album,
          titles: {},
          photos: [],
          sha: null,
          coverIndex: 0,
          local: localPhotoCount(album),
        };
        albums.set(album, entry);
      }
      return entry;
    };
    for (const file of files) {
      if (!ENTRY.test(file.path)) continue;
      const { data } = splitFile(file.text);
      const album = String(data.album ?? "");
      if (!album) continue;
      const entry = albumFor(album);
      entry.titles[String(data.lang ?? "vi")] = String(data.title ?? album);
      if (typeof data.coverIndex === "number") entry.coverIndex = data.coverIndex;
    }
    for (const file of files) {
      const match = /^gallery-photos\/([a-z0-9-]+)\.json$/.exec(file.path);
      if (!match) continue;
      const entry = albumFor(match[1]);
      let photos: unknown = null;
      try {
        photos = JSON.parse(file.text);
      } catch {
        // A hand-broken list shows as empty here; the build is what refuses it.
      }
      const parsed = galleryPhotoListSchema.safeParse(photos);
      entry.photos = parsed.success ? parsed.data.photos : [];
      entry.sha = file.sha;
    }
    return json({ albums: [...albums.values()].sort((a, b) => a.album.localeCompare(b.album)) });
  } catch (error) {
    return errorResponse(error);
  }
};

interface SaveBody {
  album: string;
  photos: unknown;
  /** Blob sha of gallery-photos/<album>.json as loaded; null if it didn't exist. */
  sha: string | null;
  /** Cover = this photo of the R2 list (0-based); the server adds the local offset. */
  cover?: number;
  /** Create the album's vi/en entries too (new album). */
  create?: {
    date: string;
    vi: { title: string; description?: string };
    en: { title: string; description?: string };
  };
}

const isTitled = (value: unknown): value is { title: string; description?: string } =>
  isPlainObject(value) &&
  typeof value.title === "string" &&
  value.title.trim() !== "" &&
  value.title.length <= 120 &&
  (value.description === undefined || typeof value.description === "string");

export const PUT: APIRoute = async ({ request, locals }) => {
  if (!GITHUB_CONTENT_TOKEN) return json({ error: "not_configured" }, 503);
  try {
    const input = await readJson<SaveBody>(request);
    const path =
      input && typeof input.album === "string" && SLUG_PATTERN.test(input.album)
        ? galleryPhotosPath(input.album)
        : null;
    if (!input || !path || (input.sha !== null && typeof input.sha !== "string")) {
      return json({ error: "invalid" }, 400);
    }
    const parsed = galleryPhotoListSchema.safeParse({ photos: input.photos });
    if (!parsed.success) {
      return json({ error: "invalid_photos", message: parsed.error.message }, 400);
    }
    const { cover } = input;
    if (
      cover !== undefined &&
      (!Number.isInteger(cover) || cover < 0 || cover >= parsed.data.photos.length)
    ) {
      return json({ error: "invalid_cover" }, 400);
    }
    const coverIndex = cover === undefined ? undefined : localPhotoCount(input.album) + cover;

    const changes: FileChange[] = [
      { path, text: `${JSON.stringify(parsed.data, null, 2)}\n`, expectSha: input.sha ?? null },
    ];
    if (input.create) {
      const { date, vi, en } = input.create;
      if (!isTitled(vi) || !isTitled(en) || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
        return json({ error: "invalid_album" }, 400);
      }
      const files = [`gallery/${input.album}.md`, `gallery/${input.album}-en.md`];
      for (const file of files) {
        if (await readContentFile(GITHUB_CONTENT_TOKEN, file)) {
          return json({ error: "already_exists", path: file }, 409);
        }
      }
      for (const [lang, entry, file] of [
        ["vi", vi, files[0]],
        ["en", en, files[1]],
      ] as const) {
        const frontmatter = {
          title: entry.title.trim(),
          lang,
          translationKey: input.album,
          date,
          description: entry.description?.trim(),
          album: input.album,
          coverIndex: coverIndex ?? 0,
        };
        changes.push({ path: file, text: buildFile(null, frontmatter, ""), expectSha: null });
      }
    } else if (coverIndex !== undefined) {
      // A new cover rewrites coverIndex in both language entries, in the same commit.
      const { files } = await listContentFiles(GITHUB_CONTENT_TOKEN);
      for (const file of albumEntries(files, input.album)) {
        const { data, body } = splitFile(file.text);
        if (data.coverIndex === coverIndex) continue;
        const text = buildFile(file.text, { ...data, coverIndex }, body);
        changes.push({ path: file.path, text, expectSha: file.sha });
      }
    }

    const email = locals.admin?.email ?? "unknown";
    const verb = input.create ? "create" : "update";
    const commit = await commitContent(
      GITHUB_CONTENT_TOKEN,
      `content(gallery): ${verb} album ${input.album}\n\nvia admin (${email})`,
      changes,
    );
    await recordAudit(env.KV, {
      admin: email,
      action: "gallery.save",
      target: input.album,
      detail: commit,
    });
    log.info("admin.gallery_saved", { album: input.album, verb, commit, admin: email });
    return json({ commit });
  } catch (error) {
    return errorResponse(error);
  }
};

/** Remove an album: its R2 photo list and both entries (the photos stay in the library). */
export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!GITHUB_CONTENT_TOKEN) return json({ error: "not_configured" }, 503);
  try {
    const input = await readJson<{ album: string }>(request);
    const album = typeof input?.album === "string" ? input.album : "";
    const listPath = galleryPhotosPath(album);
    if (!listPath) return json({ error: "invalid" }, 400);
    const { files } = await listContentFiles(GITHUB_CONTENT_TOKEN);
    const doomed = [
      ...albumEntries(files, album),
      ...files.filter((file) => file.path === listPath),
    ];
    if (doomed.length === 0) return json({ error: "not_found" }, 404);
    const email = locals.admin?.email ?? "unknown";
    const commit = await commitContent(
      GITHUB_CONTENT_TOKEN,
      `content(gallery): delete album ${album}\n\nvia admin (${email})`,
      doomed.map((file) => ({ path: file.path, text: null, expectSha: file.sha })),
    );
    await recordAudit(env.KV, {
      admin: email,
      action: "gallery.delete",
      target: album,
      detail: commit,
    });
    log.info("admin.gallery_deleted", { album, commit, admin: email });
    return json({ commit, deleted: doomed.map((file) => file.path) });
  } catch (error) {
    return errorResponse(error);
  }
};
