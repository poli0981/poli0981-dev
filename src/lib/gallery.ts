import type { ImageMetadata } from "astro";
import type { ContentLabel } from "./content-labels";
import type { MediaRef } from "./media";
import { galleryPhotoListSchema, photoLabelsSchema } from "./media-schema";

// An album's photos come from two places, merged in this order:
//  - local files under src/assets/gallery/<album>/ (build-time sharp), captions in a
//    sibling captions.json keyed by filename — loaded with import.meta.glob;
//  - R2 uploads listed in the content repo's gallery-photos/<album>.json (managed from
//    the admin), each with its own {vi, en} caption — read the same way, and validated
//    here rather than as a content collection so a repo without that folder builds
//    without warnings.
// Missing captions fail the build, and so does an album with no photos at all.
// A photo may carry content labels of its own (`contentWarning` next to its caption, in
// either place); unknown labels fail the build like they do in frontmatter.

type Caption = { vi: string; en: string };
export type GalleryPhoto =
  | { kind: "local"; image: ImageMetadata; alt: Caption; labels: ContentLabel[] }
  | { kind: "media"; media: MediaRef; alt: Caption; labels: ContentLabel[] };

/** A photo's own labels, checked against the label list. */
function photoLabels(value: unknown, where: string): ContentLabel[] {
  const parsed = photoLabelsSchema.safeParse(value);
  if (!parsed.success) throw new Error(`[gallery] Invalid contentWarning in ${where}.`);
  return parsed.data ?? [];
}

// Vite requires static string-literal glob patterns.
const IMAGES = import.meta.glob<ImageMetadata>(
  "/src/assets/gallery/**/*.{avif,webp,jpg,jpeg,png}",
  { eager: true, import: "default" },
);
const CAPTIONS = import.meta.glob<Record<string, Caption & { contentWarning?: unknown }>>(
  "/src/assets/gallery/**/captions.json",
  {
    eager: true,
    import: "default",
  },
);
const PHOTO_LISTS = import.meta.glob<unknown>("/src/content/gallery-photos/*.json", {
  eager: true,
  import: "default",
});

/** Photos in the album's asset folder, filename-sorted. [] when there is no folder. */
function localPhotos(album: string): GalleryPhoto[] {
  const prefix = `/src/assets/gallery/${album}/`;
  const entries = Object.entries(IMAGES)
    .filter(([path]) => path.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  if (entries.length === 0) return [];
  const captions = CAPTIONS[`${prefix}captions.json`];
  if (!captions) {
    throw new Error(`[gallery] Missing ${prefix}captions.json for album "${album}".`);
  }
  return entries.map(([path, image]) => {
    const file = path.slice(prefix.length);
    const entry = captions[file];
    if (!entry?.vi || !entry?.en) {
      throw new Error(`[gallery] Missing vi/en caption for "${file}" in ${prefix}captions.json.`);
    }
    const labels = photoLabels(entry.contentWarning, `${prefix}captions.json ("${file}")`);
    return { kind: "local", image, alt: { vi: entry.vi, en: entry.en }, labels };
  });
}

/** Photos in the album's asset folder. coverIndex counts them first, so the admin (which
 *  only manages R2 photos) offsets a cover picked from its list by this many. */
export function localPhotoCount(album: string): number {
  const prefix = `/src/assets/gallery/${album}/`;
  return Object.keys(IMAGES).filter((path) => path.startsWith(prefix)).length;
}

/** R2 photos listed in gallery-photos/<album>.json, in file order. */
function mediaPhotos(album: string): GalleryPhoto[] {
  const file = `/src/content/gallery-photos/${album}.json`;
  if (!(file in PHOTO_LISTS)) return [];
  const parsed = galleryPhotoListSchema.safeParse(PHOTO_LISTS[file]);
  if (!parsed.success) {
    throw new Error(`[gallery] Invalid ${file}: ${parsed.error.message}`);
  }
  return parsed.data.photos.map(({ caption, contentWarning, ...media }) => ({
    kind: "media",
    media,
    alt: caption,
    labels: contentWarning ?? [],
  }));
}

/** All photos of one album (local first, then R2). Build-fails on gaps or an empty album. */
export async function getAlbumPhotos(album: string): Promise<GalleryPhoto[]> {
  const photos = [...localPhotos(album), ...mediaPhotos(album)];
  if (photos.length === 0) {
    throw new Error(
      `[gallery] Album "${album}" has no photos: add src/assets/gallery/${album}/ or gallery-photos/${album}.json in the content repo.`,
    );
  }
  return photos;
}

/** The album's cover photo (coverIndex clamped into range). */
export async function getAlbumCover(album: string, coverIndex = 0): Promise<GalleryPhoto> {
  const photos = await getAlbumPhotos(album);
  return photos[Math.min(Math.max(0, coverIndex), photos.length - 1)];
}
