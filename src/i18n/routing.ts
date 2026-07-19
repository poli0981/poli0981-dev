/**
 * The i18n routing seam. `vi` is the default locale and carries NO url prefix;
 * `en` lives under `/en/`. Path segments can differ per locale (e.g. truyen ↔ stories).
 *
 * Adding a new locale later (e.g. `ja`) = add its column to SEGMENTS + create the
 * matching `src/pages/ja/*` tree. Nothing else needs to change: LangSwitch, hreflang,
 * and every nav link resolve through the helpers below.
 */

export const LOCALES = ["vi", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "vi";

/** Logical sections → the url segment used for each locale. (The i18n seam: add a
 *  locale column here + a matching src/pages/<locale>/* tree to support a new language.) */
const SEGMENTS = {
  blog: { vi: "blog", en: "blog" },
  stories: { vi: "truyen", en: "stories" },
  projects: { vi: "projects", en: "projects" },
  gallery: { vi: "gallery", en: "gallery" },
  gaming: { vi: "gaming", en: "gaming" },
  dev: { vi: "dev", en: "dev" },
  about: { vi: "about", en: "about" },
  qa: { vi: "qa", en: "qa" },
  links: { vi: "links", en: "links" },
  legal: { vi: "legal", en: "legal" },
} as const;

export type Section = keyof typeof SEGMENTS;

/** Url prefix for a locale ("" for the default, "/en" otherwise). */
function localePrefix(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? "" : `/${locale}`;
}

/** Home path for a locale ("/" or "/en/"). */
export function homePath(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? "/" : `/${locale}/`;
}

/** Build a localized path for a section, plus optional trailing slug segments. */
export function sectionPath(section: Section, locale: Locale, ...rest: string[]): string {
  const seg = SEGMENTS[section][locale];
  const tail = rest.length ? `/${rest.join("/")}` : "";
  return `${localePrefix(locale)}/${seg}${tail}`;
}

/** Which locale a pathname belongs to (only `/en/...` is prefixed). */
export function localeFromPath(pathname: string): Locale {
  const first = pathname.split("/").filter(Boolean)[0];
  return first === "en" ? "en" : "vi";
}

/** Reverse-lookup: a url segment → its section key, for a given locale. */
function sectionFromSegment(segment: string, locale: Locale): Section | null {
  for (const key of Object.keys(SEGMENTS) as Section[]) {
    if (SEGMENTS[key][locale] === segment) return key;
  }
  return null;
}

/**
 * The counterpart of `pathname` in the target locale — handles the /en/ prefix and
 * the per-locale segment swap (truyen ↔ stories). For content pages whose slugs differ
 * across languages, pass the translationKey-resolved href explicitly instead.
 */
export function alternatePath(pathname: string, target: Locale): string {
  const current = localeFromPath(pathname);
  if (current === target) return pathname;

  let parts = pathname.split("/").filter(Boolean);
  if (current !== DEFAULT_LOCALE) parts = parts.slice(1); // drop the locale prefix

  if (parts.length === 0) return homePath(target);

  const section = sectionFromSegment(parts[0], current);
  if (section) parts[0] = SEGMENTS[section][target];

  const prefix = localePrefix(target);
  return `${prefix}/${parts.join("/")}`;
}
