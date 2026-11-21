import vi from "../../i18n/vi";
import { AGE_RATINGS, LABEL_IDS } from "../content-labels";
import { MEDIA_ID } from "../media";

// What the admin can edit: per-collection form fields and file-path rules. Shared by the
// API (validation) and the editor island (form rendering) — no server dependencies.
// Mirrors src/content.config.ts; the CI build on the publish PR is the final validator.

type FieldType =
  | "text"
  | "textarea"
  | "date"
  | "select"
  | "multiselect"
  | "tags"
  | "number"
  | "checkbox"
  | "url"
  | "media";

interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: readonly string[];
  /** How the editor names each option (defaults to the option itself). */
  optionLabels?: Readonly<Record<string, string>>;
  /** Longest text (characters). */
  max?: number;
  /** Numbers: whole numbers only, and the smallest allowed. */
  integer?: boolean;
  min?: number;
  /** Text: the whole value must match. */
  pattern?: RegExp;
  hint?: string;
}

const SLUG = "[a-z0-9][a-z0-9-]*";
export const SLUG_PATTERN = new RegExp(`^${SLUG}$`);

export type CollectionId = "blog" | "stories" | "projects" | "faq" | "gallery" | "legal" | "now";

export interface CollectionSpec {
  id: CollectionId;
  label: string;
  /** Frontmatter key shown as the entry's title in lists. */
  titleKey: string;
  /**
   * Whether "Tạo mới" may add entries. /now is one entry per language and its page
   * takes the FIRST match, so an extra file would silently replace it; legal pages are
   * a fixed set; a gallery album needs photos, so it's created from the Gallery page.
   */
  creatable: boolean;
  fields: readonly FieldSpec[];
}

const LANG: FieldSpec = {
  key: "lang",
  label: "Ngôn ngữ",
  type: "select",
  options: ["vi", "en"],
  required: true,
};
const TRANSLATION: FieldSpec = {
  key: "translationKey",
  label: "Khoá bản dịch",
  type: "text",
  hint: "Giống nhau ở bản vi và en của cùng một bài",
};
const DRAFT: FieldSpec = { key: "draft", label: "Bản nháp (ẩn khỏi site)", type: "checkbox" };
const COVER: FieldSpec = { key: "coverMedia", label: "Ảnh bìa", type: "media" };
// Content labels and age rating (src/lib/content-labels.ts): the site shows a banner, blurs
// images for the visual labels, and asks the reader's age for a rated item.
const LABELS: FieldSpec = {
  key: "contentWarning",
  label: "Nhãn nội dung",
  type: "multiselect",
  options: LABEL_IDS,
  optionLabels: vi.labels,
  hint: "Kinh dị, máu me, hù doạ, bạo lực, tự hại, cái chết: ảnh bị làm mờ. Còn lại: chỉ banner.",
};
const AGE: FieldSpec = {
  key: "ageRating",
  label: "Giới hạn tuổi",
  type: "select",
  options: AGE_RATINGS,
  hint: "Có giới hạn tuổi thì phần nội dung được ẩn tới khi người đọc xác nhận tuổi.",
};

const LONGFORM: readonly FieldSpec[] = [
  { key: "title", label: "Tiêu đề", type: "text", required: true, max: 120 },
  { key: "description", label: "Mô tả", type: "textarea", required: true, max: 200 },
  LANG,
  TRANSLATION,
  { key: "date", label: "Ngày đăng", type: "date", required: true },
  { key: "updated", label: "Cập nhật", type: "date" },
  { key: "tags", label: "Thẻ", type: "tags" },
  COVER,
  LABELS,
  AGE,
  DRAFT,
];

export const COLLECTIONS: Record<CollectionId, CollectionSpec> = {
  blog: { id: "blog", label: "Blog", titleKey: "title", creatable: true, fields: LONGFORM },
  stories: {
    id: "stories",
    label: "Truyện",
    titleKey: "title",
    creatable: true,
    fields: [
      ...LONGFORM,
      { key: "series", label: "Tên bộ truyện", type: "text" },
      { key: "chapter", label: "Chương", type: "number", integer: true, min: 1 },
      {
        key: "status",
        label: "Trạng thái",
        type: "select",
        options: ["ongoing", "complete", "dropped"],
      },
    ],
  },
  projects: {
    id: "projects",
    label: "Dự án",
    titleKey: "name",
    creatable: true,
    fields: [
      { key: "name", label: "Tên", type: "text", required: true, max: 120 },
      { key: "tagline", label: "Mô tả ngắn", type: "textarea", required: true, max: 200 },
      LANG,
      TRANSLATION,
      { key: "stack", label: "Công nghệ", type: "tags" },
      { key: "repo", label: "Repo", type: "url" },
      { key: "url", label: "Trang dự án", type: "url" },
      {
        key: "status",
        label: "Trạng thái",
        type: "select",
        options: ["active", "maintained", "archived"],
      },
      { key: "featured", label: "Nổi bật", type: "checkbox" },
      { key: "year", label: "Năm", type: "number", required: true },
      COVER,
      DRAFT,
    ],
  },
  faq: {
    id: "faq",
    label: "Hỏi đáp",
    titleKey: "q",
    creatable: true,
    fields: [
      { key: "q", label: "Câu hỏi", type: "text", required: true },
      LANG,
      {
        key: "group",
        label: "Nhóm",
        type: "select",
        options: ["channel", "dev", "personal"],
        required: true,
      },
      { key: "order", label: "Thứ tự", type: "number" },
    ],
  },
  gallery: {
    id: "gallery",
    label: "Album ảnh",
    titleKey: "title",
    creatable: false,
    fields: [
      { key: "title", label: "Tên album", type: "text", required: true, max: 120 },
      LANG,
      TRANSLATION,
      { key: "date", label: "Ngày", type: "date", required: true },
      { key: "description", label: "Mô tả", type: "textarea" },
      {
        key: "album",
        label: "Mã album",
        type: "text",
        required: true,
        pattern: SLUG_PATTERN,
        hint: "Chữ thường, số, gạch nối — album phải đã có ảnh",
      },
      { key: "coverIndex", label: "Ảnh bìa (thứ tự, từ 0)", type: "number" },
      LABELS,
      AGE,
    ],
  },
  legal: {
    id: "legal",
    label: "Pháp lý",
    titleKey: "title",
    creatable: false,
    fields: [
      { key: "title", label: "Tiêu đề", type: "text", required: true },
      { key: "order", label: "Thứ tự", type: "number" },
      { key: "effectiveDate", label: "Ngày hiệu lực", type: "text", hint: "YYYY-MM-DD" },
    ],
  },
  now: {
    id: "now",
    label: "Bây giờ",
    titleKey: "title",
    creatable: false,
    fields: [
      { key: "title", label: "Tiêu đề", type: "text", required: true },
      LANG,
      TRANSLATION,
      { key: "updated", label: "Cập nhật", type: "date", required: true },
    ],
  },
};

// Stories are stories/<series>/<chapter>.md, or stories/<slug>.md for a one-shot.
const ENTRY_PATH = new RegExp(
  `^(blog|projects|faq|gallery|legal|now)/${SLUG}\\.mdx?$|^stories/(${SLUG}/)?${SLUG}\\.mdx?$`,
);

/** The collection a content path belongs to, or null if the admin may not touch it. */
export function collectionOf(path: string): CollectionSpec | null {
  if (!ENTRY_PATH.test(path)) return null;
  return COLLECTIONS[path.split("/")[0] as CollectionId] ?? null;
}

/**
 * Path for a new entry. New files are always .md: MDX runs code at build time, so it
 * stays a hand-written, reviewed format (the publish workflow won't auto-merge it).
 */
export function newEntryPath(
  collection: CollectionId,
  slug: string,
  series?: string,
): string | null {
  if (!COLLECTIONS[collection]?.creatable || !SLUG_PATTERN.test(slug)) return null;
  if (collection === "stories" && series) {
    return SLUG_PATTERN.test(series) ? `stories/${series}/${slug}.md` : null;
  }
  // No series: a one-shot story (stories/<slug>.md), or any other collection.
  return `${collection}/${slug}.md`;
}

/** gallery-photos/<album>.json — the R2 photo list of one album. */
export function galleryPhotosPath(album: string): string | null {
  return SLUG_PATTERN.test(album) ? `gallery-photos/${album}.json` : null;
}

/**
 * `min`: a number below the field's minimum. `conflict`: the value can't coexist with another
 * key (a local `cover` next to `coverMedia`). `missing`: it names something that doesn't
 * exist (an album without photos — checked by the API, which can see the repos).
 */
type FieldErrorCode =
  "required" | "type" | "option" | "max" | "format" | "min" | "conflict" | "missing";

export interface FieldError {
  field: string;
  code: FieldErrorCode;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPositiveInteger = (value: unknown) => Number.isInteger(value) && (value as number) > 0;

/** An R2 media reference as stored in frontmatter (see lib/media-schema). */
function isMediaRef(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    MEDIA_ID.test(value.id) &&
    isPositiveInteger(value.w) &&
    isPositiveInteger(value.h) &&
    (value.alt === undefined || (typeof value.alt === "string" && value.alt.length <= 300))
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** What is wrong with one non-empty field value, or null when it fits the field. */
function checkField(field: FieldSpec, value: unknown): FieldErrorCode | null {
  switch (field.type) {
    case "text":
    case "textarea":
      if (typeof value !== "string") return "type";
      if (field.max !== undefined && value.length > field.max) return "max";
      return field.pattern && !field.pattern.test(value) ? "format" : null;
    case "url":
      if (typeof value !== "string") return "type";
      return isHttpUrl(value) ? null : "format";
    case "date":
      // Anything the content schema's z.coerce.date() accepts; the editor sends YYYY-MM-DD.
      return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? null : "format";
    case "select":
      return typeof value === "string" && (field.options ?? []).includes(value) ? null : "option";
    case "tags":
      return Array.isArray(value) && value.every((tag) => typeof tag === "string") ? null : "type";
    case "multiselect":
      if (!Array.isArray(value)) return "type";
      return value.every((item) => (field.options ?? []).includes(item)) ? null : "option";
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return "type";
      if (field.integer && !Number.isInteger(value)) return "type";
      return field.min !== undefined && value < field.min ? "min" : null;
    case "checkbox":
      return typeof value === "boolean" ? null : "type";
    case "media":
      return isMediaRef(value) ? null : "type";
  }
}

const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

/**
 * Check frontmatter against a collection's fields: required ones present, every known one
 * of the right shape. Keys the spec doesn't know (e.g. a local `cover`) are left alone —
 * the content schema on the publish PR's build is the final word on those. Shared by the
 * API and the editor, so the form flags the same problems the server would refuse.
 */
export function validateFrontmatter(
  spec: CollectionSpec,
  data: Record<string, unknown>,
): FieldError[] {
  const errors: FieldError[] = [];
  for (const field of spec.fields) {
    const value = data[field.key];
    if (isEmpty(value)) {
      if (field.required) errors.push({ field: field.key, code: "required" });
      continue;
    }
    const code = checkField(field, value);
    if (code) errors.push({ field: field.key, code });
  }
  // The content schema allows one cover: a local image (`cover`, set by hand in the repo) or
  // an R2 upload (`coverMedia`, set here) — not both.
  if (!isEmpty(data.cover) && !isEmpty(data.coverMedia)) {
    errors.push({ field: "coverMedia", code: "conflict" });
  }
  return errors;
}
