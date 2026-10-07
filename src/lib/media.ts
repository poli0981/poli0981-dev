// Media stored in R2 and served from /media (src/lib/media/serve.ts). Shared by the
// server, Astro components and the admin UI — no runtime dependencies.
//
// Every upload is transformed ONCE (src/lib/media/process.ts) into a fixed, deterministic
// set of variants, so anything that knows an image's id and source size can build its
// URLs and srcsets without a lookup:
//   AVIF  480 / 800 / 1200 w — Cloudflare's AVIF encoder tops out at 1,200 px
//   WebP  800 / 1600 w       — fallback for browsers without AVIF, and large displays
// Widths are capped at the source width (no upscaling).

export const MEDIA_VERSION = "v1";
export type MediaFormat = "avif" | "webp";

const MEDIA_WIDTHS: Record<MediaFormat, readonly number[]> = {
  avif: [480, 800, 1200],
  webp: [800, 1600],
};

/** What content stores to reference an image: the id plus the master's size. */
export interface MediaRef {
  id: string;
  w: number;
  h: number;
  alt?: string;
}

/** 16 lowercase hex chars: the first 64 bits of the original's SHA-256. */
export const MEDIA_ID = /^[0-9a-f]{16}$/;

/** The widths generated for `format` from a source `width` px wide, ascending. */
export function variantWidths(format: MediaFormat, width: number): number[] {
  const targets = MEDIA_WIDTHS[format];
  const largest = Math.min(width, targets[targets.length - 1]);
  return [...new Set([...targets.filter((w) => w < largest), largest])].sort((a, b) => a - b);
}

/** R2 key of one public variant; the URL path is the same key under /media/. */
export function variantKey(id: string, format: MediaFormat, width: number): string {
  return `${MEDIA_VERSION}/${id}/${format}-${width}`;
}

export function mediaUrl(id: string, format: MediaFormat, width: number): string {
  return `/media/${variantKey(id, format, width)}`;
}

export function mediaSrcset(media: MediaRef, format: MediaFormat): string {
  return variantWidths(format, media.w)
    .map((w) => `${mediaUrl(media.id, format, w)} ${w}w`)
    .join(", ");
}

/** The `<img src>` fallback: the WebP closest to 800 px (or the only one). */
export function mediaFallbackSrc(media: MediaRef): string {
  const widths = variantWidths("webp", media.w);
  return mediaUrl(media.id, "webp", widths[0]);
}

const escapeAttr = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The same <picture> as MediaImage.astro, as HTML to paste into Markdown/MDX (raw HTML is
 * valid in both). width/height keep the layout stable; AVIF first, WebP for the rest.
 */
export function mediaPictureHtml(
  media: MediaRef,
  alt: string,
  sizes = "(max-width: 768px) 100vw, 720px",
): string {
  return [
    "<picture>",
    `  <source type="image/avif" srcset="${mediaSrcset(media, "avif")}" sizes="${sizes}" />`,
    `  <img src="${mediaFallbackSrc(media)}" srcset="${mediaSrcset(media, "webp")}" sizes="${sizes}" width="${media.w}" height="${media.h}" alt="${escapeAttr(alt)}" loading="lazy" decoding="async" />`,
    "</picture>",
  ].join("\n");
}
