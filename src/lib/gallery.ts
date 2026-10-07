import type { ImageMetadata } from "astro";
import type { MediaRef } from "./media";
import { galleryPhotoListSchema } from "./media-schema";

// An album's photos come from two places, merged in this order:
//  - local files under src/assets/gallery/<album>/ (build-time sharp), captions in a
//    sibling captions.json keyed by filename — loaded with import.meta.glob;
//  - R2 uploads listed in the content repo's gallery-photos/<album>.json (managed from
//    the admin), each with its own {vi, en} caption — read the same way, and validated
//    here rather than as a content collection so a repo without that folder builds
//    without warnings.
// Missing captions fail the build, and so does an album with no photos at all.

type Caption = { vi: string; en: string };
export type GalleryPhoto =
  | { kind: "local"; image: ImageMetadata; alt: Caption }
  | { kind: "media"; media: MediaRef; alt: Caption };

// Vite requires static string-literal glob patterns.
const IMAGES = import.meta.glob<ImageMetadata>(
  "/src/assets/gallery/**/*.{avif,webp,jpg,jpeg,png}",
  { eager: true, import: "default" },
);
const CAPTIONS = import.meta.glob<Record<string, Caption>>("/src/assets/gallery/**/captions.json", {
  eager: true,
  import: "default",
});
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
    const alt = captions[file];
    if (!alt?.vi || !alt?.en) {
      throw new Error(`[gallery] Missing vi/en caption for "${file}" in ${prefix}captions.json.`);
    }
    return { kind: "local", image, alt };
  });
}

/** R2 photos listed in gallery-photos/<album>.json, in file order. */
function mediaPhotos(album: string): GalleryPhoto[] {
  const file = `/src/content/gallery-photos/${album}.json`;
  if (!(file in PHOTO_LISTS)) return [];
  const parsed = galleryPhotoListSchema.safeParse(PHOTO_LISTS[file]);
  if (!parsed.success) {
    throw new Error(`[gallery] Invalid ${file}: ${parsed.error.message}`);
  }
  return parsed.data.photos.map(({ caption, ...media }) => ({
    kind: "media",
    media,
    alt: caption,
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
