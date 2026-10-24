<script>
  import { onMount } from "svelte";
  import { THEME_PREFS, resolveTheme } from "../lib/theme";

  /**
   * Cycles the theme choice: system → light → dark (src/lib/theme.ts). CSS picks the
   * icon from <html data-theme-pref>, which the pre-paint bootstrap sets, so the right
   * one shows before this island hydrates.
   * @type {{ labels: { toggle: string, system: string, light: string, dark: string } }}
   */
  let { labels } = $props();

  /** @type {import("../lib/theme").ThemePref} */
  let pref = $state("system");

  // BaseLayout's theme-color metas, one per OS scheme. A pinned choice points both at its
  // own colour so the browser chrome matches the page; "system" restores them.
  /** @type {{ el: HTMLMetaElement, content: string, scheme: string }[]} */
  let metas = [];

  function syncThemeColor() {
    const pinned = metas.find((m) => m.scheme === pref);
    for (const m of metas) m.el.content = (pinned ?? m).content;
  }

  onMount(() => {
    const saved = document.documentElement.dataset.themePref;
    pref = THEME_PREFS.find((p) => p === saved) ?? "system";
    /** @type {NodeListOf<HTMLMetaElement>} */
    const found = document.querySelectorAll('meta[name="theme-color"][media]');
    metas = [...found].map((el) => ({
      el,
      content: el.content,
      scheme: el.media.includes("light") ? "light" : "dark",
    }));
    syncThemeColor();
  });

  function cycle() {
    pref = THEME_PREFS[(THEME_PREFS.indexOf(pref) + 1) % THEME_PREFS.length];
    const root = document.documentElement;
    root.dataset.themePref = pref;
    root.dataset.theme = resolveTheme(pref, matchMedia("(prefers-color-scheme: light)").matches);
    try {
      if (pref === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", pref);
    } catch {
      /* private mode — the choice lasts until the page is left */
    }
    syncThemeColor();
  }
</script>

<button
  type="button"
  class="theme-toggle"
  onclick={cycle}
  aria-label={`${labels.toggle}: ${labels[pref]}`}
  title={`${labels.toggle}: ${labels[pref]}`}
>
  <!-- half-filled circle: follow the OS -->
  <svg
    class="icon system"
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6" />
    <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
  </svg>
  <!-- sun -->
  <svg class="icon light" viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.6" />
    <path
      d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
    />
  </svg>
  <!-- moon -->
  <svg class="icon dark" viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
    <path
      d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linejoin="round"
    />
  </svg>
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
  .icon {
    display: none;
  }
  :global(:root:not([data-theme-pref])) .icon.system,
  :global(:root[data-theme-pref="system"]) .icon.system,
  :global(:root[data-theme-pref="light"]) .icon.light,
  :global(:root[data-theme-pref="dark"]) .icon.dark {
    display: block;
  }
</style>
