/**
 * Motion tokens (docs 03 §6) shared by GSAP islands and CSS.
 * GSAP itself is always dynamically imported inside the island that needs it —
 * never import it from here, so it stays out of shared bundles.
 */

/** Durations in seconds; CSS mirrors these as ms tokens (--duration-*). */
export const DURATION = {
  fast: 0.15,
  base: 0.25,
  slow: 0.4,
} as const;

/** True when the visitor asked for reduced motion — every island must branch on this. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
