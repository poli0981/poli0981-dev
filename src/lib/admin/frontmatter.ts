import { parseDocument, stringify } from "yaml";

// Frontmatter round-tripping for the admin editor. Saving must not reformat what wasn't
// edited — quotes, key order, comments, flow lists like `tags: [a, b]` all survive — so
// only keys whose value actually changed are written back into the parsed document.

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/;

export type Frontmatter = Record<string, unknown>;

/** Split a Markdown file into its parsed frontmatter and the body text. */
export function splitFile(text: string): { data: Frontmatter; body: string } {
  const match = FRONTMATTER.exec(text);
  if (!match) return { data: {}, body: text };
  const data = (parseDocument(match[1]).toJS() ?? {}) as Frontmatter;
  return { data, body: text.slice(match[0].length).replace(/^\r?\n/, "") };
}

// Frontmatter values are JSON-shaped (YAML 1.2 core schema: dates stay strings).
const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Match the hand-written files: no folding of long strings, `[a, b]` not `[ a, b ]`.
const YAML_OUT = { lineWidth: 0, flowCollectionPadding: false } as const;

const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

/**
 * Rebuild the file: `original` (null for a new file) supplies the frontmatter's existing
 * formatting; `data` is the complete new frontmatter (missing/empty keys are removed).
 */
export function buildFile(original: string | null, data: Frontmatter, body: string): string {
  const clean = Object.fromEntries(Object.entries(data).filter(([, value]) => !isEmpty(value)));
  const match = original ? FRONTMATTER.exec(original) : null;

  let yamlText: string;
  if (match) {
    const doc = parseDocument(match[1]);
    const before = (doc.toJS() ?? {}) as Frontmatter;
    for (const key of Object.keys(before)) if (!(key in clean)) doc.delete(key);
    for (const [key, value] of Object.entries(clean)) {
      if (!sameValue(before[key], value)) doc.set(key, value);
    }
    yamlText = doc.toString(YAML_OUT);
  } else {
    yamlText = stringify(clean, YAML_OUT);
  }
  const text = body.replace(/^\s*\n/, "").trimEnd();
  const head = `---\n${yamlText.trimEnd()}\n---\n`;
  return text ? `${head}\n${text}\n` : head;
}
