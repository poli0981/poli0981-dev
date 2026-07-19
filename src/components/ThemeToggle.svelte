<script>
  import { onMount } from "svelte";

  /** @type {{ label: string }} */
  let { label = "Toggle theme" } = $props();

  let theme = $state("dark");

  onMount(() => {
    theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    // Reflect theme if a View Transitions swap re-runs the persisted <html> attribute.
    const sync = () => {
      theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    };
    document.addEventListener("astro:after-swap", sync);
    return () => document.removeEventListener("astro:after-swap", sync);
  });

  function toggle() {
    theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* private mode — non-fatal */
    }
  }
</script>

<button
  type="button"
  class="theme-toggle"
  onclick={toggle}
  aria-label={label}
  title={label}
  aria-pressed={theme === "light"}
>
  {#if theme === "dark"}
    <!-- moon -->
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path
        d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
    </svg>
  {:else}
    <!-- sun -->
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.6" />
      <path
        d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
      />
    </svg>
  {/if}
</button>

<style>
  .theme-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 2.5rem;
    block-size: 2.5rem;
    border-radius: var(--radius-control);
    border: 1px solid transparent;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-site),
      border-color var(--duration-fast) var(--ease-site);
  }
  .theme-toggle:hover {
    background: var(--surface);
    border-color: var(--line);
  }
</style>
