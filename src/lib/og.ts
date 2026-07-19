/**
 * Open Graph image URLs. Pure helpers only — the actual PNGs are rendered at build by
 * `scripts/gen-og.mjs` (Satori + resvg run in Node; a prerendered endpoint would run in
 * workerd, which has no `sharp`/`fs`). The `ogKey` logic here MUST match that script.
 */
export type OgSection = "blog" | "story" | "project";

/** Filesystem/URL-safe key for a content entry's OG image (id slashes → "__"). */
function ogKey(section: OgSection, id: string): string {
  return `${section}-${id.replace(/\//g, "__")}`;
}

/** Root-relative OG image URL for a content entry. */
export function ogUrl(section: OgSection, id: string): string {
  return `/og/${ogKey(section, id)}.png`;
}

/** Site-wide fallback OG image (used by pages that don't render a per-entry card). */
export const DEFAULT_OG = "/og/default.png";
