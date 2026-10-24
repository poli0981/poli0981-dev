import { log } from "../log";

// The admin's audit log: one KV key per action under `audit:`, kept 90 days. Keys sort
// ascending, so the time in them is inverted to make list() return the newest first, and
// the entry itself rides in the key's metadata: the activity page is one KV list() call.

type AuditAction =
  | "content.save"
  | "content.delete"
  | "media.upload"
  | "media.alt"
  | "media.delete"
  | "gallery.save"
  | "gallery.delete"
  | "publish"
  | "denylist.add"
  | "denylist.remove";

export interface AuditEntry {
  /** ISO time of the action. */
  at: string;
  admin: string;
  action: AuditAction;
  /** What it touched: a content path, media id, album, address range. */
  target: string;
  /** A commit sha, a reason… */
  detail?: string;
}

const PREFIX = "audit:";
const TTL_SECONDS = 90 * 24 * 60 * 60;
const LATEST = 9_999_999_999_999; // ms timestamps stay below this until the year 2286
/** KV metadata is capped at 1024 bytes serialized; these keep an entry well under it. */
const MAX_FIELD = 200;
let sequence = 0;

/** Log one admin action. Never throws: the action already happened, a lost line must not undo it. */
export async function recordAudit(
  kv: KVNamespace | undefined,
  entry: Omit<AuditEntry, "at">,
  now = Date.now(),
): Promise<void> {
  if (!kv) return;
  const stored: AuditEntry = {
    at: new Date(now).toISOString(),
    admin: entry.admin.slice(0, MAX_FIELD),
    action: entry.action,
    target: entry.target.slice(0, MAX_FIELD),
    ...(entry.detail ? { detail: entry.detail.slice(0, MAX_FIELD) } : {}),
  };
  // Within one millisecond the inverted counter keeps this isolate's actions newest-first;
  // the random tail keeps keys from different isolates apart.
  sequence = (sequence + 1) % 10_000;
  const key = [
    PREFIX + String(LATEST - now).padStart(13, "0"),
    String(9_999 - sequence).padStart(4, "0"),
    crypto.randomUUID().slice(0, 8),
  ].join(":");
  try {
    await kv.put(key, "", { metadata: stored, expirationTtl: TTL_SECONDS });
  } catch (error) {
    log.warn("admin.audit_failed", { action: entry.action, error });
  }
}

/** The newest `limit` entries. */
export async function listAudit(kv: KVNamespace, limit = 100): Promise<AuditEntry[]> {
  const { keys } = await kv.list<AuditEntry>({ prefix: PREFIX, limit });
  return keys.flatMap((key) => (key.metadata ? [key.metadata] : []));
}
