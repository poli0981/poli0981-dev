import { variantKey, variantWidths, type MediaFormat, type MediaRef } from "../media";

// Upload → R2, run ONCE per distinct image. The id is the content hash of the uploaded
// bytes, so uploading the same file again returns the existing record without spending
// a single transformation. Outputs:
//   v1/<id>/<format>-<width>   public variants (served by /media, cached for a year)
//   private/master/<id>        full-size WebP, metadata stripped by the re-encode — kept
//                              so variants can be regenerated (a new MEDIA_VERSION)
//                              without the original, which may carry GPS EXIF
//   private/meta/<id>.json     id, size, name, alt, variants — the media library index
// Sizes always come from the transformed output (EXIF rotation applied), never the input.

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // the Images binding's input limit

const QUALITY: Record<MediaFormat, number> = { avif: 60, webp: 80 };
const MASTER_QUALITY = 92;
const YEAR = 60 * 60 * 24 * 365;

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413 | 415,
  ) {
    super(message);
  }
}

export interface MediaRecord extends Required<Pick<MediaRef, "id" | "w" | "h">> {
  alt: string;
  name: string;
  bytes: number;
  createdAt: string;
  variants: { key: string; contentType: string; bytes: number }[];
}

const metaKey = (id: string) => `private/meta/${id}.json`;

/** Raster formats we accept, by magic bytes (the client's MIME type is not trusted). */
function sniff(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (["heic", "heix", "mif1", "msf1"].includes(brand)) return "image/heic";
  }
  return null; // SVG and everything else: rejected (SVG can carry script)
}

const toStream = (bytes: Uint8Array<ArrayBuffer>) => new Blob([bytes]).stream();

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function readMediaRecord(env: Env, id: string): Promise<MediaRecord | null> {
  const object = await env.MEDIA.get(metaKey(id));
  return object ? ((await object.json()) as MediaRecord) : null;
}

export async function writeMediaRecord(env: Env, record: MediaRecord): Promise<void> {
  await env.MEDIA.put(metaKey(record.id), JSON.stringify(record), {
    httpMetadata: { contentType: "application/json" },
    // Lets the library list everything from one R2 list() call.
    customMetadata: {
      w: String(record.w),
      h: String(record.h),
      name: record.name.slice(0, 200),
      alt: record.alt.slice(0, 300),
      createdAt: record.createdAt,
    },
  });
}

export async function processUpload(
  env: Env,
  data: ArrayBuffer,
  details: { name: string; alt: string },
): Promise<{ record: MediaRecord; created: boolean }> {
  if (data.byteLength > MAX_UPLOAD_BYTES) throw new UploadError("File larger than 20 MB", 413);
  const bytes = new Uint8Array(data);
  if (!sniff(bytes))
    throw new UploadError("Not a supported image (JPEG, PNG, GIF, WebP, AVIF, HEIC)", 415);

  const id = (await sha256Hex(bytes)).slice(0, 16);
  const existing = await readMediaRecord(env, id);
  if (existing) return { record: existing, created: false };

  // Master: full size, re-encoded (drops EXIF/GPS), orientation applied.
  const masterResult = await env.IMAGES.input(toStream(bytes)).output({
    format: "image/webp",
    quality: MASTER_QUALITY,
  });
  const master = new Uint8Array(await masterResult.response().arrayBuffer());
  const info = await env.IMAGES.info(toStream(master));
  if (!("width" in info)) throw new UploadError("Could not read the image size", 400);
  await env.MEDIA.put(`private/master/${id}`, master, {
    httpMetadata: { contentType: masterResult.contentType() },
  });

  const variants: MediaRecord["variants"] = [];
  for (const format of ["avif", "webp"] as const) {
    for (const width of variantWidths(format, info.width)) {
      const result = await env.IMAGES.input(toStream(master))
        .transform({ width, fit: "scale-down" })
        .output({ format: `image/${format}`, quality: QUALITY[format] });
      const body = new Uint8Array(await result.response().arrayBuffer());
      // Cloudflare may fall back from AVIF for large images — store what we actually got.
      const contentType = result.contentType();
      const key = variantKey(id, format, width);
      await env.MEDIA.put(key, body, {
        httpMetadata: { contentType, cacheControl: `public, max-age=${YEAR}, immutable` },
      });
      variants.push({ key, contentType, bytes: body.byteLength });
    }
  }

  const record: MediaRecord = {
    id,
    w: info.width,
    h: info.height,
    alt: details.alt.trim(),
    name: details.name.slice(0, 200),
    bytes: data.byteLength,
    createdAt: new Date().toISOString(),
    variants,
  };
  await writeMediaRecord(env, record);
  return { record, created: true };
}

/** Every image in the library, newest first (one R2 list per 1,000 images). */
export async function listMedia(env: Env): Promise<Omit<MediaRecord, "variants" | "bytes">[]> {
  const items: Omit<MediaRecord, "variants" | "bytes">[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.MEDIA.list({
      prefix: "private/meta/",
      include: ["customMetadata"],
      cursor,
    });
    for (const object of page.objects) {
      const meta = object.customMetadata ?? {};
      items.push({
        id: object.key.slice("private/meta/".length, -".json".length),
        w: Number(meta.w),
        h: Number(meta.h),
        name: meta.name ?? "",
        alt: meta.alt ?? "",
        createdAt: meta.createdAt ?? object.uploaded.toISOString(),
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Delete an image everywhere: variants, master, metadata, and this colo's cache. */
export async function deleteMedia(env: Env, id: string, origin: string): Promise<void> {
  const record = await readMediaRecord(env, id);
  const keys = [...(record?.variants.map((v) => v.key) ?? []), `private/master/${id}`, metaKey(id)];
  await env.MEDIA.delete(keys);
  const cache = (caches as unknown as { default: Cache }).default;
  await Promise.all(
    (record?.variants ?? []).map((v) => cache.delete(new Request(`${origin}/media/${v.key}`))),
  );
}
