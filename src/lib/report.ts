/**
 * Client-side bug-report helpers (docs 10). The Turnstile site key is a public,
 * build-inlined env var; when it's unset the whole feature degrades to a copy +
 * Discord fallback (see ReportDialog.astro). Server verification/secrets live in
 * src/pages/api/report.ts.
 */
import { PUBLIC_TURNSTILE_SITE_KEY } from "astro:env/client";
import { getReportLog, type BugEntry } from "./bugbuffer";

export const TURNSTILE_SITE_KEY: string = PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const REPORT_ENABLED: boolean = TURNSTILE_SITE_KEY.length > 0;

export interface ReportMeta {
  route: string;
  ua: string;
  viewport: string;
  theme: string;
  locale: string;
  ref?: string;
}

export interface ReportPayload {
  description: string;
  console?: BugEntry[];
  meta: ReportMeta;
  turnstileToken: string;
}

export function collectMeta(ref?: string): ReportMeta {
  return {
    route: location.pathname,
    ua: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    theme: document.documentElement.dataset.theme ?? "dark",
    locale: document.documentElement.lang || "vi",
    ref,
  };
}

export function reportLog(): BugEntry[] {
  return getReportLog();
}

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
    },
  ) => string;
  reset: (id?: string) => void;
}

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let turnstileReady: Promise<TurnstileApi> | null = null;

/** Lazily inject the Turnstile script (once) and resolve its explicit-render API. */
export function loadTurnstile(): Promise<TurnstileApi> {
  const win = window as unknown as { turnstile?: TurnstileApi };
  turnstileReady ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (win.turnstile) {
      resolve(win.turnstile);
      return;
    }
    const script = document.createElement("script");
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.onload = () =>
      win.turnstile ? resolve(win.turnstile) : reject(new Error("turnstile-missing"));
    script.onerror = () => reject(new Error("turnstile-load-failed"));
    document.head.appendChild(script);
  });
  return turnstileReady;
}

/** POST the report. Returns the HTTP status (201 ok, 202 degraded, 4xx/5xx failure). */
export async function submitReport(
  payload: ReportPayload,
): Promise<{ status: number; url?: string }> {
  const res = await fetch("/api/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  let url: string | undefined;
  try {
    const data = (await res.json()) as { url?: string };
    url = data.url;
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, url };
}
