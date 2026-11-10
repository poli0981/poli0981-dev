/**
 * Legal documents are bilingual within one file — `## English`, then `## Tiếng Việt` — and
 * both locale routes render the whole document. Without a `lang` on the half that is not
 * in the page's language, a screen reader reads it with the wrong voice (WCAG 3.1.2).
 *
 * This wraps each half of the rendered HTML in a container carrying its language. A
 * section under any other `<h2>` (the "Models" and "Components" tables) is left alone and
 * keeps the page's language. The container is styled `display: contents` (prose.css).
 */
const HALVES: Record<string, string> = { English: "en", "Tiếng Việt": "vi" };

export function markLanguageHalves(html: string): string {
  return html
    .split(/(?=<h2[\s>])/)
    .map((section) => {
      const heading = /^<h2[^>]*>([^<]*)<\/h2>/.exec(section)?.[1].trim();
      const lang = heading === undefined ? undefined : HALVES[heading];
      return lang ? `<div lang="${lang}">${section}</div>` : section;
    })
    .join("");
}
