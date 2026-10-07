<script>
  import { api, describeError, uploadImage } from "./api";
  import { mediaFallbackSrc } from "@/lib/media";

  /** @typedef {import("./api").MediaItem} MediaItem */
  /** @type {{ open: boolean; onpick: (item: MediaItem) => void; onclose: () => void }} */
  let { open, onpick, onclose } = $props();

  /** @type {MediaItem[]} */
  let items = $state([]);
  let status = $state("");
  /** @type {HTMLDialogElement | undefined} */
  let dialog = $state();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      void load();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  async function load() {
    status = "Đang tải…";
    try {
      items = (await api("/api/admin/media")).items;
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
        items = [item, ...items.filter((i) => i.id !== item.id)];
        status = "";
      } catch (error) {
        status = `${file.name}: ${describeError(error)}`;
      }
    }
    input.value = "";
  }
</script>

<dialog bind:this={dialog} {onclose} aria-label="Chọn ảnh">
  <div class="top">
    <strong>Chọn ảnh</strong>
    <label class="upload"
      >Tải ảnh lên <input type="file" accept="image/*" multiple onchange={upload} /></label
    >
    <button type="button" onclick={onclose}>Đóng</button>
  </div>
  {#if status}<p class="status">{status}</p>{/if}
  <ul>
    {#each items as item (item.id)}
      <li>
        <button type="button" onclick={() => onpick(item)} title={item.name}>
          <img
            src={mediaFallbackSrc(item)}
            alt={item.alt}
            width={item.w}
            height={item.h}
            loading="lazy"
          />
        </button>
      </li>
    {/each}
  </ul>
</dialog>

<style>
  dialog {
    inline-size: min(92vw, 56rem);
    max-block-size: 85vh;
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-modal);
    background: var(--surface);
    color: var(--text);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.6);
  }
  .top {
    display: flex;
    align-items: center;
    gap: 1rem;
    justify-content: space-between;
  }
  .upload input {
    display: block;
    font-size: var(--text-meta);
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
    display: block;
    inline-size: 100%;
    padding: 0;
    border: 2px solid transparent;
    border-radius: var(--radius-control);
    background: none;
    cursor: pointer;
  }
  li button:hover,
  li button:focus-visible {
    border-color: var(--accent);
  }
  img {
    display: block;
    inline-size: 100%;
    block-size: 7rem;
    object-fit: cover;
    border-radius: calc(var(--radius-control) - 2px);
  }
</style>
