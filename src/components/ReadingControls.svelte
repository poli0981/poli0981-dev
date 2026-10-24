<script>
  import { onMount } from "svelte";

  /**
   * @type {{
   *   labels: {
   *     aria: string, sizeTitle: string, themeTitle: string,
   *     sizeS: string, sizeM: string, sizeL: string,
   *     paper: string, sepia: string, dark: string
   *   }
   * }}
   */
  let { labels } = $props();

  let open = $state(false);
  let size = $state("m"); // s | m | l
  let theme = $state(""); // "" follows the site theme; else paper | sepia | dark
  let progress = $state(0);

  let barEl = $state(null);
  let panelEl = $state(null);

  function target() {
    return document.getElementById("reader-root");
  }
  function apply() {
    const root = target();
    if (!root) return;
    root.dataset.readerSize = size;
    if (theme) root.dataset.readerTheme = theme;
    else delete root.dataset.readerTheme;
  }
  function persist() {
    try {
      localStorage.setItem("reader", JSON.stringify({ size, theme }));
    } catch {
      /* private mode */
    }
  }
  function setSize(s) {
    size = s;
    apply();
    persist();
  }
  function setTheme(t) {
    theme = theme === t ? "" : t; // click active → back to following the site theme
    apply();
    persist();
  }

  function onScroll() {
    const el = document.documentElement;
    const max = el.scrollHeight - el.clientHeight;
    progress = max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0;
  }

  // Drive the progress bar through a CSS var via CSSOM (never an inline style attr → CSP-safe).
  $effect(() => {
    if (barEl) barEl.style.setProperty("--p", String(progress));
  });

  onMount(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("reader") || "{}");
      if (saved.size === "s" || saved.size === "m" || saved.size === "l") size = saved.size;
      if (saved.theme === "paper" || saved.theme === "sepia" || saved.theme === "dark")
        theme = saved.theme;
    } catch {
      /* ignore */
    }
    apply();
    onScroll();

    const onKey = (e) => {
      if (e.key === "Escape" && open) open = false;
    };
    const onDown = (e) => {
      if (open && panelEl && !panelEl.contains(e.target)) open = false;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  });
</script>

<div class="progress" bind:this={barEl} aria-hidden="true"></div>

<div class="rc" bind:this={panelEl}>
  <!-- The name starts with the visible "Aa" so voice control can target it (WCAG 2.5.3). -->
  <button
    type="button"
    class="aa"
    onclick={() => (open = !open)}
    aria-expanded={open}
    aria-controls="reading-controls"
    aria-label={`Aa — ${labels.aria}`}
  >
    Aa
  </button>

  {#if open}
    <div class="panel" id="reading-controls" role="group" aria-label={labels.aria}>
      <div class="row">
        <span class="row-title" id="rc-size">{labels.sizeTitle}</span>
        <div class="opts" role="group" aria-labelledby="rc-size">
          {#each [["s", labels.sizeS], ["m", labels.sizeM], ["l", labels.sizeL]] as [key, text] (key)}
            <button
              type="button"
              class:active={size === key}
              aria-pressed={size === key}
              onclick={() => setSize(key)}>{text}</button
            >
          {/each}
        </div>
      </div>
      <div class="row">
        <span class="row-title" id="rc-theme">{labels.themeTitle}</span>
        <div class="opts" role="group" aria-labelledby="rc-theme">
          {#each [["paper", labels.paper], ["sepia", labels.sepia], ["dark", labels.dark]] as [key, text] (key)}
            <button
              type="button"
              class:active={theme === key}
              aria-pressed={theme === key}
              onclick={() => setTheme(key)}>{text}</button
            >
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .progress {
    position: fixed;
    inset-block-start: 0;
    inset-inline: 0;
    block-size: 2px;
    z-index: 45;
    background: var(--accent);
    transform: scaleX(var(--p, 0));
    transform-origin: left;
    transition: transform 80ms linear;
  }

  .rc {
    position: relative;
  }
  .aa {
    inline-size: 2.5rem;
    block-size: 2.5rem;
    border-radius: var(--radius-control);
    border: 1px solid var(--line);
    background: transparent;
    color: var(--text);
    font-family: var(--ff-display);
    font-weight: 600;
    cursor: pointer;
  }
  .aa:hover {
    border-color: var(--accent);
  }
  .panel {
    position: absolute;
    inset-block-start: calc(100% + 0.5rem);
    inset-inline-end: 0;
    z-index: 60;
    inline-size: 15rem;
    padding: 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: var(--elevated);
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-elevated);
  }
  .row {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .row-title {
    color: var(--muted);
    font-size: var(--text-meta);
    font-family: var(--ff-mono);
  }
  .opts {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.35rem;
  }
  .opts button {
    padding: 0.45rem 0;
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-size: var(--text-meta);
  }
  .opts button.active {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
