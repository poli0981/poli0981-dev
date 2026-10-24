<script module>
  /** @type {import("./api").MediaItem[] | null} The library, shared by every picker on the page. */
  let cache = null;
</script>

<script>
  import { api, describeError, uploadImage } from "./api";
  import { mediaFallbackSrc } from "@/lib/media";

  /** @typedef {import("./api").MediaItem} MediaItem */
  /**
   * One image (`onpick`), or several with `multiple` (`onpickmany`, e.g. adding to an album).
   * @type {{
   *   open: boolean;
   *   multiple?: boolean;
   *   onpick?: (item: MediaItem) => void;
   *   onpickmany?: (items: MediaItem[]) => void;
   *   onclose: () => void;
   * }}
   */
  let { open, multiple = false, onpick, onpickmany, onclose } = $props();

  /** @type {MediaItem[]} */
  let items = $state([]);
  let status = $state("");
  let query = $state("");
  /** @type {string[]} */
  let selected = $state([]);
  /** @type {HTMLDialogElement | undefined} */
  let dialog = $state();

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return q
      ? items.filter((i) => i.name.toLowerCase().includes(q) || i.alt.toLowerCase().includes(q))
      : items;
  });

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      selected = [];
      dialog.showModal();
      void load();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  async function load(refresh = false) {
    if (cache && !refresh) {
      items = cache;
      status = items.length ? "" : "Thư viện trống — tải ảnh lên.";
      return;
    }
    status = "Đang tải…";
    try {
      items = cache = (await api("/api/admin/media")).items;
      status = items.length ? "" : "Thư viện trống — tải ảnh lên.";
    } catch (error) {
      status = describeError(error);
    }
  }

  async function upload(/** @type {Event} */ event) {
    const input = /** @type {HTMLInputElement} */ (event.currentTarget);
    for (const file of Array.from(input.files ?? [])) {
      status = `Đang xử lý ${file.name}…`;
      try {
        const { item } = await uploadImage(file);
        items = cache = [item, ...items.filter((i) => i.id !== item.id)];
        if (multiple && !selected.includes(item.id)) selected = [...selected, item.id];
        status = "";
      } catch (error) {
        status = `${file.name}: ${describeError(error)}`;
      }
    }
    input.value = "";
  }

  /** @param {MediaItem} item */
  function choose(item) {
    if (!multiple) {
      onpick?.(item);
      return;
    }
    selected = selected.includes(item.id)
      ? selected.filter((id) => id !== item.id)
      : [...selected, item.id];
  }

  function confirmMany() {
    onpickmany?.(selected.flatMap((id) => items.filter((i) => i.id === id)));
  }
</script>

<dialog bind:this={dialog} {onclose} aria-labelledby="picker-title">
  <div class="top">
    <strong id="picker-title">{multiple ? "Chọn ảnh (nhiều)" : "Chọn ảnh"}</strong>
    <input type="search" bind:value={query} placeholder="Tìm ảnh" aria-label="Tìm ảnh" />
    <label class="button upload"
      >Tải ảnh lên <input type="file" accept="image/*" multiple onchange={upload} /></label
    >
    <button type="button" onclick={() => load(true)} title="Tải lại danh sách">↻</button>
    <button type="button" onclick={onclose}>Đóng</button>
  </div>
  {#if status}<p class="status" role="status">{status}</p>{/if}
  <ul>
    {#each shown as item (item.id)}
      <li>
        <button
          type="button"
          onclick={() => choose(item)}
          title={item.name}
          aria-pressed={multiple ? selected.includes(item.id) : undefined}
          aria-label={item.alt || item.name || item.id}
        >
          <img src={mediaFallbackSrc(item)} alt="" width={item.w} height={item.h} loading="lazy" />
          {#if multiple && selected.includes(item.id)}
            <span class="tick" aria-hidden="true">{selected.indexOf(item.id) + 1}</span>
          {/if}
        </button>
      </li>
    {/each}
  </ul>
  {#if multiple}
    <div class="bottom">
      <button type="button" class="primary" disabled={selected.length === 0} onclick={confirmMany}>
        Thêm {selected.length || ""} ảnh
      </button>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    inline-size: min(92vw, 56rem);
    max-block-size: 85vh;
    padding: 1rem;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-modal);
    background: var(--surface);
    color: var(--text);
  }
  dialog::backdrop {
    /* ::backdrop inherits custom properties only in 2024+ engines, hence the fallback. */
    background: var(--overlay, rgb(2 6 23 / 0.66));
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .top input[type="search"] {
    flex: 1;
    min-inline-size: 10rem;
  }
  .upload {
    position: relative;
  }
  .upload input {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    opacity: 0;
  }
  .upload:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .status {
    color: var(--muted);
  }
  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
    gap: 0.5rem;
    margin: 1rem 0 0;
    padding: 0;
    list-style: none;
  }
  li button {
    position: relative;
    display: block;
    inline-size: 100%;
    padding: 0;
    border: 2px solid transparent;
    border-radius: var(--radius-control);
    background: none;
    cursor: pointer;
  }
  li button:hover,
  li button:focus-visible,
  li button[aria-pressed="true"] {
    border-color: var(--accent);
  }
  img {
    display: block;
    inline-size: 100%;
    block-size: 7rem;
    object-fit: cover;
    border-radius: calc(var(--radius-control) - 2px);
  }
  .tick {
    position: absolute;
    inset-block-start: 0.3rem;
    inset-inline-end: 0.3rem;
    display: grid;
    place-items: center;
    inline-size: 1.4rem;
    block-size: 1.4rem;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-contrast);
    font-size: var(--text-meta);
    font-weight: 700;
  }
  .bottom {
    position: sticky;
    inset-block-end: -1rem;
    display: flex;
    justify-content: flex-end;
    margin: 1rem -1rem -1rem;
    padding: 0.75rem 1rem;
    border-block-start: 1px solid var(--line);
    background: var(--surface);
  }
</style>
