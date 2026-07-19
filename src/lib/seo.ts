/** Site-wide identity + SEO helpers (docs 13). */
import type { Locale } from "../i18n/routing";

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
    image: input.image,
  };
}
