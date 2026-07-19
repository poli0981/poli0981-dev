import type { ImageMetadata } from "astro";

// Album photos live on the filesystem under src/assets/gallery/<album>/, resolved via
// import.meta.glob (net-new — no other collection loads images this way). Per-photo alt
// text is a sibling captions.json keyed by filename; a missing key fails the build.

type Caption = { vi: string; en: string };
export type GalleryPhoto = { image: ImageMetadata; alt: Caption };

// Vite requires static string-literal glob patterns.
const IMAGES = import.meta.glob<ImageMetadata>(
  "/src/assets/gallery/**/*.{avif,webp,jpg,jpeg,png}",
  { eager: true, import: "default" },
);
const CAPTIONS = import.meta.glob<Record<string, Caption>>("/src/assets/gallery/**/captions.json", {
  eager: true,
  import: "default",
});

/** Photos in one album folder, filename-sorted, joined with captions. Build-fails on gaps. */
export function getAlbumPhotos(album: string): GalleryPhoto[] {
  const prefix = `/src/assets/gallery/${album}/`;
  const captions = CAPTIONS[`${prefix}captions.json`];
  if (!captions) {
    throw new Error(`[gallery] Missing ${prefix}captions.json for album "${album}".`);
  }
  const entries = Object.entries(IMAGES)
    .filter(([path]) => path.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  if (entries.length === 0) {
    throw new Error(`[gallery] No images found under ${prefix}`);
  }
  return entries.map(([path, image]) => {
    const file = path.slice(prefix.length);
    const alt = captions[file];
    if (!alt?.vi || !alt?.en) {
      throw new Error(`[gallery] Missing vi/en caption for "${file}" in ${prefix}captions.json.`);
    }
    return { image, alt };
  });
}

/** The album's cover image (coverIndex clamped into range). */
export function getAlbumCover(album: string, coverIndex = 0): ImageMetadata {
  const photos = getAlbumPhotos(album);
  return photos[Math.min(Math.max(0, coverIndex), photos.length - 1)].image;
}
