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
