<script module>
  // Unique gradient id per instance (same increment order on SSR + hydrate).
  let uidCounter = 0;
</script>

<script>
  import { onMount } from "svelte";
  import { DURATION, prefersReducedMotion } from "../lib/motion";

  // Easing to match the site ease (~cubic-bezier(0.22,1,0.36,1)) without a library.
  const easeOut = (t) => 1 - Math.pow(1 - t, 4);
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  /**
   * The site signature: a muted sound-wave. Idle = flatline; on hover or first
   * scroll-into-view it "comes alive" into a waveform for ~1.2s, then settles flat.
   * One beat, never a loop. Static flatline under prefers-reduced-motion.
   */
  let { height = 40, beats = 6, coordWidth = 320, class: className = "" } = $props();

  const mid = height / 2;
  const peak = height * 0.34;
  const N = 96;
  const uid = `wl-grad-${uidCounter++}`;

  let svgEl;
  let pathEl;

  const flat = `M0 ${mid} L${coordWidth} ${mid}`;

  function buildPath(amp) {
    let d = `M0 ${mid}`;
    for (let i = 1; i <= N; i++) {
      const x = (i / N) * coordWidth;
      const envelope = Math.sin((i / N) * Math.PI); // 0 at the ends → flat edges
      const y = mid + Math.sin((i / N) * beats * Math.PI * 2) * amp * envelope;
      d += ` L${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return d;
  }

  onMount(() => {
    if (prefersReducedMotion()) return; // stays a flat line

    let playing = false;
    // One 1.2s beat: amplitude rises (easeOut), then settles back to flat (easeInOut).
    const total = DURATION.slow * 1000 * 3; // ~1200ms
    const play = () => {
      if (playing) return;
      playing = true;
      let startTs = 0;
      const step = (now) => {
        if (!startTs) startTs = now;
        const t = Math.min(1, (now - startTs) / total);
        const amp = t < 0.5 ? peak * easeOut(t / 0.5) : peak * (1 - easeInOut((t - 0.5) / 0.5));
        pathEl.setAttribute("d", buildPath(amp));
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          pathEl.setAttribute("d", flat);
          playing = false;
        }
      };
      requestAnimationFrame(step);
    };

    svgEl.addEventListener("pointerenter", play);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            play();
            io.disconnect();
          }
        }
      },
      { threshold: 0.6 },
    );
    io.observe(svgEl);

    return () => {
      io.disconnect();
      svgEl.removeEventListener("pointerenter", play);
    };
  });
</script>

<svg
  bind:this={svgEl}
  class={className}
  viewBox={`0 0 ${coordWidth} ${height}`}
  preserveAspectRatio="none"
  role="presentation"
  aria-hidden="true"
>
  <defs>
    <linearGradient id={uid} x1="0" y1="0" x2="1" y2="0">
      <stop class="s-line" offset="0%" />
      <stop class="s-line" offset="36%" />
      <stop class="s-accent" offset="50%" />
      <stop class="s-line" offset="64%" />
      <stop class="s-line" offset="100%" />
    </linearGradient>
  </defs>
  <path
    bind:this={pathEl}
    d={flat}
    fill="none"
    stroke={`url(#${uid})`}
    stroke-width="1.5"
    stroke-linecap="round"
    vector-effect="non-scaling-stroke"
  />
</svg>

<style>
  svg {
    display: block;
    inline-size: 100%;
    block-size: auto;
    overflow: visible;
  }
  /* stop-color via CSS so the theme vars resolve (presentation attrs don't parse var()). */
  .s-line {
    stop-color: var(--line);
  }
  .s-accent {
    stop-color: var(--accent);
  }
</style>
