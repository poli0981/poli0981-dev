<script>
  import { onMount } from "svelte";
  import { api, describeError } from "./api";
  import { toast } from "./ui";
  import { canPublish, PHASE_TEXT } from "@/lib/admin/publish-phase";

  /** @typedef {{ number: number; url: string; autoMerge: boolean; checks: string | null }} PullRequest */
  /** @typedef {import("@/lib/admin/publish-phase").PublishPhase} Phase */
  /** @typedef {{ contentHead: string; published: string; live: string | null; phase: Phase; pr: PullRequest | null; run: { status: string; conclusion: string | null; url: string } | null; singleToken?: boolean }} Status */

  /** @type {Status | null} */
  let status = $state(null);
  let busy = $state(false);
  let failedToLoad = $state(false);

  const short = (/** @type {string} */ sha) => sha.slice(0, 7);
  const moving = $derived(status?.phase === "building" || status?.phase === "deploying");

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;

  // Poll fast while something is moving, slowly otherwise, never while the tab is hidden.
  function schedule() {
    clearTimeout(timer);
    if (document.visibilityState !== "visible") return;
    const delay = moving ? 10_000 : status?.phase === "pending" ? 30_000 : 60_000;
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

  // Saves publish on their own; this is the retry for a failed or never-started publish.
  async function publish() {
    busy = true;
    try {
      await api("/api/admin/publish", "POST");
      toast("Đã gửi yêu cầu xuất bản — workflow đang chạy.");
      if (status) status.phase = "building";
      schedule();
    } catch (error) {
      toast(describeError(error), "error");
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    void refresh();
    // A save elsewhere in the admin just started a publish: look again soon.
    const onSaved = () => setTimeout(refresh, 3_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
      else clearTimeout(timer);
    };
    addEventListener("admin:published", onSaved);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      removeEventListener("admin:published", onSaved);
      document.removeEventListener("visibilitychange", onVisible);
    };
  });
</script>

<div class="publish" aria-live="polite">
  {#if status}
    {#if status.pr}
      <a href={status.pr.url} target="_blank" rel="noopener noreferrer">PR #{status.pr.number}</a>
    {:else if status.phase === "failed" && status.run}
      <a href={status.run.url} target="_blank" rel="noopener noreferrer">log ↗</a>
    {/if}
    <span class="state" data-tone={PHASE_TEXT[status.phase].tone}>
      {PHASE_TEXT[status.phase].label}
      {#if status.phase === "live" && status.live}({short(status.live)}){/if}
    </span>
    {#if status.singleToken}
      <a
        class="warn"
        href="/admin/security/"
        title="Xuất bản đang dùng chung token nội dung — xem trang Bảo mật"
      >
        ⚠<span class="sr-only">Xuất bản đang dùng chung token nội dung</span>
      </a>
    {/if}
    <button
      type="button"
      class="primary"
      onclick={publish}
      disabled={busy || !canPublish(status.phase)}
    >
      {status.phase === "failed" ? "Xuất bản lại" : "Xuất bản"}
    </button>
  {:else if failedToLoad}
    <span class="state" data-tone="err">không đọc được trạng thái xuất bản</span>
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
  .state[data-tone="ok"] {
    color: var(--ok);
  }
  .state[data-tone="warn"] {
    color: var(--warn);
  }
  .state[data-tone="err"] {
    color: var(--err);
  }
  .warn {
    color: var(--warn);
  }
  a:hover {
    text-decoration: underline;
  }
</style>
