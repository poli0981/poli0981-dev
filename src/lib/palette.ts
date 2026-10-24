/**
 * The site palette, "Glacier Teal". src/styles/global.css carries the same values as
 * custom properties (that is what pages use); this copy serves code that needs a colour
 * outside CSS: the theme-color meta (seo.ts), the OG images (scripts/gen-og.mjs) and the
 * console easter egg. tests/palette.test.ts fails if the two drift apart or if a text or
 * control colour drops below WCAG AA on the surfaces it sits on.
 *
 * Keys map to custom properties in kebab case: `lineStrong` → `--line-strong`.
 */
export const PALETTE = {
  dark: {
    bg: "#0b1220",
    surface: "#0f192a",
    elevated: "#16233a",
    /** Dividers and card edges (decorative). */
    line: "#223047",
    /** Edges that identify a control (inputs, toggles): ≥ 3:1 on every surface. */
    lineStrong: "#5b6f8f",
    text: "#e6edf5",
    muted: "#94a3b8",
    accent: "#2dd4bf",
    accentStrong: "#5eead4",
    /** Text on an accent fill (selection, primary buttons). */
    accentContrast: "#042f2e",
    horror: "#fb7185",
    ok: "#34d399",
    warn: "#fbbf24",
    err: "#f87171",
    /** Modal backdrop. */
    overlay: "rgb(2 6 23 / 0.66)",
    shadowColor: "rgb(0 0 0 / 0.45)",
  },
  light: {
    bg: "#f4f8fb",
    surface: "#ffffff",
    elevated: "#ffffff",
    line: "#d6e0ea",
    lineStrong: "#7c8ca3",
    text: "#0f1b2d",
    muted: "#4a5a70",
    accent: "#0f766e",
    accentStrong: "#115e59",
    accentContrast: "#ffffff",
    horror: "#be123c",
    ok: "#047857",
    warn: "#b45309",
    err: "#b91c1c",
    overlay: "rgb(15 27 45 / 0.42)",
    shadowColor: "rgb(15 27 45 / 0.14)",
  },
} as const;

export type Theme = keyof typeof PALETTE;
