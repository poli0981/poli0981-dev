<script>
  import { onMount } from "svelte";
  import { api, describeError } from "./api";
  import { toast } from "./ui";

  /** @typedef {{ number: number; url: string; autoMerge: boolean; checks: string | null }} PullRequest */
  /** @typedef {{ contentHead: string; published: string; pr: PullRequest | null; run: { status: string; conclusion: string | null; url: string } | null; singleToken?: boolean }} Status */

  /** @type {Status | null} */
  let status = $state(null);
  let busy = $state(false);
  let failedToLoad = $state(false);

  const short = (/** @type {string} */ sha) => sha.slice(0, 7);
  const pending = $derived(status !== null && status.contentHead !== status.published);
  const running = $derived(
    status !== null && (status.run?.status === "in_progress" || status.run?.status === "queued"),
  );
  const checking = $derived(status?.pr?.checks === "pending");
  const runFailed = $derived(
    status !== null && !status.pr && !running && status.run?.conclusion === "failure",
  );

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;

  // Poll fast while something is moving, slowly otherwise, never while the tab is hidden.
  function schedule() {
    clearTimeout(timer);
    if (document.visibilityState !== "visible") return;
    const delay = running || checking ? 5_000 : pending ? 30_000 : 60_000;
    timer = setTimeout(refresh, delay);
  }

  async function refresh() {
    try {
      status = await api("/api/admin/publish");
      failedToLoad = false;
    } catch {
      failedToLoad = true;
    }
    schedule();
  }

  async function publish() {
    busy = true;
    try {
      await api("/api/admin/publish", "POST");
      toast("Đã gửi yêu cầu xuất bản — workflow đang chạy.");
      if (status) status.run = { status: "queued", conclusion: null, url: status.run?.url ?? "" };
      schedule();
    } catch (error) {
      toast(describeError(error), "error");
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
      else clearTimeout(timer);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  });
</script>

<div class="publish" aria-live="polite">
  {#if status}
    {#if status.pr}
      <a href={status.pr.url} target="_blank" rel="noopener noreferrer">PR #{status.pr.number}</a>
      <span class="state" data-state={status.pr.checks ?? "pending"}>
        {status.pr.checks === "success"
          ? status.pr.autoMerge
            ? "build xanh — đang merge"
            : "build xanh — chờ review"
          : status.pr.checks === "failure"
            ? "build lỗi"
            : "đang build…"}
      </span>
    {:else if running}
      <span class="state" data-state="pending">đang chuẩn bị PR…</span>
    {:else if runFailed && status.run}
      <a
        class="state"
        data-state="failure"
        href={status.run.url}
        target="_blank"
        rel="noopener noreferrer">lần xuất bản trước lỗi ↗</a
      >
    {:else if pending}
      <span class="state" data-state="pending">có thay đổi chưa xuất bản</span>
    {:else}
      <span class="state" data-state="success">đã xuất bản ({short(status.published)})</span>
    {/if}
    {#if status.singleToken}
      <a
        class="warn"
        href="/admin/security/"
        title="Xuất bản đang dùng chung token nội dung — xem trang Bảo mật"
        >⚠<span class="sr-only">Xuất bản đang dùng chung token nội dung</span></a
      >
    {/if}
    <button
      type="button"
      class="primary"
      onclick={publish}
      disabled={busy || !pending || running || checking}>Xuất bản</button
    >
  {:else if failedToLoad}
    <span class="state" data-state="failure">không đọc được trạng thái xuất bản</span>
  {/if}
</div>

<style>
  .publish {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    font-size: var(--text-meta);
  }
  .state {
    color: var(--muted);
  }
  .state[data-state="success"] {
    color: var(--ok);
  }
  .state[data-state="failure"] {
    color: var(--err);
  }
  .warn {
    color: var(--warn);
  }
  a:hover {
    text-decoration: underline;
  }
</style>
