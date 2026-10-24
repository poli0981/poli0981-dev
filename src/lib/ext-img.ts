// /ext-img — the home-page widgets' third-party pictures (YouTube thumbnails, Steam game icons)
// served from this origin, so a visitor's browser never contacts YouTube or Steam just to
// render the page: only pressing play loads anything from YouTube (youtube-nocookie.com),
// which is what the privacy policy promises. It also lets `img-src` stay 'self'.
//
// The widgets cron worker downloads each picture and stores the bytes in KV
// (`widgets:img:*`); this route only ever READS KV. No request a visitor sends can make the
// Worker fetch anything — the path just picks one of a few validated KV keys.

const DAY = 60 * 60 * 24;

/** KV key prefix shared with the cron worker (workers/widgets/src/feeds.ts). */
export const EXT_IMG_KV_PREFIX = "widgets:img:";

const PATH = /^\/ext-img\/(yt\/[\w-]{11}|steam\/\d{1,10}\/[0-9a-f]{40})$/;
const YT_THUMB = /^https:\/\/i\.ytimg\.com\/vi\/([\w-]{11})\/hqdefault\.jpg$/;
const STEAM_ICON =
  /^https:\/\/media\.steampowered\.com\/steamcommunity\/public\/images\/apps\/(\d{1,10})\/([0-9a-f]{40})\.jpg$/;

/**
 * The same-origin path for a widget image as stored by the cron worker: already a /ext-img
 * path (current feeds) or one of the two upstream URL shapes (feeds written before the
 * proxy). Anything else → null, and the widget shows no picture rather than hot-linking.
 */
export function externalImagePath(url: string): string | null {
  if (PATH.test(url)) return url;
  const yt = YT_THUMB.exec(url);
  if (yt) return `/ext-img/yt/${yt[1]}`;
  const steam = STEAM_ICON.exec(url);
  if (steam) return `/ext-img/steam/${steam[1]}/${steam[2]}`;
  return null;
}

/** The KV key holding the bytes for a /ext-img path, or null for any other path. */
export function externalImageKey(pathname: string): string | null {
  const match = PATH.exec(pathname);
  return match ? `${EXT_IMG_KV_PREFIX}${match[1].replaceAll("/", ":")}` : null;
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function serveExternalImage(
  request: Request,
  kv: KVNamespace | undefined,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const key = externalImageKey(new URL(request.url).pathname);
  if (!key || !kv) return notFound();

  // cacheTtl keeps hot pictures in this colo's KV cache instead of a central read each time.
  const { value, metadata } = await kv.getWithMetadata<{ type?: string }>(key, {
    type: "arrayBuffer",
    cacheTtl: 3600,
  });
  if (!value) return notFound();

  const headers = new Headers({
    "content-type": metadata?.type ?? "image/jpeg",
    "content-length": String(value.byteLength),
    "cache-control": `public, max-age=${DAY}`,
    // An image never needs to run anything.
    "content-security-policy": "default-src 'none'; sandbox",
  });
  return new Response(request.method === "HEAD" ? null : value, { headers });
}
