<script>
  import { onMount, tick } from "svelte";

  /**
   * @type {{
   *   labels: {
   *     trigger: string, placeholder: string, aria: string, hint: string,
   *     noResults: string, loading: string, close: string,
   *     groupBlog: string, groupStory: string, groupPage: string, countLabel: string
   *   },
   *   locale: "vi" | "en"
   * }}
   */
  let { labels, locale } = $props();

  let open = $state(false);
  let query = $state("");
  let loading = $state(false);
  let searched = $state(false);
  let selectedIndex = $state(-1);
  // Single source of truth: each item is Pagefind data + a `group` field. `sections`
  // derives from this, so section items are the SAME state proxies flat holds — that's
  // what makes `flat.indexOf(r)` work in the template (Svelte 5 proxies aren't identity-
  // equal across separate $state trees).
  let flat = $state([]);

  let dialogEl = $state(null);
  let inputEl = $state(null);
  let opener = null;

  // Pagefind is loaded lazily from the built /pagefind/ assets (absent under `astro dev`).
  let pf = null; // null → not loaded; "unavailable" → dev/missing index; else the module
  let token = 0; // guards against out-of-order async results
  let timer;

  async function ensurePagefind() {
    if (pf) return;
    try {
      // /pagefind/* is emitted by the pagefind CLI after `astro build` (absent under
      // `astro dev`). Build the URL at runtime so the bundler leaves it as a native
      // dynamic import instead of trying to resolve/bundle a non-existent module.
      const url = new URL("/pagefind/pagefind.js", location.origin).href;
      pf = await import(/* @vite-ignore */ url);
      await pf.init?.();
    } catch {
      pf = "unavailable"; // dev server or index not built — degrade gracefully
    }
  }

  const wantEn = $derived(locale === "en");
  const isEn = (url) => url.startsWith("/en/") || url === "/en";
  function groupOf(url) {
    const p = url.replace(/^\/en(?=\/|$)/, "");
    if (p.startsWith("/blog")) return "blog";
    if (p.startsWith("/truyen") || p.startsWith("/stories")) return "story";
    return "page";
  }

  const sections = $derived(
    [
      { key: "blog", label: labels.groupBlog },
      { key: "story", label: labels.groupStory },
      { key: "page", label: labels.groupPage },
    ]
      .map((s) => ({ ...s, items: flat.filter((r) => r.group === s.key) }))
      .filter((s) => s.items.length),
  );
  const countText = $derived(labels.countLabel.replace("{n}", String(flat.length)));

  function scheduleSearch() {
    clearTimeout(timer);
    timer = setTimeout(runSearch, 150);
  }

  async function runSearch() {
    const q = query.trim();
    const my = ++token;
    if (!q) {
      flat = [];
      selectedIndex = -1;
      searched = false;
      loading = false;
      return;
    }
    await ensurePagefind();
    if (my !== token) return;
    if (pf === "unavailable") {
      flat = [];
      selectedIndex = -1;
      searched = true;
      loading = false;
      return;
    }
    loading = true;
    const res = await pf.search(q);
    const items = await Promise.all(res.results.slice(0, 15).map((r) => r.data()));
    if (my !== token) return;
    const ORDER = { blog: 0, story: 1, page: 2 };
    // One ordered list (blog → story → page); the stable sort keeps Pagefind's
    // relevance order within each group. `sections` re-groups this for display.
    flat = items
      .filter((d) => isEn(d.url) === wantEn)
      .map((d) => ({ ...d, group: groupOf(d.url) }))
      .sort((a, b) => ORDER[a.group] - ORDER[b.group]);
    selectedIndex = flat.length ? 0 : -1;
    searched = true;
    loading = false;
  }

  function onInput(e) {
    query = e.currentTarget.value;
    scheduleSearch();
  }

  function reflectTriggers(v) {
    for (const b of document.querySelectorAll("[data-search-trigger]")) {
      b.setAttribute("aria-expanded", String(v));
    }
  }

  async function openModal() {
    if (open) {
      inputEl?.focus();
      return;
    }
    opener = document.activeElement;
    open = true;
    reflectTriggers(true);
    await tick();
    inputEl?.focus();
  }
  function close() {
    open = false;
    reflectTriggers(false);
    if (opener && typeof opener.focus === "function") opener.focus();
    opener = null;
  }

  function move(delta) {
    if (!flat.length) return;
    selectedIndex = (selectedIndex + delta + flat.length) % flat.length;
    tick().then(() =>
      dialogEl
        ?.querySelector(`[data-idx="${selectedIndex}"]`)
        ?.scrollIntoView({ block: "nearest" }),
    );
  }

  function onKey(e) {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      if (selectedIndex >= 0 && flat[selectedIndex]) {
        e.preventDefault();
        location.href = flat[selectedIndex].url;
      }
    } else if (e.key === "Tab") {
      const f = dialogEl?.querySelectorAll("input, a[href], button");
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
    const onOpen = () => openModal();
    const onSwap = () => {
      if (open) close();
    };
    document.addEventListener("open-search", onOpen);
    document.addEventListener("keydown", onKey);
    document.addEventListener("astro:after-swap", onSwap);
    return () => {
      document.removeEventListener("open-search", onOpen);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("astro:after-swap", onSwap);
      document.body.style.overflow = "";
    };
  });

  // Scroll-lock while open (CSSOM, not an inline style attribute → CSP-safe).
  $effect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  });
</script>

<div class="backdrop" class:open onclick={close} aria-hidden="true" role="presentation"></div>

{#if open}
  <div
    class="modal"
    id="search-modal"
    bind:this={dialogEl}
    role="dialog"
    aria-modal="true"
    aria-label={labels.aria}
  >
    <div class="search-row">
      <svg class="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.7"></circle>
        <path d="M20 20l-3.2-3.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
        ></path>
      </svg>
      <input
        bind:this={inputEl}
        type="search"
        class="field"
        value={query}
        oninput={onInput}
        placeholder={labels.placeholder}
        aria-label={labels.aria}
        aria-controls="search-results"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
      />
      <button type="button" class="close" onclick={close} aria-label={labels.close}>Esc</button>
    </div>

    <div class="results" id="search-results" role="listbox" aria-label={labels.aria}>
      {#if loading}
        <p class="state">{labels.loading}</p>
      {:else if searched && flat.length === 0}
        <p class="state">{labels.noResults}</p>
      {:else if flat.length}
        <p class="count" aria-live="polite">{countText}</p>
        {#each sections as sec (sec.key)}
          <p class="group-title">{sec.label}</p>
          <ul class="group">
            {#each sec.items as r (r.url)}
              {@const idx = flat.indexOf(r)}
              <li>
                <a
                  href={r.url}
                  class="result"
                  class:active={idx === selectedIndex}
                  data-idx={idx}
                  role="option"
                  aria-selected={idx === selectedIndex}
                  onmouseenter={() => (selectedIndex = idx)}
                >
                  <span class="r-title">{r.meta?.title ?? r.url}</span>
                  <!-- Pagefind builds this excerpt from our own indexed page text: entities are
                       escaped and only <mark> is injected, so it is safe; CSP blocks any inline
                       script/style regardless. Never apply {@html} to the title. -->
                  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                  <span class="r-excerpt">{@html r.excerpt}</span>
                </a>
              </li>
            {/each}
          </ul>
        {/each}
      {:else}
        <p class="state hint">{labels.hint}</p>
      {/if}
    </div>

    <div class="foot">{labels.hint}</div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgb(0 0 0 / 0.5);
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

  .modal {
    position: fixed;
    inset-block-start: 10vh;
    inset-inline: 0;
    z-index: 51;
    margin-inline: auto;
    inline-size: min(40rem, 92vw);
    max-block-size: 70vh;
    display: flex;
    flex-direction: column;
    background: var(--elevated);
    border: 1px solid var(--line);
    border-radius: var(--radius-modal);
    box-shadow: var(--shadow-elevated);
    overflow: hidden;
  }

  .search-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.85rem 1rem;
    border-block-end: 1px solid var(--line);
  }
  .ico {
    color: var(--muted);
    flex: none;
  }
  .field {
    flex: 1;
    min-inline-size: 0;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font-family: var(--ff-body);
    font-size: var(--text-lead);
  }
  .field::placeholder {
    color: var(--muted);
  }
  .close {
    flex: none;
    background: transparent;
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    color: var(--muted);
    padding: 0.3rem 0.55rem;
    font-family: var(--ff-mono);
    font-size: var(--text-meta);
    cursor: pointer;
  }
  .close:hover {
    color: var(--text);
    border-color: var(--accent);
  }

  .results {
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.5rem;
  }
  .count {
    margin: 0.25rem 0.5rem;
    color: var(--muted);
    font-family: var(--ff-mono);
    font-size: var(--text-meta);
  }
  .group-title {
    margin: 0.75rem 0.5rem 0.25rem;
    color: var(--muted);
    font-size: var(--text-meta);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .group {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .result {
    display: block;
    padding: 0.6rem;
    border-radius: var(--radius-control);
    border-inline-start: 2px solid transparent;
    color: var(--text);
  }
  .result.active {
    background: var(--surface);
    border-inline-start-color: var(--accent);
  }
  .r-title {
    display: block;
    font-weight: 600;
    font-size: var(--text-body);
  }
  .r-excerpt {
    display: block;
    margin-block-start: 0.15rem;
    color: var(--muted);
    font-size: var(--text-meta);
    line-height: 1.5;
  }
  .r-excerpt :global(mark) {
    background: color-mix(in srgb, var(--accent) 28%, transparent);
    color: var(--text);
    border-radius: 2px;
  }
  .state {
    padding: 1.25rem 0.75rem;
    color: var(--muted);
    text-align: center;
    font-size: var(--text-body);
  }
  .state.hint {
    font-family: var(--ff-mono);
    font-size: var(--text-meta);
  }
  .foot {
    padding: 0.6rem 1rem;
    border-block-start: 1px solid var(--line);
    color: var(--muted);
    font-family: var(--ff-mono);
    font-size: var(--text-meta);
  }
</style>
