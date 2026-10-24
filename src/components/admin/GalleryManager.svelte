<script>
  import { onMount } from "svelte";
  import { api, describeError } from "./api";
  import MediaPicker from "./MediaPicker.svelte";
  import { confirmAction, toast } from "./ui";
  import { SLUG_PATTERN } from "@/lib/admin/collections";
  import { mediaFallbackSrc } from "@/lib/media";

  /** @typedef {{ id: string; w: number; h: number; caption: { vi: string; en: string } }} Photo */
  /** @typedef {{ album: string; titles: Record<string, string>; photos: Photo[]; sha: string | null; coverIndex: number; local: number }} Album */
  /** @typedef {{ album: string; titles: Record<string, string>; photos: Photo[]; sha: string | null; local: number; coverId: string | null }} Editing */

  /** @type {Album[]} */
  let albums = $state([]);
  /** @type {Editing | null} */
  let current = $state(null);
  let baseline = $state("");
  let loading = $state(true);
  let error = $state("");
  let picking = $state(false);
  let saving = $state(false);
  let creating = $state(false);
  /** @type {number | null} index being dragged */
  let dragFrom = $state(null);

  const freshDraft = () => ({
    album: "",
    date: new Date().toISOString().slice(0, 10),
    viTitle: "",
    viDesc: "",
    enTitle: "",
    enDesc: "",
  });
  let draft = $state(freshDraft());

  const dirty = $derived(
    current !== null && JSON.stringify({ current, draft: creating ? draft : null }) !== baseline,
  );

  function snapshot() {
    baseline = JSON.stringify({ current, draft: creating ? draft : null });
  }

  async function load() {
    loading = true;
    error = "";
    try {
      albums = (await api("/api/admin/gallery")).albums;
    } catch (e) {
      error = describeError(e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
    const guard = (/** @type {BeforeUnloadEvent} */ event) => {
      if (dirty) event.preventDefault();
    };
    addEventListener("beforeunload", guard);
    return () => removeEventListener("beforeunload", guard);
  });

  /** Leaving unsaved edits needs a yes. */
  async function canLeave() {
    return (
      !dirty ||
      confirmAction("Album đang có thay đổi chưa lưu. Bỏ các thay đổi đó?", {
        confirmLabel: "Bỏ thay đổi",
        danger: true,
      })
    );
  }

  /** @param {Album} album */
  async function open(album) {
    if (!(await canLeave())) return;
    creating = false;
    const coverAt = album.coverIndex - album.local;
    current = {
      album: album.album,
      titles: album.titles,
      sha: album.sha,
      local: album.local,
      photos: album.photos.map((p) => ({ ...p, caption: { ...p.caption } })),
      coverId: album.photos[coverAt]?.id ?? null,
    };
    snapshot();
  }

  async function startNew() {
    if (!(await canLeave())) return;
    creating = true;
    draft = freshDraft();
    current = { album: "", titles: {}, photos: [], sha: null, local: 0, coverId: null };
    snapshot();
  }

  /** @param {number} from @param {number} to */
  function move(from, to) {
    if (!current || to < 0 || to >= current.photos.length || from === to) return;
    const photos = [...current.photos];
    const [photo] = photos.splice(from, 1);
    photos.splice(to, 0, photo);
    current.photos = photos;
  }

  /** @param {import("./api").MediaItem[]} items */
  function add(items) {
    if (current) {
      const have = new Set(current.photos.map((p) => p.id));
      const added = items
        .filter((item) => !have.has(item.id))
        .map((item) => ({ id: item.id, w: item.w, h: item.h, caption: { vi: item.alt, en: "" } }));
      current.photos = [...current.photos, ...added];
      if (added.length < items.length) toast("Bỏ qua ảnh đã có trong album.", "info");
    }
    picking = false;
  }

  /** @param {Photo} photo */
  function removePhoto(photo) {
    if (!current) return;
    current.photos = current.photos.filter((p) => p.id !== photo.id);
    if (current.coverId === photo.id) current.coverId = null;
  }

  async function save() {
    if (!current) return;
    const album = creating ? draft.album.trim() : current.album;
    const problem = !SLUG_PATTERN.test(album)
      ? "Mã album: chữ thường, số, gạch nối."
      : current.photos.length === 0
        ? "Album cần ít nhất một ảnh."
        : current.photos.some((p) => !p.caption.vi.trim() || !p.caption.en.trim())
          ? "Mỗi ảnh cần chú thích cả tiếng Việt và tiếng Anh."
          : creating && (!draft.viTitle.trim() || !draft.enTitle.trim())
            ? "Album mới cần tên tiếng Việt và tiếng Anh."
            : "";
    if (problem) return void toast(problem, "error");

    const cover = current.photos.findIndex((p) => p.id === current?.coverId);
    saving = true;
    try {
      await api("/api/admin/gallery", "PUT", {
        album,
        photos: current.photos,
        sha: current.sha,
        ...(cover >= 0 ? { cover } : {}),
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
      toast("Đã lưu album vào repo nội dung — bấm “Xuất bản” để đưa lên site.");
      creating = false;
      await load();
      const saved = albums.find((a) => a.album === album);
      current = null;
      if (saved) await open(saved);
    } catch (e) {
      toast(describeError(e), "error");
    } finally {
      saving = false;
    }
  }

  async function removeAlbum() {
    if (!current || creating) return;
    const ok = await confirmAction(
      `Xoá album “${current.titles.vi ?? current.album}”? Trang album và danh sách ảnh R2 bị xoá; ảnh vẫn ở thư viện.`,
      { confirmLabel: "Xoá album", danger: true },
    );
    if (!ok) return;
    try {
      await api("/api/admin/gallery", "DELETE", { album: current.album });
      toast("Đã xoá album.");
      current = null;
      baseline = "";
      await load();
    } catch (e) {
      toast(describeError(e), "error");
    }
  }
</script>

<div class="page-head">
  <div>
    <h1>Gallery</h1>
    <p>Ảnh có sẵn trong repo (src/assets/gallery) vẫn đứng trước, không sửa ở đây.</p>
  </div>
</div>

<div class="layout">
  <aside class="card">
    <h2>Album</h2>
    {#if loading}
      <div class="skeleton list-skeleton" aria-busy="true" aria-label="Đang tải"></div>
    {:else if error}
      <p class="error-text">{error}</p>
      <button type="button" onclick={load}>Thử lại</button>
    {:else}
      <ul>
        {#each albums as album (album.album)}
          <li>
            <button
              type="button"
              class="album"
              aria-current={current?.album === album.album && !creating}
              onclick={() => open(album)}
            >
              <span>{album.titles.vi ?? album.album}</span>
              <span class="meta"
                >{album.photos.length} ảnh R2{album.local ? ` · ${album.local} ảnh repo` : ""}</span
              >
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    <button type="button" onclick={startNew}>+ Album mới</button>
  </aside>

  {#if current}
    <section class="card editor" aria-labelledby="album-title">
      <div class="editor-head">
        {#if creating}
          <h2 id="album-title">Album mới</h2>
        {:else}
          <h2 id="album-title">
            {current.titles.vi ?? current.album} <code>{current.album}</code>
          </h2>
        {/if}
        <span class="meta" aria-live="polite">{dirty ? "Có thay đổi chưa lưu" : ""}</span>
      </div>

      {#if creating}
        <div class="grid">
          <label>Mã album <input bind:value={draft.album} placeholder="du-lich-2026" /></label>
          <label>Ngày <input type="date" bind:value={draft.date} /></label>
          <label>Tên (vi) <input bind:value={draft.viTitle} /></label>
          <label>Tên (en) <input bind:value={draft.enTitle} /></label>
          <label>Mô tả (vi) <input bind:value={draft.viDesc} /></label>
          <label>Mô tả (en) <input bind:value={draft.enDesc} /></label>
        </div>
      {/if}

      {#if current.photos.length === 0}
        <p class="muted">Chưa có ảnh R2 nào — bấm “Thêm ảnh”.</p>
      {:else}
        <p class="meta">Kéo thả hoặc dùng ↑ ↓ để sắp xếp. Ảnh bìa được đánh dấu ★.</p>
        <ol class="photos">
          {#each current.photos as photo, index (photo.id)}
            <li
              draggable="true"
              class:dragging={dragFrom === index}
              ondragstart={(event) => {
                dragFrom = index;
                event.dataTransfer?.setData("text/plain", String(index));
              }}
              ondragover={(event) => event.preventDefault()}
              ondrop={(event) => {
                event.preventDefault();
                if (dragFrom !== null) move(dragFrom, index);
                dragFrom = null;
              }}
              ondragend={() => (dragFrom = null)}
            >
              <img src={mediaFallbackSrc(photo)} alt="" />
              <div class="captions">
                <label
                  ><span class="sr-only">Chú thích tiếng Việt, ảnh {index + 1}</span>
                  <input bind:value={photo.caption.vi} placeholder="Chú thích (vi)" /></label
                >
                <label
                  ><span class="sr-only">English caption, photo {index + 1}</span>
                  <input bind:value={photo.caption.en} placeholder="Caption (en)" /></label
                >
              </div>
              <div class="order">
                <button
                  type="button"
                  class="cover-pick"
                  aria-pressed={current.coverId === photo.id}
                  aria-label={`Đặt ảnh ${index + 1} làm ảnh bìa`}
                  onclick={() => current && (current.coverId = photo.id)}>★</button
                >
                <button
                  type="button"
                  aria-label={`Đưa ảnh ${index + 1} lên`}
                  disabled={index === 0}
                  onclick={() => move(index, index - 1)}>↑</button
                >
                <button
                  type="button"
                  aria-label={`Đưa ảnh ${index + 1} xuống`}
                  disabled={index === current.photos.length - 1}
                  onclick={() => move(index, index + 1)}>↓</button
                >
                <button
                  type="button"
                  aria-label={`Bỏ ảnh ${index + 1} khỏi album`}
                  onclick={() => removePhoto(photo)}>✕</button
                >
              </div>
            </li>
          {/each}
        </ol>
      {/if}
      {#if current.coverId === null && current.local > 0}
        <p class="meta">Ảnh bìa hiện là một ảnh trong repo.</p>
      {/if}
      <div class="row">
        <button type="button" onclick={() => (picking = true)}>Thêm ảnh</button>
        {#if !creating}
          <button type="button" class="danger" onclick={removeAlbum}>Xoá album</button>
        {/if}
        <button type="button" class="primary push" onclick={save} disabled={saving || !dirty}
          >{saving ? "Đang lưu…" : "Lưu album"}</button
        >
      </div>
    </section>
  {/if}
</div>

<MediaPicker open={picking} multiple onpickmany={add} onclose={() => (picking = false)} />

<style>
  .layout {
    display: grid;
    grid-template-columns: minmax(12rem, 16rem) 1fr;
    gap: 1.5rem;
    align-items: start;
  }
  @media (max-width: 800px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
  h2 {
    margin: 0 0 0.75rem;
    font-size: var(--text-body);
  }
  h2 code,
  .meta {
    color: var(--muted);
    font-size: var(--text-meta);
  }
  aside ul {
    display: grid;
    gap: 0.25rem;
    margin: 0 0 0.75rem;
    padding: 0;
    list-style: none;
  }
  .album {
    display: grid;
    justify-items: start;
    inline-size: 100%;
    text-align: start;
    border-color: transparent;
    background: transparent;
  }
  .album[aria-current="true"] {
    border-color: var(--accent);
    background: var(--elevated);
  }
  .list-skeleton {
    block-size: 8rem;
    margin-block-end: 0.75rem;
  }
  .editor-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.75rem;
    margin-block-end: 1rem;
  }
  .grid label {
    display: grid;
    gap: 0.25rem;
    color: var(--muted);
    font-size: var(--text-meta);
  }
  .photos {
    display: grid;
    gap: 0.6rem;
    margin: 0.75rem 0 1rem;
    padding: 0;
    list-style: none;
  }
  .photos li {
    display: grid;
    grid-template-columns: 6rem 1fr auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.4rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    background: var(--bg);
    cursor: grab;
  }
  .photos li.dragging {
    opacity: 0.5;
  }
  .photos img {
    inline-size: 6rem;
    block-size: 4.5rem;
    object-fit: cover;
    border-radius: var(--radius-control);
  }
  .captions {
    display: grid;
    gap: 0.35rem;
  }
  .order {
    display: flex;
    gap: 0.25rem;
  }
  .order button {
    padding: 0.3rem 0.5rem;
  }
  .cover-pick[aria-pressed="true"] {
    border-color: var(--warn);
    color: var(--warn);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .push {
    margin-inline-start: auto;
  }
  @media (max-width: 600px) {
    .photos li {
      grid-template-columns: 4.5rem 1fr;
    }
    .order {
      grid-column: 1 / -1;
      justify-content: flex-end;
    }
  }
</style>
