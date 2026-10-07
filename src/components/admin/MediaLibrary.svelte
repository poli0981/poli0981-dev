<script>
  import { onMount } from "svelte";
  import { api, ApiError, describeError, uploadImage } from "./api";
  import { mediaFallbackSrc, mediaPictureHtml } from "@/lib/media";

  /** @typedef {import("./api").MediaItem} MediaItem */
  /** @type {MediaItem[]} */
  let items = $state([]);
  let status = $state("Đang tải…");
  let dragging = $state(false);

  onMount(async () => {
    try {
      items = (await api("/api/admin/media")).items;
      status = items.length ? "" : "Chưa có ảnh nào.";
    } catch (error) {
      status = describeError(error);
    }
  });

  /** @param {File[]} files */
  async function upload(files) {
    for (const [index, file] of files.entries()) {
      status = `Đang xử lý ${index + 1}/${files.length}: ${file.name} (nén AVIF/WebP, lưu R2)…`;
      try {
        const { item, created } = await uploadImage(file);
        items = [item, ...items.filter((i) => i.id !== item.id)];
        status = created ? "" : `${file.name}: ảnh này đã có trong thư viện (không xử lý lại).`;
      } catch (error) {
        status = `${file.name}: ${describeError(error)}`;
      }
    }
  }

  /** @param {MediaItem} item @param {string} alt */
  async function saveAlt(item, alt) {
    if (alt === item.alt) return;
    try {
      await api("/api/admin/media", "PATCH", { id: item.id, alt });
      item.alt = alt;
      status = "Đã lưu mô tả ảnh.";
    } catch (error) {
      status = describeError(error);
    }
  }

  /** @param {MediaItem} item */
  async function remove(item) {
    if (!confirm(`Xoá ảnh ${item.name || item.id}? Không khôi phục được.`)) return;
    try {
      await api("/api/admin/media", "DELETE", { id: item.id });
      items = items.filter((i) => i.id !== item.id);
      status = "Đã xoá.";
    } catch (error) {
      status =
        error instanceof ApiError && error.data.error === "in_use"
          ? `Ảnh đang được dùng trong: ${/** @type {string[]} */ (error.data.usedIn).join(", ")}`
          : describeError(error);
    }
  }

  /** @param {string} text */
  async function copy(text) {
    await navigator.clipboard.writeText(text);
    status = "Đã copy.";
  }
</script>

<div
  class="drop"
  class:dragging
  role="region"
  aria-label="Kéo thả ảnh vào đây"
  ondragover={(event) => {
    event.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={(event) => {
    event.preventDefault();
    dragging = false;
    void upload(Array.from(event.dataTransfer?.files ?? []));
  }}
>
  <p>Kéo thả ảnh vào đây, hoặc</p>
  <label class="pick"
    >chọn tệp
    <input
      type="file"
      accept="image/*"
      multiple
      onchange={(event) => {
        void upload(Array.from(event.currentTarget.files ?? []));
        event.currentTarget.value = "";
      }}
    />
  </label>
  <p class="hint">
    JPEG/PNG/WebP/AVIF/HEIC/GIF ≤ 20 MB. Mỗi ảnh được nén một lần thành AVIF 480/800/1200 + WebP
    800/1600, bỏ EXIF/GPS.
  </p>
</div>

{#if status}<p class="status" aria-live="polite">{status}</p>{/if}

<ul>
  {#each items as item (item.id)}
    <li>
      <img
        src={mediaFallbackSrc(item)}
        alt={item.alt}
        width={item.w}
        height={item.h}
        loading="lazy"
      />
      <div class="info">
        <span class="name" title={item.name}>{item.name || item.id}</span>
        <span class="meta">{item.w}×{item.h} · {item.id}</span>
        <input
          value={item.alt}
          placeholder="Mô tả ảnh (alt)"
          onchange={(event) => saveAlt(item, event.currentTarget.value)}
        />
        <div class="row">
          <button type="button" onclick={() => copy(mediaPictureHtml(item, item.alt))}
            >Copy HTML</button
          >
          <button
            type="button"
            onclick={() => copy(`{ id: "${item.id}", w: ${item.w}, h: ${item.h} }`)}>Copy ID</button
          >
          <button type="button" class="danger" onclick={() => remove(item)}>Xoá</button>
        </div>
      </div>
    </li>
  {/each}
</ul>

<style>
  .drop {
    padding: 1.5rem;
    border: 2px dashed var(--line);
    border-radius: var(--radius-card);
    text-align: center;
  }
  .drop.dragging {
    border-color: var(--accent);
  }
  .drop p {
    margin: 0.25rem 0;
  }
  .pick input {
    display: block;
    margin: 0.5rem auto 0;
  }
  .hint,
  .meta,
  .status {
    color: var(--muted);
    font-size: var(--text-meta);
  }
  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 1rem;
    margin: 1.5rem 0 0;
    padding: 0;
    list-style: none;
  }
  li {
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    overflow: hidden;
    background: var(--surface);
  }
  img {
    display: block;
    inline-size: 100%;
    block-size: 10rem;
    object-fit: cover;
  }
  .info {
    display: grid;
    gap: 0.4rem;
    padding: 0.75rem;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .danger {
    border-color: var(--err) !important;
    color: var(--err) !important;
  }
</style>
