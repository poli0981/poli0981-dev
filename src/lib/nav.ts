import { sectionPath, type Locale } from "../i18n/routing";
import { useTranslations } from "../i18n";

export interface NavItem {
  href: string;
  label: string;
}

/**
 * Nav definitions live here so Header, MobileTabBar, MenuSheet, and Footer stay in sync.
 * P1 scope: only pages that exist. Gaming / Dev join when their pages ship.
 */

export function primaryNav(locale: Locale): NavItem[] {
  const t = useTranslations(locale);
  return [
    { href: sectionPath("blog", locale), label: t.nav.blog },
    { href: sectionPath("stories", locale), label: t.nav.stories },
    { href: sectionPath("projects", locale), label: t.nav.projects },
    { href: sectionPath("dev", locale), label: t.nav.dev },
    { href: sectionPath("gaming", locale), label: t.nav.gaming },
    { href: sectionPath("gallery", locale), label: t.nav.gallery },
    { href: sectionPath("about", locale), label: t.nav.about },
  ];
}

/** Everything the mobile menu sheet lists (primary + secondary pages). */
export function menuNav(locale: Locale): NavItem[] {
  const t = useTranslations(locale);
  return [
    ...primaryNav(locale),
    { href: sectionPath("qa", locale), label: t.nav.qa },
    { href: sectionPath("links", locale), label: t.nav.links },
  ];
}

export function legalNav(locale: Locale): NavItem[] {
  const t = useTranslations(locale);
  return [
    { href: sectionPath("legal", locale, "terms"), label: t.legal.terms },
    { href: sectionPath("legal", locale, "privacy"), label: t.legal.privacy },
    { href: sectionPath("legal", locale, "disclaimer"), label: t.legal.disclaimer },
    { href: sectionPath("legal", locale, "third-party"), label: t.legal.thirdParty },
    { href: sectionPath("legal", locale, "licenses"), label: t.legal.licenses },
  ];
}

/** Marks a nav item active for the current path (exact or as a section prefix). */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/" || href === "/en/") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}
