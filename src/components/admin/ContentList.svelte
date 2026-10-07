<script>
  import { onMount } from "svelte";
  import { api, describeError } from "./api";
  import { COLLECTIONS, newEntryPath } from "@/lib/admin/collections";

  /** @typedef {{ path: string; sha: string; collection: string; title: string; lang: string | null; date: string | null; draft: boolean }} Entry */

  /** @type {Entry[]} */
  let entries = $state([]);
  let loading = $state(true);
  let error = $state("");
  let query = $state("");

  // New entry
  let collection = $state("blog");
  let slug = $state("");
  let series = $state("");
  let lang = $state("vi");
  const newPath = $derived(
    newEntryPath(/** @type {any} */ (collection), slug.trim(), series.trim() || undefined),
  );

  const groups = $derived(
    Object.values(COLLECTIONS)
      .map((spec) => ({
        spec,
        items: entries
          .filter((e) => e.collection === spec.id)
          .filter((e) => {
            const q = query.trim().toLowerCase();
            return !q || e.title.toLowerCase().includes(q) || e.path.includes(q);
          })
          .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
      }))
      .filter((group) => group.items.length > 0),
  );

  onMount(async () => {
    try {
      entries = (await api("/api/admin/content")).entries;
    } catch (e) {
      error = describeError(e);
    } finally {
      loading = false;
    }
  });

  function create() {
    if (!newPath) return;
    const params = new URLSearchParams({ new: collection, slug: slug.trim(), lang });
    if (collection === "stories") params.set("series", series.trim());
    location.href = `/admin/edit/?${params}`;
  }
</script>

<section class="new">
  <h2>Tạo mới</h2>
  <div class="row">
    <label
      >Loại
      <select bind:value={collection}>
        {#each Object.values(COLLECTIONS) as spec (spec.id)}
          <option value={spec.id}>{spec.label}</option>
        {/each}
      </select>
    </label>
    {#if collection === "stories"}
      <label>Bộ truyện (slug) <input bind:value={series} placeholder="dem-khong-tieng" /></label>
    {/if}
    <label>Slug <input bind:value={slug} placeholder="ten-bai-viet" /></label>
    <label
      >Ngôn ngữ
      <select bind:value={lang}><option value="vi">vi</option><option value="en">en</option></select
      >
    </label>
    <button type="button" onclick={create} disabled={!newPath}>Tạo</button>
  </div>
  <p class="hint">
    {newPath
      ? `Sẽ tạo ${newPath}`
      : "Slug: chữ thường không dấu, số và gạch nối (vd. dem-render-dau-tien)."}
    Bản tiếng Anh nên có slug riêng (vd. thêm <code>-en</code>) và cùng “Khoá bản dịch”.
  </p>
</section>

<section>
  <div class="head">
    <h2>Nội dung</h2>
    <input type="search" bind:value={query} placeholder="Tìm theo tiêu đề / đường dẫn" />
  </div>
  {#if loading}
    <p>Đang tải…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    {#each groups as group (group.spec.id)}
      <h3>{group.spec.label} <span class="count">{group.items.length}</span></h3>
      <ul>
        {#each group.items as entry (entry.path)}
          <li>
            <a href={`/admin/edit/?path=${encodeURIComponent(entry.path)}`}>{entry.title}</a>
            {#if entry.lang}<span class="badge">{entry.lang}</span>{/if}
            {#if entry.draft}<span class="badge draft">nháp</span>{/if}
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
  h2 {
    margin: 0 0 0.75rem;
    font-size: var(--text-lead);
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
  .row,
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.75rem;
  }
  .head {
    justify-content: space-between;
  }
  label {
    display: grid;
    gap: 0.25rem;
    font-size: var(--text-meta);
    color: var(--muted);
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
    padding-block: 0.4rem;
    border-block-end: 1px solid var(--line);
  }
  .badge {
    padding: 0 0.4rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    font-size: var(--text-meta);
  }
  .draft {
    border-color: var(--warn);
    color: var(--warn);
  }
  .error {
    color: var(--err);
  }
</style>
