/**
 * Theme preference. "system" (the default) follows the OS; "light" and "dark" pin a
 * palette. The choice lives in localStorage("theme") — absent means "system" — and two
 * attributes on <html> carry it: data-theme-pref (the choice) and data-theme (the
 * palette on screen, which is what CSS keys off).
 */
export type ThemePref = "system" | "light" | "dark";

/** Toggle order: system → light → dark → system. */
export const THEME_PREFS: readonly ThemePref[] = ["system", "light", "dark"];

export function resolveTheme(pref: string | undefined, prefersLight: boolean): "light" | "dark" {
  if (pref === "light" || pref === "dark") return pref;
  return prefersLight ? "light" : "dark";
}

/**
 * Runs inline in <head> before first paint; astro.config.mjs injects it and explains why
 * it has to be a string. Same rule as resolveTheme(), re-applied whenever the OS setting
 * changes so "system" keeps following it, plus the saved "hide scrollbar" preference.
 * tests/theme.test.ts runs this exact string.
 */
export const THEME_BOOTSTRAP = `(()=>{const d=document.documentElement;let p="system";try{const t=localStorage.getItem("theme");if(t==="light"||t==="dark")p=t;if(localStorage.getItem("scrollbar")==="hidden")d.dataset.scrollbar="hidden"}catch{}d.dataset.themePref=p;const m=matchMedia("(prefers-color-scheme: light)"),s=()=>{const q=d.dataset.themePref;d.dataset.theme=q==="light"||q==="dark"?q:m.matches?"light":"dark"};s();m.addEventListener("change",s)})();`;
