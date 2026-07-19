import vi from "./vi";
import en from "./en";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "./routing";

const DICTS = { vi, en } as const;

/** UI strings for a locale (falls back to the default locale's dictionary). */
export function useTranslations(locale: Locale) {
  return DICTS[locale] ?? DICTS[DEFAULT_LOCALE];
}

/** Narrow an arbitrary value (e.g. Astro.currentLocale) to a supported Locale. */
export function toLocale(value: string | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? "") ? (value as Locale) : DEFAULT_LOCALE;
}
