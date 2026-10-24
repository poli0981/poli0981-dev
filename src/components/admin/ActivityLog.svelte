<script>
  import { onMount } from "svelte";
  import { api, describeError } from "./api";
  import { ago, dateTime, shortSha } from "./format";

  /** @typedef {import("@/lib/admin/audit").AuditEntry} AuditEntry */
  /** @typedef {import("@/lib/admin/github").ContentCommit} ContentCommit */

  /** @type {{ audit: AuditEntry[]; commits: ContentCommit[] } | null} */
  let data = $state(null);
  let error = $state("");
  let filter = $state("");

  /** @type {Record<string, string>} */
  const ACTIONS = {
    "content.save": "Lưu nội dung",
    "content.delete": "Xoá nội dung",
    "media.upload": "Tải ảnh",
    "media.alt": "Sửa mô tả ảnh",
    "media.delete": "Xoá ảnh",
    "gallery.save": "Lưu album",
    "gallery.delete": "Xoá album",
    publish: "Xuất bản",
    "denylist.add": "Chặn IP",
    "denylist.remove": "Bỏ chặn IP",
  };

  const audit = $derived(
    (data?.audit ?? []).filter((entry) => !filter || entry.action.startsWith(filter)),
  );

  async function load() {
    error = "";
    try {
      data = await api("/api/admin/activity");
    } catch (e) {
      error = describeError(e);
    }
  }

  onMount(load);
</script>

<div class="page-head">
  <div>
    <h1>Hoạt động</h1>
    <p>Thao tác trong admin (lưu 90 ngày) và các commit mới nhất của repo nội dung.</p>
  </div>
  <button type="button" onclick={load}>Tải lại</button>
</div>

{#if error}
  <p class="error-text">{error}</p>
{:else if !data}
  <div class="skeleton loading" aria-busy="true" aria-label="Đang tải"></div>
{:else}
  <div class="cols">
    <section class="card">
      <div class="section-head">
        <h2>Nhật ký admin</h2>
        <label class="muted small"
          >Lọc
          <select bind:value={filter}>
            <option value="">Tất cả</option>
            <option value="content">Nội dung</option>
            <option value="media">Ảnh</option>
            <option value="gallery">Gallery</option>
            <option value="publish">Xuất bản</option>
            <option value="denylist">Chặn IP</option>
          </select>
        </label>
      </div>
      {#if audit.length === 0}
        <p class="muted">Chưa có thao tác nào{filter ? " thuộc loại này" : ""}.</p>
      {:else}
        <ol class="log">
          {#each audit as entry (entry.at + entry.action + entry.target)}
            <li>
              <span class="what">{ACTIONS[entry.action] ?? entry.action}</span>
              <code class="target">{entry.target}</code>
              {#if entry.detail}<span class="muted small detail">{entry.detail}</span>{/if}
              <span class="muted small when" title={dateTime(entry.at)}>
                {ago(entry.at)} · {entry.admin}
              </span>
            </li>
          {/each}
        </ol>
      {/if}
    </section>

    <section class="card">
      <h2>Commit repo nội dung</h2>
      {#if data.commits.length === 0}
        <p class="muted">Không đọc được lịch sử commit.</p>
      {:else}
        <ol class="log">
          {#each data.commits as commit (commit.sha)}
            <li>
              <a href={commit.url} target="_blank" rel="noopener noreferrer"
                ><code>{shortSha(commit.sha)}</code></a
              >
              <span class="what">{commit.message}</span>
              <span class="muted small when" title={dateTime(commit.date)}>
                {ago(commit.date)} · {commit.author}
              </span>
            </li>
          {/each}
        </ol>
      {/if}
    </section>
  </div>
{/if}

<style>
  .loading {
    block-size: 12rem;
  }
  .cols {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));
    align-items: start;
  }
  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }
  .section-head label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .log {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .log li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.6rem;
    padding-block: 0.55rem;
    border-block-end: 1px solid var(--line);
  }
  .what {
    font-weight: 500;
  }
  .target {
    overflow-wrap: anywhere;
  }
  .when {
    flex-basis: 100%;
  }
  .detail {
    overflow-wrap: anywhere;
  }
  .small {
    font-size: var(--text-meta);
  }
</style>
