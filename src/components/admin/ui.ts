// UI signals shared by the admin islands. Each island is its own Svelte app (client:only),
// so they talk through window events, and AdminChrome.svelte (mounted once by AdminLayout)
// renders the result: toasts, the confirm dialog, the session banner.

export type ToastKind = "ok" | "error" | "info";

/** @public AdminChrome.svelte reads it through a JSDoc import, which knip cannot see. */
export interface ToastDetail {
  message: string;
  kind: ToastKind;
}

/** @public AdminChrome.svelte reads it through a JSDoc import, which knip cannot see. */
export interface ConfirmDetail {
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (confirmed: boolean) => void;
}

export function toast(message: string, kind: ToastKind = "ok"): void {
  window.dispatchEvent(new CustomEvent<ToastDetail>("admin:toast", { detail: { message, kind } }));
}

/**
 * A styled confirm(): resolves true when the admin confirms. AdminChrome takes the event
 * (and cancels it); without it — a page that failed to hydrate — the browser's own
 * window.confirm answers instead.
 */
export function confirmAction(
  message: string,
  { confirmLabel = "Đồng ý", danger = false }: { confirmLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    const event = new CustomEvent<ConfirmDetail>("admin:confirm", {
      detail: { message, confirmLabel, danger, resolve },
      cancelable: true,
    });
    if (window.dispatchEvent(event)) resolve(window.confirm(message));
  });
}

/** The Access session is gone (expired, or the token no longer passes the allowlist). */
export function sessionExpired(): void {
  window.dispatchEvent(new Event("admin:session-expired"));
}
