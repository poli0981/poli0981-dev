<script>
  import { onMount, tick } from "svelte";
  import { prefersReducedMotion } from "../lib/motion";

  /**
   * @type {{
   *   slides: { src: string, srcset: string, width: number, height: number, alt: string }[],
   *   labels: { close: string, prev: string, next: string, counter: string }
   * }}
   */
  let { slides = [], labels } = $props();

  let open = $state(false);
  let index = $state(0);
  let dialogEl = $state(null);
  let trackEl = $state(null);
  let opener = null; // element to restore focus to on close

  const current = $derived(slides[index]);
  const counter = $derived(
    labels.counter.replace("{i}", String(index + 1)).replace("{n}", String(slides.length)),
  );

  async function openAt(i) {
    if (i < 0 || i >= slides.length) return;
    opener = document.activeElement;
    index = i;
    open = true;
    await tick();
    dialogEl?.querySelector(".close")?.focus();
  }
  function close() {
    open = false;
    if (opener && typeof opener.focus === "function") opener.focus();
    opener = null;
  }
  function next() {
    if (index < slides.length - 1) index += 1;
  }
  function prev() {
    if (index > 0) index -= 1;
  }

  // --- pointer swipe (skipped under reduced motion) — offset via CSSOM var, never inline style ---
  let startX = 0;
  let dragging = false;
  function setDX(px) {
    trackEl?.style.setProperty("--dx", `${px}px`);
  }
  function onPointerDown(e) {
    if (prefersReducedMotion()) return;
    dragging = true;
    startX = e.clientX;
    trackEl?.classList.remove("animate");
  }
  function onPointerMove(e) {
    if (dragging) setDX(e.clientX - startX);
  }
  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    const dx = e.clientX - startX;
    const threshold = Math.min(80, (trackEl?.clientWidth ?? 300) * 0.15);
    trackEl?.classList.add("animate");
    setDX(0);
    if (dx <= -threshold) next();
    else if (dx >= threshold) prev();
  }

  function onKey(e) {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    } else if (e.key === "Tab") {
      // Minimal focus trap across the dialog's buttons.
      const f = dialogEl?.querySelectorAll("button");
      if (!f || !f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  onMount(() => {
    // Delegated open trigger for the static thumbnails (CSP-safe: no inline onclick).
    const onDocClick = (e) => {
      const el = e.target instanceof Element ? e.target.closest("[data-lightbox-index]") : null;
      if (el) openAt(Number(el.getAttribute("data-lightbox-index")));
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  });

  // Scroll-lock the page while the lightbox is open (same recipe as MenuSheet).
  $effect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  });
</script>

{#if open && current}
  <div class="backdrop" onclick={close} aria-hidden="true" role="presentation"></div>
  <div class="lb" bind:this={dialogEl} role="dialog" aria-modal="true" aria-label={current.alt}>
    <div class="bar">
      <span class="count" aria-live="polite">{counter}</span>
      <button type="button" class="close" onclick={close} aria-label={labels.close}>✕</button>
    </div>

    <button
      type="button"
      class="nav prev"
      onclick={prev}
      disabled={index === 0}
      aria-label={labels.prev}>‹</button
    >

    <div
      class="track"
      bind:this={trackEl}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
    >
      <img
        src={current.src}
        srcset={current.srcset}
        sizes="92vw"
        width={current.width}
        height={current.height}
        alt={current.alt}
        decoding="async"
      />
    </div>

    <button
      type="button"
      class="nav next"
      onclick={next}
      disabled={index === slides.length - 1}
      aria-label={labels.next}>›</button
    >

    <p class="caption">{current.alt}</p>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgb(0 0 0 / 0.82);
  }
  .lb {
    position: fixed;
    inset: 0;
    z-index: 51;
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-rows: auto 1fr auto;
    align-items: center;
    padding-block: env(safe-area-inset-top, 0) env(safe-area-inset-bottom, 0);
    padding-inline: 0.5rem;
  }
  .bar {
    grid-column: 1 / -1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
  }
  .count {
    color: #fff;
    font-family: var(--ff-mono);
    font-size: var(--text-meta);
  }
  .close,
  .nav {
    background: transparent;
    border: 1px solid rgb(255 255 255 / 0.3);
    border-radius: var(--radius-control);
    color: #fff;
    cursor: pointer;
    line-height: 1;
  }
  .close {
    inline-size: 2.5rem;
    block-size: 2.5rem;
  }
  .nav {
    inline-size: 3rem;
    block-size: 3rem;
    font-size: 1.75rem;
  }
  .close:hover,
  .nav:not(:disabled):hover {
    border-color: #fff;
  }
  .nav:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .track {
    grid-column: 2;
    grid-row: 2;
    display: flex;
    justify-content: center;
    align-items: center;
    max-block-size: 100%;
    touch-action: pan-y;
    transform: translateX(var(--dx, 0px));
  }
  .track.animate {
    transition: transform var(--duration-base) var(--ease-site);
  }
  .track img {
    max-inline-size: 92vw;
    max-block-size: 78dvh;
    inline-size: auto;
    block-size: auto;
    object-fit: contain;
  }
  .caption {
    grid-column: 1 / -1;
    grid-row: 3;
    text-align: center;
    color: #fff;
    padding: 0.75rem;
    font-size: var(--text-meta);
  }
  @media (prefers-reduced-motion: reduce) {
    .track,
    .track.animate {
      transition: none;
    }
  }
</style>
