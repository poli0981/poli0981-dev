<script>
  import { onMount } from "svelte";
  import { api, describeError } from "./api";
  import { COLLECTIONS, newEntryPath } from "@/lib/admin/collections";

  /** @typedef {{ path: string; sha: string; collection: string; title: string; lang: string | null; date: string | null; draft: boolean }} Entry */

  /** @type {Entry[]} */
  let entries = $state([]);
  let loading = $state(true);
  let error = $state("");

  // Filters (the collection one can come from the dashboard's links: ?collection=blog)
  let query = $state("");
  let only = $state("");
  let lang = $state("");
  let draftsOnly = $state(false);
  let sort = $state("date");

  // New entry
  let collection = $state("blog");
  let slug = $state("");
  let series = $state("");
  let newLang = $state("vi");
  const newPath = $derived(
    newEntryPath(/** @type {any} */ (collection), slug.trim(), series.trim() || undefined),
  );
  const taken = $derived(newPath !== null && entries.some((e) => e.path === newPath));

  const groups = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const matches = entries.filter(
      (e) =>
        (!only || e.collection === only) &&
        (!lang || e.lang === lang) &&
        (!draftsOnly || e.draft) &&
        (!q || e.title.toLowerCase().includes(q) || e.path.includes(q)),
    );
    /** @param {Entry} a @param {Entry} b */
    const order = (a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "vi")
        : (b.date ?? "").localeCompare(a.date ?? "");
    return Object.values(COLLECTIONS)
      .map((spec) => ({
        spec,
        items: matches.filter((e) => e.collection === spec.id).sort(order),
      }))
      .filter((group) => group.items.length > 0);
  });
  const filtered = $derived(Boolean(query.trim() || only || lang || draftsOnly));

  async function load() {
    loading = true;
    error = "";
    try {
      entries = (await api("/api/admin/content")).entries;
    } catch (e) {
      error = describeError(e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    const wanted = new URLSearchParams(location.search).get("collection");
    if (wanted && wanted in COLLECTIONS) only = wanted;
    void load();
  });

  function create() {
    if (!newPath || taken) return;
    const params = new URLSearchParams({ new: collection, slug: slug.trim(), lang: newLang });
    if (collection === "stories") params.set("series", series.trim());
    location.href = `/admin/edit/?${params}`;
  }

  function clearFilters() {
    query = "";
    only = "";
    lang = "";
    draftsOnly = false;
  }
</script>

<div class="page-head">
  <div>
    <h1>Nội dung</h1>
    <p>Lưu là commit vào repo nội dung; bấm “Xuất bản” để đưa lên site.</p>
  </div>
</div>

<section class="card new" id="new" aria-labelledby="new-title">
  <h2 id="new-title">Tạo mới</h2>
  <form
    class="row"
    onsubmit={(event) => {
      event.preventDefault();
      create();
    }}
  >
    <label
      >Loại
      <select bind:value={collection}>
        {#each Object.values(COLLECTIONS).filter((spec) => spec.creatable) as spec (spec.id)}
          <option value={spec.id}>{spec.label}</option>
        {/each}
      </select>
    </label>
    {#if collection === "stories"}
      <label>Bộ truyện (slug) <input bind:value={series} placeholder="dem-khong-tieng" /></label>
    {/if}
    <label
      >Slug
      <input
        bind:value={slug}
        placeholder="ten-bai-viet"
        aria-invalid={taken}
        aria-describedby="new-hint"
        autocomplete="off"
        spellcheck="false"
      />
    </label>
    <label
      >Ngôn ngữ
      <select bind:value={newLang}
        ><option value="vi">vi</option><option value="en">en</option></select
      >
    </label>
    <button type="submit" class="primary" disabled={!newPath || taken}>Tạo</button>
  </form>
  <p class="hint" id="new-hint" class:error-text={taken}>
    {#if taken}
      Đã có {newPath} — đổi slug khác, hoặc
      <a href={`/admin/edit/?path=${encodeURIComponent(newPath ?? "")}`}>mở bài đó</a>.
    {:else if newPath}
      Sẽ tạo {newPath}.
    {:else}
      Slug: chữ thường không dấu, số và gạch nối (vd. dem-render-dau-tien).
    {/if}
    Bản tiếng Anh nên có slug riêng (vd. thêm <code>-en</code>) và cùng “Khoá bản dịch”. “Bây giờ”
    và các trang pháp lý chỉ sửa bài có sẵn; album mới tạo ở trang
    <a href="/admin/gallery/">Gallery</a>.
  </p>
</section>

<section aria-labelledby="list-title">
  <div class="filters">
    <h2 id="list-title">Danh sách</h2>
    <input
      type="search"
      bind:value={query}
      placeholder="Tìm theo tiêu đề / đường dẫn"
      aria-label="Tìm nội dung"
    />
    <select bind:value={only} aria-label="Loại">
      <option value="">Mọi loại</option>
      {#each Object.values(COLLECTIONS) as spec (spec.id)}
        <option value={spec.id}>{spec.label}</option>
      {/each}
    </select>
    <select bind:value={lang} aria-label="Ngôn ngữ">
      <option value="">vi + en</option>
      <option value="vi">vi</option>
      <option value="en">en</option>
    </select>
    <select bind:value={sort} aria-label="Sắp xếp">
      <option value="date">Mới nhất</option>
      <option value="title">Theo tên</option>
    </select>
    <label class="check"><input type="checkbox" bind:checked={draftsOnly} /> Chỉ bản nháp</label>
  </div>

  {#if loading}
    <div class="skeleton loading" aria-busy="true" aria-label="Đang tải"></div>
  {:else if error}
    <p class="error-text">{error}</p>
    <button type="button" onclick={load}>Thử lại</button>
  {:else if groups.length === 0}
    <p class="muted">
      {#if filtered}
        Không có mục nào khớp bộ lọc. <button type="button" class="ghost" onclick={clearFilters}
          >Xoá bộ lọc</button
        >
      {:else}
        Repo nội dung chưa có bài nào.
      {/if}
    </p>
  {:else}
    {#each groups as group (group.spec.id)}
      <h3>{group.spec.label} <span class="count">{group.items.length}</span></h3>
      <ul>
        {#each group.items as entry (entry.path)}
          <li>
            <a href={`/admin/edit/?path=${encodeURIComponent(entry.path)}`}>{entry.title}</a>
            {#if entry.lang}<span class="pill">{entry.lang}</span>{/if}
            {#if entry.draft}<span class="pill" data-tone="warn">nháp</span>{/if}
            <span class="meta">{entry.date ?? ""} · {entry.path}</span>
          </li>
        {/each}
      </ul>
    {/each}
  {/if}
</section>

<style>
  section {
    margin-block-end: 2rem;
  }
  .new h2,
  .filters h2 {
    margin: 0;
    font-size: var(--text-body);
  }
  .new h2 {
    margin-block-end: 0.75rem;
  }
  h3 {
    margin: 1.5rem 0 0.5rem;
    font-size: var(--text-body);
  }
  .count,
  .meta,
  .hint {
    color: var(--muted);
    font-size: var(--text-meta);
  }
  .hint.error-text {
    color: var(--err);
  }
  .row,
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.75rem;
  }
  .filters {
    align-items: center;
    margin-block-end: 0.5rem;
  }
  .filters input[type="search"] {
    flex: 1;
    min-inline-size: 12rem;
  }
  label {
    display: grid;
    gap: 0.25rem;
    font-size: var(--text-meta);
    color: var(--muted);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .loading {
    block-size: 10rem;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
    padding-block: 0.45rem;
    border-block-end: 1px solid var(--line);
  }
  li a {
    font-weight: 500;
  }
  li a:hover {
    color: var(--accent);
  }
</style>
