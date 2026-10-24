<script>
  import { onMount, tick } from "svelte";

  /** @type {{ items: {href: string, label: string}[], legal: {href: string, label: string}[], title: string, closeLabel: string, legalTitle: string }} */
  let {
    items = [],
    legal = [],
    title = "Menu",
    closeLabel = "Close",
    legalTitle = "Legal",
  } = $props();

  let open = $state(false);
  let sheetEl = $state(null);
  /** @type {HTMLElement | null} where focus returns when the sheet closes */
  let opener = null;

  function reflectTriggers(v) {
    for (const b of document.querySelectorAll("[data-menu-trigger]")) {
      b.setAttribute("aria-expanded", String(v));
    }
  }

  // The trigger that opened the sheet. Safari does not focus a clicked button, so fall back
  // to whichever menu trigger is on screen.
  function findOpener() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) return active;
    return [...document.querySelectorAll("[data-menu-trigger]")].find(
      (b) => b instanceof HTMLElement && b.offsetParent !== null,
    );
  }

  async function openMenu() {
    opener = findOpener() ?? null;
    open = true;
    reflectTriggers(true);
    await tick();
    sheetEl?.querySelector("a, button")?.focus();
  }
  function closeMenu() {
    open = false;
    reflectTriggers(false);
    opener?.focus();
    opener = null;
  }

  // Keep Tab inside the open sheet (it is modal: the page behind is scroll-locked).
  function trapFocus(e) {
    const focusable = sheetEl?.querySelectorAll("a[href], button:not(:disabled)");
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  function toggle() {
    if (open) closeMenu();
    else openMenu();
  }

  onMount(() => {
    const onToggle = () => toggle();
    const onKey = (e) => {
      if (!open) return;
      if (e.key === "Escape") closeMenu();
      else if (e.key === "Tab") trapFocus(e);
    };
    document.addEventListener("toggle-menu", onToggle);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("toggle-menu", onToggle);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  });

  // Scroll-lock the page while the sheet is open.
  $effect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  });
</script>

<div class="backdrop" class:open onclick={closeMenu} aria-hidden="true" role="presentation"></div>

<div
  bind:this={sheetEl}
  id="menu-sheet"
  class="sheet"
  class:open
  role="dialog"
  aria-modal="true"
  aria-labelledby="menu-sheet-title"
  inert={!open}
>
  <div class="sheet-head">
    <h2 id="menu-sheet-title" class="sheet-title">{title}</h2>
    <button type="button" class="close" onclick={closeMenu}>{closeLabel}</button>
  </div>

  <nav aria-labelledby="menu-sheet-title">
    <ul class="links">
      {#each items as item (item.href)}
        <li><a href={item.href} onclick={closeMenu}>{item.label}</a></li>
      {/each}
    </ul>
  </nav>

  {#if legal.length}
    <nav aria-labelledby="menu-sheet-legal">
      <p id="menu-sheet-legal" class="group-title">{legalTitle}</p>
      <ul class="links legal">
        {#each legal as item (item.href)}
          <li><a href={item.href} onclick={closeMenu}>{item.label}</a></li>
        {/each}
      </ul>
    </nav>
  {/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: var(--overlay);
    opacity: 0;
    visibility: hidden;
    transition:
      opacity var(--duration-base) var(--ease-site),
      visibility var(--duration-base) var(--ease-site);
  }
  .backdrop.open {
    opacity: 1;
    visibility: visible;
  }

  .sheet {
    position: fixed;
    inset-block: 0;
    inset-inline-end: 0;
    z-index: 51;
    inline-size: min(20rem, 82vw);
    padding: 1.25rem;
    padding-block-end: calc(1.25rem + env(safe-area-inset-bottom, 0));
    background: var(--elevated);
    border-inline-start: 1px solid var(--line);
    box-shadow: var(--shadow-elevated);
    transform: translateX(100%);
    transition: transform var(--duration-base) var(--ease-site);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .sheet.open {
    transform: translateX(0);
  }

  .sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-block-end: 1rem;
  }
  .sheet-title {
    margin: 0;
    font-family: var(--ff-display);
    font-weight: 700;
    font-size: var(--text-lead);
  }
  .close {
    background: transparent;
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    color: var(--muted);
    padding: 0.4rem 0.75rem;
    font-size: var(--text-meta);
    cursor: pointer;
  }
  .close:hover {
    color: var(--text);
  }

  .links {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .links a {
    display: block;
    padding: 0.7rem 0.5rem;
    color: var(--text);
    font-size: var(--text-lead);
    border-radius: var(--radius-control);
  }
  .links a:hover {
    background: var(--surface);
    color: var(--accent);
  }
  .group-title {
    margin: 1.25rem 0 0.25rem;
    color: var(--muted);
    font-size: var(--text-meta);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .links.legal a {
    font-size: var(--text-body);
    color: var(--muted);
  }
  .links.legal a:hover {
    color: var(--text);
  }
</style>
