<script>
  import { onMount } from "svelte";

  /** @type {{ label: string }} */
  let { label = "Hide scrollbar" } = $props();

  let hidden = $state(false);

  onMount(() => {
    hidden = document.documentElement.dataset.scrollbar === "hidden";
  });

  function toggle() {
    hidden = !hidden;
    const root = document.documentElement;
    if (hidden) root.dataset.scrollbar = "hidden";
    else delete root.dataset.scrollbar;
    try {
      if (hidden) localStorage.setItem("scrollbar", "hidden");
      else localStorage.removeItem("scrollbar");
    } catch {
      /* private mode — the choice just won't survive a reload */
    }
  }
</script>

<!-- A switch, not a button with a changing label: the name stays "Hide scrollbar" and
     aria-checked carries the state (WAI-ARIA switch pattern). -->
<button type="button" class="sb-switch" role="switch" aria-checked={hidden} onclick={toggle}>
  <span class="track" aria-hidden="true"><span class="knob"></span></span>
  {label}
</button>

<style>
  .sb-switch {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: var(--text-meta);
    cursor: pointer;
  }
  .sb-switch:hover {
    color: var(--accent);
  }
  .track {
    position: relative;
    inline-size: 1.9rem;
    block-size: 1.05rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    transition: background var(--duration-fast) var(--ease-site);
  }
  .knob {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 0.15rem;
    inline-size: 0.7rem;
    block-size: 0.7rem;
    border-radius: 50%;
    background: var(--muted);
    translate: 0 -50%;
    transition:
      translate var(--duration-fast) var(--ease-site),
      background var(--duration-fast) var(--ease-site);
  }
  .sb-switch[aria-checked="true"] .track {
    background: color-mix(in oklab, var(--accent) 25%, var(--surface));
    border-color: var(--accent);
  }
  .sb-switch[aria-checked="true"] .knob {
    background: var(--accent);
    translate: 0.775rem -50%;
  }
</style>
