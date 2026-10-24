<script>
  import { onMount, tick } from "svelte";

  // Mounted once by AdminLayout: renders what the islands signal through ui.ts —
  // toasts, the confirm dialog and the "session expired" banner.

  /** @typedef {import("./ui").ToastDetail & { id: number }} Toast */

  /** @type {Toast[]} */
  let toasts = $state([]);
  let sessionLost = $state(false);
  /** @type {import("./ui").ConfirmDetail | null} */
  let pending = $state(null);
  /** @type {HTMLDialogElement | undefined} */
  let dialog = $state();
  let nextId = 0;

  /** @param {Toast} item */
  function dismiss(item) {
    toasts = toasts.filter((t) => t.id !== item.id);
  }

  /** @param {boolean} confirmed */
  function answer(confirmed) {
    pending?.resolve(confirmed);
    pending = null;
    dialog?.close();
  }

  onMount(() => {
    /** @param {Event} event */
    const onToast = (event) => {
      const { message, kind } = /** @type {CustomEvent<import("./ui").ToastDetail>} */ (event)
        .detail;
      const item = { id: (nextId += 1), message, kind };
      toasts = [...toasts.slice(-3), item];
      // Errors stay until dismissed: they usually need reading twice.
      if (kind !== "error") setTimeout(() => dismiss(item), 5000);
    };
    /** @param {Event} event */
    const onConfirm = async (event) => {
      event.preventDefault(); // tells confirmAction() the dialog is handling it
      pending?.resolve(false);
      pending = /** @type {CustomEvent<import("./ui").ConfirmDetail>} */ (event).detail;
      await tick();
      dialog?.showModal();
    };
    const onSession = () => (sessionLost = true);
    addEventListener("admin:toast", onToast);
    addEventListener("admin:confirm", onConfirm);
    addEventListener("admin:session-expired", onSession);
    return () => {
      removeEventListener("admin:toast", onToast);
      removeEventListener("admin:confirm", onConfirm);
      removeEventListener("admin:session-expired", onSession);
    };
  });
</script>

{#if sessionLost}
  <div class="session" role="alert">
    <span
      >Phiên đăng nhập Cloudflare Access đã hết hạn. Bản nháp đang viết vẫn được giữ trên máy.</span
    >
    <button type="button" onclick={() => location.reload()}>Đăng nhập lại</button>
  </div>
{/if}

<!-- Two live regions: polite for confirmations, assertive (role=alert) for failures. -->
<div class="toasts">
  <div aria-live="polite" class="stack">
    {#each toasts.filter((t) => t.kind !== "error") as item (item.id)}
      <div class="toast" data-kind={item.kind}>
        <span>{item.message}</span>
        <button type="button" aria-label="Đóng thông báo" onclick={() => dismiss(item)}>✕</button>
      </div>
    {/each}
  </div>
  <div role="alert" class="stack">
    {#each toasts.filter((t) => t.kind === "error") as item (item.id)}
      <div class="toast" data-kind="error">
        <span>{item.message}</span>
        <button type="button" aria-label="Đóng thông báo" onclick={() => dismiss(item)}>✕</button>
      </div>
    {/each}
  </div>
</div>

<dialog
  bind:this={dialog}
  class="confirm"
  aria-labelledby="admin-confirm-message"
  oncancel={() => answer(false)}
>
  {#if pending}
    <p id="admin-confirm-message">{pending.message}</p>
    <div class="actions">
      <button type="button" onclick={() => answer(false)}>Huỷ</button>
      <button
        type="button"
        class={pending.danger ? "danger" : "primary"}
        onclick={() => answer(true)}>{pending.confirmLabel}</button
      >
    </div>
  {/if}
</dialog>

<style>
  .session {
    position: sticky;
    inset-block-start: 0;
    z-index: 30;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.5rem 1rem;
    padding: 0.6rem 1rem;
    background: color-mix(in srgb, var(--warn) 18%, var(--surface));
    border-block-end: 1px solid var(--warn);
    color: var(--text);
    font-size: var(--text-meta);
  }
  .toasts {
    position: fixed;
    inset-block-end: 1rem;
    inset-inline-end: 1rem;
    z-index: 60;
    display: grid;
    gap: 0.5rem;
    inline-size: min(24rem, calc(100vw - 2rem));
  }
  .stack {
    display: grid;
    gap: 0.5rem;
  }
  .toast {
    display: flex;
    align-items: start;
    gap: 0.75rem;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--line-strong);
    border-inline-start: 3px solid var(--ok);
    border-radius: var(--radius-card);
    background: var(--elevated);
    box-shadow: var(--shadow-elevated);
    font-size: var(--text-meta);
  }
  .toast[data-kind="info"] {
    border-inline-start-color: var(--accent);
  }
  .toast[data-kind="error"] {
    border-inline-start-color: var(--err);
  }
  .toast span {
    flex: 1;
  }
  .toast button {
    padding: 0 0.3rem;
    border: 0;
    background: none;
    color: var(--muted);
  }
  .confirm {
    inline-size: min(26rem, 92vw);
    padding: 1.25rem;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-modal);
    background: var(--elevated);
    color: var(--text);
  }
  .confirm::backdrop {
    /* ::backdrop inherits custom properties only in 2024+ engines, hence the fallback. */
    background: var(--overlay, rgb(2 6 23 / 0.66));
  }
  .confirm p {
    margin: 0 0 1rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
