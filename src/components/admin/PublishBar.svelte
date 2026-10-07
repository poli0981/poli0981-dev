<script>
  import { onMount } from "svelte";
  import { api, describeError } from "./api";

  /** @typedef {{ number: number; url: string; autoMerge: boolean; checks: string | null }} PullRequest */
  /** @typedef {{ contentHead: string; published: string; pr: PullRequest | null; run: { status: string; conclusion: string | null; url: string } | null }} Status */

  /** @type {Status | null} */
  let status = $state(null);
  let message = $state("");
  let busy = $state(false);

  const short = (/** @type {string} */ sha) => sha.slice(0, 7);
  const pending = $derived(status !== null && status.contentHead !== status.published);
  const running = $derived(
    status !== null && (status.run?.status === "in_progress" || status.run?.status === "queued"),
  );

  async function refresh() {
    try {
      status = await api("/api/admin/publish");
    } catch (error) {
      message = describeError(error);
    }
  }

  async function publish() {
    busy = true;
    message = "";
    try {
      await api("/api/admin/publish", "POST");
      message = "Đã gửi yêu cầu xuất bản — workflow đang chạy.";
      setTimeout(refresh, 4000);
    } catch (error) {
      message = describeError(error);
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    void refresh();
    // Keep the status fresh while something is moving; slow down when idle.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    return () => clearInterval(timer);
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
    {:else if pending}
      <span class="state" data-state="pending">có thay đổi chưa xuất bản</span>
    {:else}
      <span class="state" data-state="success">đã xuất bản ({short(status.published)})</span>
    {/if}
    <button type="button" onclick={publish} disabled={busy || !pending || running}>Xuất bản</button>
  {/if}
  {#if message}<span class="msg">{message}</span>{/if}
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
  .msg {
    color: var(--muted);
  }
  button {
    padding: 0.35rem 0.8rem;
    border: 1px solid var(--accent);
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--accent);
    font: inherit;
    cursor: pointer;
  }
  button:disabled {
    border-color: var(--line);
    color: var(--muted);
    cursor: default;
  }
</style>
