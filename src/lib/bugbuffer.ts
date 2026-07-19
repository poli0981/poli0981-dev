/**
 * Client-side error ring buffer (docs 10 §1). RAM only, capped at 20 entries, never
 * auto-sent — the user opts in via the "Báo lỗi" dialog. Everything is scrubbed on
 * capture: query strings stripped, stack trimmed to 3 frames, emails/tokens masked,
 * message capped at 500 chars.
 */
export interface BugEntry {
  ts: string;
  type: "error" | "unhandledrejection" | "console";
  message: string;
  source?: string;
  line?: number;
  col?: number;
  stack?: string;
}

const MAX = 20;
const BUFFER: BugEntry[] = [];

function scrub(text: string): string {
  return text
    .replace(/[?#]\S*/g, "") // strip query strings / hashes (may carry tokens)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]") // mask emails
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[token]") // mask long token-like strings
    .slice(0, 500);
}

function scrubStack(stack: unknown): string | undefined {
  if (typeof stack !== "string") return undefined;
  return stack
    .split("\n")
    .slice(0, 3)
    .map((line) => scrub(line.trim()))
    .join("\n");
}

function push(entry: BugEntry): void {
  BUFFER.push(entry);
  if (BUFFER.length > MAX) BUFFER.shift();
}

function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

let installed = false;

/** Install the global listeners once (auto-runs on import; client-side only). */
function install(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    const err = event.error as { stack?: unknown } | undefined;
    push({
      ts: new Date().toISOString(),
      type: "error",
      message: scrub(String(event.message ?? "")),
      source: event.filename ? scrub(event.filename) : undefined,
      line: event.lineno || undefined,
      col: event.colno || undefined,
      stack: scrubStack(err?.stack),
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as { message?: unknown; stack?: unknown } | undefined;
    push({
      ts: new Date().toISOString(),
      type: "unhandledrejection",
      message: scrub(reason?.message ? String(reason.message) : safeString(event.reason)),
      stack: scrubStack(reason?.stack),
    });
  });

  // Light console.error wrap — keeps the original behaviour, just records a copy.
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    push({
      ts: new Date().toISOString(),
      type: "console",
      message: scrub(args.map(safeString).join(" ")),
    });
    original(...args);
  };
}

install();

/** A snapshot copy of the current buffer, for attaching to a report. */
export function getReportLog(): BugEntry[] {
  return BUFFER.slice();
}
