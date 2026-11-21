// Content labels (content warnings) and age ratings: which labels exist, which of them blur
// images, and the small rules the pages, feeds, OG cards and admin share. The labels' names
// live with the other UI strings (src/i18n: `labels`), keyed by these ids.
//
// A label only informs — a banner naming it, and blurred images for the visual ones. An age
// rating additionally folds the text away until the reader says they are old enough
// (src/lib/age-gate.ts; the answer stays in their browser).

type LabelGroup = "horror" | "harm" | "society" | "other";

export const LABELS = {
  horror: { group: "horror", blur: true },
  blood: { group: "horror", blur: true },
  jumpscare: { group: "horror", blur: true },
  violence: { group: "harm", blur: true },
  "self-harm": { group: "harm", blur: true },
  death: { group: "harm", blur: true },
  politics: { group: "society", blur: false },
  religion: { group: "society", blur: false },
  "strong-language": { group: "other", blur: false },
  "flashing-lights": { group: "other", blur: false },
  spoilers: { group: "other", blur: false },
} as const satisfies Record<string, { group: LabelGroup; blur: boolean }>;

export type ContentLabel = keyof typeof LABELS;

/** Every label id, in display order — the content schema's enum and the admin's options. */
export const LABEL_IDS = Object.keys(LABELS) as [ContentLabel, ...ContentLabel[]];

export const AGE_RATINGS = ["13+", "16+", "18+"] as const;
export type AgeRating = (typeof AGE_RATINGS)[number];

const isLabel = (id: string): id is ContentLabel => Object.hasOwn(LABELS, id);

/** Whether any of these labels asks for images to be blurred. */
export function needsBlur(labels: readonly string[]): boolean {
  return labels.some((id) => isLabel(id) && LABELS[id].blur);
}

/** The age an age rating asks for (18 for "18+"), or null without one. */
export function minAge(rating: AgeRating | undefined | null): number | null {
  return rating ? Number.parseInt(rating, 10) : null;
}

/** Label names in one language, in the order given (unknown ids are skipped). */
export function labelNames(
  labels: readonly string[],
  names: Readonly<Record<ContentLabel, string>>,
): string[] {
  return labels.filter(isLabel).map((id) => names[id]);
}

/**
 * The words a feed or a link preview puts in front of a labelled item, e.g.
 * "[Cảnh báo: Kinh dị · 16+] ", or "" for an unlabelled one.
 */
export function warningPrefix(
  labels: readonly string[],
  rating: AgeRating | undefined | null,
  strings: { prefix: string; names: Readonly<Record<ContentLabel, string>> },
): string {
  const parts = [...labelNames(labels, strings.names), ...(rating ? [rating] : [])];
  return parts.length ? `[${strings.prefix}: ${parts.join(" · ")}] ` : "";
}
