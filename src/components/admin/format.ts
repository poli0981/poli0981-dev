// Small display helpers for the admin islands (Vietnamese UI).

const rtf = new Intl.RelativeTimeFormat("vi", { numeric: "auto" });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 30],
  ["month", 12],
  ["year", Number.POSITIVE_INFINITY],
];

/** "3 phút trước", "hôm qua"… — "" for a missing or unreadable time. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  const then = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(then)) return "";
  let value = (then - now) / 1000;
  for (const [unit, size] of STEPS) {
    if (Math.abs(value) < size) return rtf.format(Math.round(value), unit);
    value /= size;
  }
  return "";
}

/** "10:45 24/10/2026" in the viewer's time zone. */
export function dateTime(iso: string | null | undefined): string {
  const then = iso ? new Date(iso) : null;
  if (!then || Number.isNaN(then.getTime())) return "";
  return then.toLocaleString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const shortSha = (sha: string | null | undefined): string => (sha ?? "").slice(0, 7);
