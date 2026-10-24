import type { Locale } from "../i18n/routing";

const MONTHS_EN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Deterministic, locale-aware date label (UTC-based — no Intl locale-data dependency). */
export function formatDate(date: Date, locale: Locale): string {
  const d = date.getUTCDate();
  const m = date.getUTCMonth();
  const y = date.getUTCFullYear();
  return locale === "vi" ? `${d} thg ${m + 1}, ${y}` : `${MONTHS_EN[m]} ${d}, ${y}`;
}

/** YYYY-MM-DD for <time datetime>. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Markdown body → plain text, for places that need a string rather than rendered HTML
 * (schema.org `acceptedAnswer.text`, meta descriptions).
 *
 * Deliberately a small regex pass, not a parser: the inputs are our own short FAQ
 * answers, and pulling in a markdown AST just to flatten two paragraphs is not worth
 * the dependency. It handles the constructs those answers actually use.
 */
export function plainText(markdown: string): string {
  // Every pattern is linear: bracket classes exclude the opening bracket too, so a failed
  // match can't rescan the same text from the next "[", and line-anchored patterns use
  // [ \t] rather than \s, which (under /m) could run across newlines and backtrack.
  return markdown
    .replace(/```[\s\S]*?```/g, "") // fenced code
    .replace(/!\[[^[\]]*\]\([^()]*\)/g, "") // images
    .replace(/\[([^[\]]+)\]\([^()]*\)/g, "$1") // links → their text
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "") // headings
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "") // blockquotes
    .replace(/^[ \t]*[-*+][ \t]+/gm, "") // list bullets
    .replace(/(\*\*|__|\*|_|`)/g, "") // emphasis + inline code
    .replace(/\s+/g, " ")
    .trim();
}
