/** Site-wide identity + SEO helpers (docs 13). */
import { alternatePath, localeFromPath, type Locale } from "../i18n/routing";
import { sameAsUrls } from "./links";
import { DEFAULT_OG } from "./og";

export const SITE = {
  url: "https://poli0981.dev",
  name: "poli0981.dev",
  author: "Kokone (SkullMute)",
  defaultDescription: {
    vi: "Trang cá nhân của Kokone — dev, người viết, và kênh SkullMute.",
    en: "Kokone's personal site — dev, storyteller, and the SkullMute channel.",
  },
  themeColor: {
    dark: "#0d1117",
    light: "#f5efe2",
  },
} as const;

/** `<title>` text. Homepage gets the signature line; other pages are "Name — poli0981.dev". */
function pageTitle(title?: string): string {
  return title ? `${title} — ${SITE.name}` : "Kokone (SkullMute) — dev & storyteller";
}

/** Absolute canonical URL for a pathname (leading slash expected). */
function canonical(pathname: string): string {
  return new URL(pathname, SITE.url).href;
}

export interface SeoInput {
  title?: string;
  description?: string;
  locale?: Locale;
  /** Absolute or root-relative OG image URL (defaults handled at render time). */
  image?: string;
  type?: "website" | "article";
  noindex?: boolean;
}

export interface ResolvedSeo {
  title: string;
  description: string;
  canonical: string;
  locale: Locale;
  type: "website" | "article";
  noindex: boolean;
  image?: string;
}

/** Resolve raw page inputs + the current URL into the values BaseLayout renders. */
export function resolveSeo(input: SeoInput, pathname: string): ResolvedSeo {
  const locale: Locale = input.locale ?? "vi";
  return {
    title: pageTitle(input.title),
    description: input.description ?? SITE.defaultDescription[locale],
    canonical: canonical(pathname),
    locale,
    type: input.type ?? "website",
    noindex: input.noindex ?? false,
    image: input.image ?? DEFAULT_OG,
  };
}

/**
 * The vi + en URLs of a page, for hreflang. Symmetric — the same pair is produced
 * from either locale's page. Only meaningful for pages that exist in both locales
 * (BaseLayout auto-uses this; content detail pages pass an explicit pair or none).
 */
export function hreflangPair(pathname: string): { vi: string; en: string } {
  const locale = localeFromPath(pathname);
  return {
    vi: locale === "vi" ? pathname : alternatePath(pathname, "vi"),
    en: locale === "en" ? pathname : alternatePath(pathname, "en"),
  };
}

/** Site-wide Person schema (JSON-LD); `sameAs` links the owner's public profiles. */
export function personSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Kokone",
    alternateName: "SkullMute",
    url: SITE.url,
    sameAs: sameAsUrls(),
  };
}

/** Minimal Person reference for embedding as an `author` on content schemas. */
export function authorRef(): Record<string, unknown> {
  return { "@type": "Person", name: "Kokone", url: SITE.url };
}
