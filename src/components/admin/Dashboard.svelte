<script>
  import { onMount } from "svelte";
  import { api, describeError } from "./api";
  import { ago, dateTime, shortSha } from "./format";

  /**
   * @typedef {{ id: string; label: string; total: number; drafts: number; vi: number; en: number }} CollectionCount
   * @typedef {{
   *   content: { head: string; collections: CollectionCount[] } | null;
   *   media: { count: number };
   *   widgets: { yt: string; steam: string; gh: string; lastRun: string } | null;
   *   config: import("@/lib/admin/status").ConfigStatus;
   * }} Overview
   * @typedef {{ contentHead: string; published: string; pr: { number: number; url: string; checks: string | null } | null; run: { status: string; conclusion: string | null; url: string } | null }} Publish
   */

  /** @type {Overview | null} */
  let overview = $state(null);
  /** @type {Publish | null} */
  let publish = $state(null);
  let error = $state("");

  const missing = $derived(
    overview
      ? Object.entries(overview.config.secrets)
          .filter(([, set]) => !set)
          .map(([name]) => name)
      : [],
  );
  const drafts = $derived(
    overview?.content?.collections.reduce((sum, c) => sum + c.drafts, 0) ?? 0,
  );

  /** @param {string} status */
  const tone = (status) => (status === "ok" ? "ok" : status === "stale" ? "warn" : "err");

  async function load() {
    error = "";
    try {
      [overview, publish] = await Promise.all([
        api("/api/admin/overview"),
        api("/api/admin/publish").catch(() => null),
      ]);
    } catch (e) {
      error = describeError(e);
    }
  }

  onMount(load);
</script>

<div class="page-head">
  <div>
    <h1>Tổng quan</h1>
    {#if overview?.config.version.id}
      <p>
        Đang chạy bản <code>{overview.config.version.id.slice(0, 8)}</code>
        {#if overview.config.version.commit}
          · commit
          <a
            href={`https://github.com/poli0981/poli0981-dev/commit/${overview.config.version.commit}`}
            target="_blank"
            rel="noopener noreferrer"><code>{shortSha(overview.config.version.commit)}</code></a
          >
        {/if}
        · triển khai {ago(overview.config.version.timestamp)}
      </p>
    {/if}
  </div>
  <div class="quick">
    <a class="button primary" href="/admin/content/#new">Viết mới</a>
    <a class="button" href="/admin/media/">Tải ảnh</a>
  </div>
</div>

{#if error}
  <div class="card">
    <p class="error-text">{error}</p>
    <button type="button" onclick={load}>Thử lại</button>
  </div>
{:else if !overview}
  <div class="grid" aria-busy="true" aria-label="Đang tải">
    {#each [1, 2, 3, 4] as n (n)}<div class="card skeleton tile"></div>{/each}
  </div>
{:else}
  <div class="grid">
    <section class="card wide">
      <h2>Nội dung</h2>
      {#if overview.content}
        <table>
          <thead>
            <tr
              ><th scope="col">Loại</th><th scope="col">Tổng</th><th scope="col">vi</th><th
                scope="col">en</th
              ><th scope="col">Nháp</th></tr
            >
          </thead>
          <tbody>
            {#each overview.content.collections as c (c.id)}
              <tr>
                <th scope="row"><a href={`/admin/content/?collection=${c.id}`}>{c.label}</a></th>
                <td>{c.total}</td>
                <td>{c.vi}</td>
                <td>{c.en}</td>
                <td
                  >{#if c.drafts}<span class="pill" data-tone="warn">{c.drafts}</span
                    >{:else}0{/if}</td
                >
              </tr>
            {/each}
          </tbody>
        </table>
        <p class="muted small">
          Repo nội dung ở <code>{shortSha(overview.content.head)}</code>
          {#if drafts}· {drafts} bản nháp chưa hiện trên site{/if}
        </p>
      {:else}
        <p class="muted">Chưa đặt GITHUB_CONTENT_TOKEN — admin không đọc được repo nội dung.</p>
      {/if}
    </section>

    <section class="card">
      <h2>Xuất bản</h2>
      {#if publish}
        {#if publish.contentHead === publish.published}
          <p><span class="pill" data-tone="ok">Đã đồng bộ</span></p>
          <p class="muted small">
            Site đang dùng nội dung <code>{shortSha(publish.published)}</code>.
          </p>
        {:else}
          <p><span class="pill" data-tone="warn">Có thay đổi chưa xuất bản</span></p>
          <p class="muted small">
            Repo <code>{shortSha(publish.contentHead)}</code> · site
            <code>{shortSha(publish.published)}</code>
          </p>
        {/if}
        {#if publish.run?.conclusion === "failure"}
          <p class="small">
            <span class="pill" data-tone="err">Lần chạy gần nhất lỗi</span>
            <a href={publish.run.url} target="_blank" rel="noopener noreferrer">Xem log ↗</a>
          </p>
        {/if}
      {:else}
        <p class="muted">Không đọc được trạng thái xuất bản.</p>
      {/if}
    </section>

    <section class="card">
      <h2>Ảnh &amp; widgets</h2>
      <p><a href="/admin/media/">{overview.media.count} ảnh</a> trong thư viện R2.</p>
      {#if overview.widgets}
        <p class="pills">
          <span class="pill" data-tone={tone(overview.widgets.yt)}
            >YouTube {overview.widgets.yt}</span
          >
          <span class="pill" data-tone={tone(overview.widgets.steam)}
            >Steam {overview.widgets.steam}</span
          >
          <span class="pill" data-tone={tone(overview.widgets.gh)}
            >GitHub {overview.widgets.gh}</span
          >
        </p>
        <p class="muted small" title={dateTime(overview.widgets.lastRun)}>
          Cron widgets chạy {ago(overview.widgets.lastRun)}
        </p>
      {:else}
        <p class="muted small">Cron widgets chưa ghi trạng thái nào.</p>
      {/if}
    </section>

    <section class="card">
      <h2>Bảo mật</h2>
      <p>
        Cổng Turnstile:
        <span class="pill" data-tone={overview.config.gate.active ? "ok" : "warn"}>
          {overview.config.gate.active ? `bật (${overview.config.gate.mode})` : "tắt"}
        </span>
      </p>
      {#if missing.length}
        <p class="small">
          Chưa đặt: {#each missing as name, i (name)}<code>{name}</code>{i < missing.length - 1
              ? ", "
              : ""}{/each}
        </p>
      {/if}
      {#if overview.config.singleToken}
        <p class="small warn">
          Xuất bản đang dùng chung token nội dung — nên tạo GITHUB_PUBLISH_TOKEN riêng.
        </p>
      {/if}
      <p class="small"><a href="/admin/security/">Danh sách chặn IP →</a></p>
    </section>
  </div>
{/if}

<style>
  .quick {
    display: flex;
    gap: 0.5rem;
  }
  .grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: 1fr;
  }
  @media (min-width: 720px) {
    .grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .wide {
    grid-column: 1 / -1;
  }
  .tile {
    min-block-size: 9rem;
  }
  table {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--text-meta);
  }
  th,
  td {
    padding: 0.4rem 0.5rem;
    border-block-end: 1px solid var(--line);
    text-align: start;
  }
  thead th {
    color: var(--muted);
    font-weight: 500;
  }
  tbody th a {
    color: var(--accent);
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .small {
    font-size: var(--text-meta);
  }
  .warn {
    color: var(--warn);
  }
  p {
    margin: 0.4rem 0;
  }
</style>
