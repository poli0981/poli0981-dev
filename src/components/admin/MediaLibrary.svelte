<script>
  import { onMount } from "svelte";
  import { api, ApiError, describeError, uploadImage } from "./api";
  import { confirmAction, toast } from "./ui";
  import { mediaFallbackSrc, mediaPictureHtml } from "@/lib/media";

  /** @typedef {import("./api").MediaItem} MediaItem */
  /** @typedef {{ id: number; name: string; state: "waiting" | "uploading" | "done" | "duplicate" | "error"; message: string }} Job */

  /** Uploads in flight at once: each one is a full Images-binding transform on the server. */
  const PARALLEL = 3;

  /** @type {MediaItem[]} */
  let items = $state([]);
  /** @type {Record<string, string[]>} */
  let usage = $state({});
  let loading = $state(true);
  let error = $state("");
  let dragging = $state(false);
  let query = $state("");
  let unusedOnly = $state(false);
  /** @type {Job[]} */
  let jobs = $state([]);
  let jobSeq = 0;

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        (!unusedOnly || (usage[item.id] ?? []).length === 0) &&
        (!q ||
          item.name.toLowerCase().includes(q) ||
          item.alt.toLowerCase().includes(q) ||
          item.id.includes(q)),
    );
  });
  const active = $derived(jobs.filter((j) => j.state === "waiting" || j.state === "uploading"));

  async function load() {
    loading = true;
    error = "";
    try {
      ({ items, usage } = await api("/api/admin/media?usage"));
    } catch (e) {
      error = describeError(e);
    } finally {
      loading = false;
    }
  }

  onMount(load);

  /** @param {File[]} files */
  async function upload(files) {
    if (files.length === 0) return;
    const fresh = files.map((file) => ({
      id: (jobSeq += 1),
      name: file.name,
      state: /** @type {Job["state"]} */ ("waiting"),
      message: "",
    }));
    jobs = [...fresh, ...jobs.filter((j) => j.state !== "done" && j.state !== "duplicate")];
    const tracked = jobs.slice(0, fresh.length); // the reactive copies
    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const index = next++;
        const job = tracked[index];
        job.state = "uploading";
        try {
          const { item, created } = await uploadImage(files[index]);
          items = [item, ...items.filter((i) => i.id !== item.id)];
          usage[item.id] ??= [];
          job.state = created ? "done" : "duplicate";
        } catch (e) {
          job.state = "error";
          job.message = describeError(e);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, files.length) }, worker));
    const failed = tracked.filter((j) => j.state === "error").length;
    toast(
      failed
        ? `${tracked.length - failed}/${tracked.length} ảnh đã tải lên — ${failed} ảnh lỗi.`
        : `Đã tải ${tracked.length} ảnh.`,
      failed ? "error" : "ok",
    );
  }

  /** @param {MediaItem} item @param {string} alt */
  async function saveAlt(item, alt) {
    if (alt === item.alt) return;
    try {
      await api("/api/admin/media", "PATCH", { id: item.id, alt });
      item.alt = alt;
      toast("Đã lưu mô tả ảnh.");
    } catch (e) {
      toast(describeError(e), "error");
    }
  }

  /** @param {MediaItem} item */
  async function remove(item) {
    const ok = await confirmAction(`Xoá ảnh ${item.name || item.id}? Không khôi phục được.`, {
      confirmLabel: "Xoá ảnh",
      danger: true,
    });
    if (!ok) return;
    try {
      await api("/api/admin/media", "DELETE", { id: item.id });
      items = items.filter((i) => i.id !== item.id);
      toast("Đã xoá ảnh.");
    } catch (e) {
      if (e instanceof ApiError && e.data.error === "in_use") {
        usage[item.id] = /** @type {string[]} */ (e.data.usedIn);
        toast(`Ảnh đang được dùng trong: ${usage[item.id].join(", ")}`, "error");
      } else {
        toast(describeError(e), "error");
      }
    }
  }

  /** @param {string} text @param {string} what */
  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`Đã copy ${what}.`);
    } catch {
      toast("Trình duyệt chặn clipboard — chọn và copy thủ công.", "error");
    }
  }

  /** @param {string} path */
  const editHref = (path) => `/admin/edit/?path=${encodeURIComponent(path)}`;
</script>

<div class="page-head">
  <div>
    <h1>Ảnh</h1>
    <p>Thư viện R2: mỗi ảnh được nén một lần thành AVIF/WebP nhiều cỡ, bỏ EXIF/GPS.</p>
  </div>
</div>

<div
  class="drop"
  class:dragging
  role="region"
  aria-label="Tải ảnh lên"
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
  <label class="button pick"
    >Chọn tệp
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
  <p class="hint">JPEG/PNG/WebP/AVIF/HEIC/GIF ≤ 20 MB, tối đa {PARALLEL} ảnh xử lý cùng lúc.</p>
</div>

{#if jobs.length}
  <ul class="jobs" aria-label="Tiến độ tải lên">
    {#each jobs as job (job.id)}
      <li data-state={job.state}>
        <span class="job-name">{job.name}</span>
        <span class="job-state">
          {job.state === "waiting"
            ? "đang chờ"
            : job.state === "uploading"
              ? "đang xử lý…"
              : job.state === "done"
                ? "xong"
                : job.state === "duplicate"
                  ? "đã có trong thư viện"
                  : job.message}
        </span>
      </li>
    {/each}
  </ul>
  {#if active.length === 0}
    <button type="button" class="ghost" onclick={() => (jobs = [])}>Ẩn danh sách tải lên</button>
  {/if}
{/if}

<div class="filters">
  <input
    type="search"
    bind:value={query}
    placeholder="Tìm theo tên, mô tả, ID"
    aria-label="Tìm ảnh"
  />
  <label class="check"><input type="checkbox" bind:checked={unusedOnly} /> Chỉ ảnh chưa dùng</label>
  <span class="muted small">{shown.length}/{items.length} ảnh</span>
</div>

{#if loading}
  <div class="grid" aria-busy="true" aria-label="Đang tải">
    {#each [1, 2, 3, 4] as n (n)}<div class="skeleton tile"></div>{/each}
  </div>
{:else if error}
  <p class="error-text">{error}</p>
  <button type="button" onclick={load}>Thử lại</button>
{:else if shown.length === 0}
  <p class="muted">
    {items.length ? "Không có ảnh nào khớp." : "Chưa có ảnh nào — tải ảnh đầu tiên lên ở trên."}
  </p>
{:else}
  <ul class="grid">
    {#each shown as item (item.id)}
      {@const used = usage[item.id] ?? []}
      <li class="card item">
        <img
          src={mediaFallbackSrc(item)}
          alt={item.alt}
          width={item.w}
          height={item.h}
          loading="lazy"
        />
        <div class="info">
          <span class="name" title={item.name}>{item.name || item.id}</span>
          <span class="meta">{item.w}×{item.h} · <code>{item.id}</code></span>
          <label class="sr-only" for={`alt-${item.id}`}>Mô tả ảnh (alt)</label>
          <input
            id={`alt-${item.id}`}
            value={item.alt}
            placeholder="Mô tả ảnh (alt)"
            maxlength="300"
            onchange={(event) => saveAlt(item, event.currentTarget.value)}
          />
          <p class="meta used">
            {#if used.length}
              Dùng ở:
              {#each used as path, i (path)}<a href={editHref(path)}>{path}</a>{i < used.length - 1
                  ? ", "
                  : ""}{/each}
            {:else}
              Chưa dùng ở đâu.
            {/if}
          </p>
          <div class="row">
            <button type="button" onclick={() => copy(mediaPictureHtml(item, item.alt), "HTML")}
              >Copy HTML</button
            >
            <button
              type="button"
              onclick={() => copy(`{ id: "${item.id}", w: ${item.w}, h: ${item.h} }`, "ID")}
              >Copy ID</button
            >
            <button
              type="button"
              class="danger"
              onclick={() => remove(item)}
              disabled={used.length > 0}
              title={used.length ? "Gỡ ảnh khỏi các bài trước khi xoá" : undefined}>Xoá</button
            >
          </div>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .drop {
    padding: 1.5rem;
    border: 2px dashed var(--line-strong);
    border-radius: var(--radius-card);
    text-align: center;
  }
  .drop.dragging {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .drop p {
    margin: 0.35rem 0;
  }
  .pick input {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    opacity: 0;
  }
  .pick {
    position: relative;
  }
  .pick:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .hint,
  .meta,
  .small {
    color: var(--muted);
    font-size: var(--text-meta);
  }
  .jobs {
    display: grid;
    gap: 0.3rem;
    margin: 1rem 0 0.5rem;
    padding: 0;
    list-style: none;
    font-size: var(--text-meta);
  }
  .jobs li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.35rem 0.6rem;
    border-inline-start: 3px solid var(--line-strong);
    background: var(--surface);
  }
  .jobs li[data-state="uploading"] {
    border-inline-start-color: var(--accent);
  }
  .jobs li[data-state="done"],
  .jobs li[data-state="duplicate"] {
    border-inline-start-color: var(--ok);
  }
  .jobs li[data-state="error"] {
    border-inline-start-color: var(--err);
    color: var(--err);
  }
  .job-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-block: 1.5rem 1rem;
  }
  .filters input[type="search"] {
    flex: 1;
    min-inline-size: 12rem;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: var(--text-meta);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .tile {
    block-size: 18rem;
  }
  .item {
    padding: 0;
    overflow: hidden;
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
    font-weight: 500;
  }
  .used {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .used a {
    color: var(--accent);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
</style>
