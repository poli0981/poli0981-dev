import type { APIRoute } from "astro";
import { GITHUB_CONTENT_TOKEN } from "astro:env/server";
import { galleryPhotosPath, SLUG_PATTERN } from "@/lib/admin/collections";
import { buildFile, splitFile } from "@/lib/admin/frontmatter";
import { commitContent, listContentFiles, type FileChange } from "@/lib/admin/github";
import { errorResponse, json, readJson } from "@/lib/admin/http";
import { galleryPhotoListSchema } from "@/lib/media-schema";

// Gallery albums: the vi/en entries (gallery/<file>.md) and the album's R2 photo list
// (gallery-photos/<album>.json). Local photos under src/assets/gallery/ live in the site
// repo and are shown read-only.
export const prerender = false;

export const GET: APIRoute = async () => {
  if (!GITHUB_CONTENT_TOKEN) return json({ error: "not_configured" }, 503);
  try {
    const { files } = await listContentFiles(GITHUB_CONTENT_TOKEN);
    const albums = new Map<
      string,
      { album: string; titles: Record<string, string>; photos: unknown[]; sha: string | null }
    >();
    for (const file of files) {
      if (!/^gallery\/[^/]+\.mdx?$/.test(file.path)) continue;
      const { data } = splitFile(file.text);
      const album = String(data.album ?? "");
      if (!album) continue;
      const entry = albums.get(album) ?? { album, titles: {}, photos: [], sha: null };
      entry.titles[String(data.lang ?? "vi")] = String(data.title ?? album);
      albums.set(album, entry);
    }
    for (const file of files) {
      const match = /^gallery-photos\/([a-z0-9-]+)\.json$/.exec(file.path);
      if (!match) continue;
      const entry = albums.get(match[1]) ?? { album: match[1], titles: {}, photos: [], sha: null };
      const parsed = galleryPhotoListSchema.safeParse(JSON.parse(file.text));
      entry.photos = parsed.success ? parsed.data.photos : [];
      entry.sha = file.sha;
      albums.set(match[1], entry);
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
  /** Create the album's vi/en entries too (new album). */
  create?: {
    date: string;
    vi: { title: string; description?: string };
    en: { title: string; description?: string };
  };
}

export const PUT: APIRoute = async ({ request, locals }) => {
  if (!GITHUB_CONTENT_TOKEN) return json({ error: "not_configured" }, 503);
  const input = await readJson<SaveBody>(request);
  const path =
    input && SLUG_PATTERN.test(input.album ?? "") ? galleryPhotosPath(input.album) : null;
  if (!input || !path) return json({ error: "invalid" }, 400);
  const parsed = galleryPhotoListSchema.safeParse({ photos: input.photos });
  if (!parsed.success) return json({ error: "invalid_photos", message: parsed.error.message }, 400);

  const changes: FileChange[] = [
    { path, text: `${JSON.stringify(parsed.data, null, 2)}\n`, expectSha: input.sha ?? null },
  ];
  if (input.create) {
    const { date, vi, en } = input.create;
    if (!vi?.title || !en?.title || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
      return json({ error: "invalid_album" }, 400);
    }
    for (const [lang, entry, file] of [
      ["vi", vi, `gallery/${input.album}.md`],
      ["en", en, `gallery/${input.album}-en.md`],
    ] as const) {
      const frontmatter = {
        title: entry.title,
        lang,
        translationKey: input.album,
        date,
        description: entry.description,
        album: input.album,
        coverIndex: 0,
      };
      changes.push({ path: file, text: buildFile(null, frontmatter, ""), expectSha: null });
    }
  }

  try {
    const commit = await commitContent(
      GITHUB_CONTENT_TOKEN,
      `content(gallery): ${input.create ? "create" : "update"} album ${input.album}\n\nvia admin (${locals.admin?.email ?? "unknown"})`,
      changes,
    );
    return json({ commit });
  } catch (error) {
    return errorResponse(error);
  }
};
