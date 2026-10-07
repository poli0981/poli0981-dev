<script>
  import { onMount } from "svelte";
  import { api, describeError } from "./api";
  import MediaPicker from "./MediaPicker.svelte";
  import { SLUG_PATTERN } from "@/lib/admin/collections";
  import { mediaFallbackSrc } from "@/lib/media";

  /** @typedef {{ id: string; w: number; h: number; caption: { vi: string; en: string } }} Photo */
  /** @typedef {{ album: string; titles: Record<string, string>; photos: Photo[]; sha: string | null }} Album */

  /** @type {Album[]} */
  let albums = $state([]);
  /** @type {Album | null} */
  let current = $state(null);
  let status = $state("Đang tải…");
  let picking = $state(false);
  let saving = $state(false);

  // New album
  let creating = $state(false);
  let draft = $state({
    album: "",
    date: new Date().toISOString().slice(0, 10),
    viTitle: "",
    viDesc: "",
    enTitle: "",
    enDesc: "",
  });

  onMount(load);

  async function load() {
    try {
      albums = (await api("/api/admin/gallery")).albums;
      status = "";
    } catch (error) {
      status = describeError(error);
    }
  }

  function open(/** @type {Album} */ album) {
    creating = false;
    current = { ...album, photos: album.photos.map((p) => ({ ...p, caption: { ...p.caption } })) };
  }

  function startNew() {
    creating = true;
    current = { album: "", titles: {}, photos: [], sha: null };
  }

  /** @param {number} from @param {number} to */
  function move(from, to) {
    if (!current || to < 0 || to >= current.photos.length) return;
    const photos = [...current.photos];
    const [photo] = photos.splice(from, 1);
    photos.splice(to, 0, photo);
    current.photos = photos;
  }

  /** @param {import("./api").MediaItem} item */
  function add(item) {
    if (current && !current.photos.some((p) => p.id === item.id)) {
      current.photos = [
        ...current.photos,
        { id: item.id, w: item.w, h: item.h, caption: { vi: item.alt, en: "" } },
      ];
    }
    picking = false;
  }

  async function save() {
    if (!current) return;
    const album = creating ? draft.album.trim() : current.album;
    if (!SLUG_PATTERN.test(album)) return void (status = "Mã album: chữ thường, số, gạch nối.");
    if (current.photos.length === 0) return void (status = "Album cần ít nhất một ảnh.");
    if (current.photos.some((p) => !p.caption.vi.trim() || !p.caption.en.trim())) {
      return void (status = "Mỗi ảnh cần chú thích cả tiếng Việt và tiếng Anh.");
    }
    if (creating && (!draft.viTitle.trim() || !draft.enTitle.trim())) {
      return void (status = "Album mới cần tên tiếng Việt và tiếng Anh.");
    }
    saving = true;
    status = "Đang lưu…";
    try {
      await api("/api/admin/gallery", "PUT", {
        album,
        photos: current.photos,
        sha: current.sha,
        ...(creating
          ? {
              create: {
                date: draft.date,
                vi: { title: draft.viTitle.trim(), description: draft.viDesc.trim() || undefined },
                en: { title: draft.enTitle.trim(), description: draft.enDesc.trim() || undefined },
              },
            }
          : {}),
      });
      status = "Đã lưu vào repo nội dung — bấm “Xuất bản” để đưa lên site.";
      creating = false;
      await load();
      current = albums.find((a) => a.album === album) ?? null;
      if (current) open(current);
    } catch (error) {
      status = describeError(error);
    } finally {
      saving = false;
    }
  }
</script>

{#if status}<p class="status" aria-live="polite">{status}</p>{/if}

<div class="layout">
  <aside>
    <h2>Album</h2>
    <ul>
      {#each albums as album (album.album)}
        <li>
          <button
            type="button"
            aria-current={current?.album === album.album && !creating}
            onclick={() => open(album)}
          >
            {album.titles.vi ?? album.album}
            <span class="meta">{album.photos.length} ảnh R2</span>
          </button>
        </li>
      {/each}
    </ul>
    <button type="button" onclick={startNew}>+ Album mới</button>
    <p class="hint">
      Ảnh có sẵn trong repo (src/assets/gallery) vẫn hiển thị trước, không sửa ở đây.
    </p>
  </aside>

  {#if current}
    <section>
      {#if creating}
        <h2>Album mới</h2>
        <div class="grid">
          <label>Mã album <input bind:value={draft.album} placeholder="du-lich-2026" /></label>
          <label>Ngày <input type="date" bind:value={draft.date} /></label>
          <label>Tên (vi) <input bind:value={draft.viTitle} /></label>
          <label>Tên (en) <input bind:value={draft.enTitle} /></label>
          <label>Mô tả (vi) <input bind:value={draft.viDesc} /></label>
          <label>Mô tả (en) <input bind:value={draft.enDesc} /></label>
        </div>
      {:else}
        <h2>{current.titles.vi ?? current.album} <code>{current.album}</code></h2>
      {/if}

      <ol>
        {#each current.photos as photo, index (photo.id)}
          <li>
            <img src={mediaFallbackSrc(photo)} alt="" />
            <div class="captions">
              <input bind:value={photo.caption.vi} placeholder="Chú thích (vi)" />
              <input bind:value={photo.caption.en} placeholder="Caption (en)" />
            </div>
            <div class="order">
              <button type="button" aria-label="Lên" onclick={() => move(index, index - 1)}
                >↑</button
              >
              <button type="button" aria-label="Xuống" onclick={() => move(index, index + 1)}
                >↓</button
              >
              <button
                type="button"
                aria-label="Bỏ khỏi album"
                onclick={() =>
                  current && (current.photos = current.photos.filter((p) => p.id !== photo.id))}
                >✕</button
              >
            </div>
          </li>
        {/each}
      </ol>
      <div class="row">
        <button type="button" onclick={() => (picking = true)}>Thêm ảnh</button>
        <button type="button" class="primary" onclick={save} disabled={saving}>Lưu album</button>
      </div>
    </section>
  {/if}
</div>

<MediaPicker open={picking} onpick={add} onclose={() => (picking = false)} />

<style>
  .layout {
    display: grid;
    grid-template-columns: minmax(12rem, 16rem) 1fr;
    gap: 1.5rem;
  }
  @media (max-width: 800px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
  h2 {
    margin: 0 0 0.75rem;
    font-size: var(--text-lead);
  }
  h2 code,
  .meta,
  .hint,
  .status {
    color: var(--muted);
    font-size: var(--text-meta);
  }
  aside ul,
  ol {
    margin: 0 0 1rem;
    padding: 0;
    list-style: none;
  }
  aside li button {
    display: grid;
    inline-size: 100%;
    text-align: start;
    margin-block-end: 0.25rem;
  }
  aside [aria-current="true"] {
    border-color: var(--accent);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.75rem;
    margin-block-end: 1rem;
  }
  label {
    display: grid;
    gap: 0.25rem;
    font-size: var(--text-meta);
    color: var(--muted);
  }
  ol li {
    display: grid;
    grid-template-columns: 6rem 1fr auto;
    gap: 0.75rem;
    align-items: center;
    padding-block: 0.5rem;
    border-block-end: 1px solid var(--line);
  }
  ol img {
    inline-size: 6rem;
    block-size: 4.5rem;
    object-fit: cover;
    border-radius: var(--radius-control);
  }
  .captions {
    display: grid;
    gap: 0.35rem;
  }
  .order,
  .row {
    display: flex;
    gap: 0.35rem;
  }
  .primary {
    border-color: var(--accent) !important;
    color: var(--accent) !important;
  }
</style>
