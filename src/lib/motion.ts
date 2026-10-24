/**
 * Motion tokens (docs 03 §6) shared by the animated islands (Waveline, Lightbox) and CSS.
 * The islands animate with plain CSS/Web Animations — no animation library is bundled.
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
