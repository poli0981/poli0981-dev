// The IP denylist: ONE KV key (`denylist`) holding every entry, managed from the admin's
// security page. One key — not one per address — so a lookup costs the same whatever IP is
// asking: the Worker reads the list at most once a minute per isolate (and KV caches it per
// colo), instead of a cold per-IP read on every page view. Entries are single addresses or
// CIDR ranges (an IPv6 /64 is one host's worth of addresses), each with an optional expiry.

const DENYLIST_KEY = "denylist";

export interface DenyEntry {
  /** "203.0.113.7", "203.0.113.0/24", "2001:db8::1", "2001:db8:1:2::/64". */
  cidr: string;
  reason?: string;
  /** ISO timestamp; the entry is ignored after it. */
  until?: string;
  added?: string;
}

/** How long an isolate trusts its copy of the list before reading KV again. */
const MEMO_MS = 60_000;
/** KV edge cache for the key (seconds, ≥ 30). New entries apply within about this long. */
const KV_CACHE_SECONDS = 60;

/** An address as a bigint plus its family, or null when it is not one. */
function parseAddress(ip: string): { value: bigint; bits: 32 | 128 } | null {
  if (ip.includes(":")) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return parseAddress(mapped[1]);
    const halves = ip.toLowerCase().split("::");
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(":") : [];
    const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
    const missing = 8 - head.length - tail.length;
    if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
    const groups = [
      ...head,
      ...Array<string>(halves.length === 2 ? missing : 0).fill("0"),
      ...tail,
    ];
    let value = 0n;
    for (const group of groups) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      value = (value << 16n) | BigInt(Number.parseInt(group, 16));
    }
    return { value, bits: 128 };
  }
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null;
    value = (value << 8n) | BigInt(Number(part));
  }
  return { value, bits: 32 };
}

/** True when `ip` is inside `cidr` (a bare address means exactly that address). */
export function inRange(ip: string, cidr: string): boolean {
  const [base, prefixText] = cidr.split("/");
  const address = parseAddress(ip);
  const network = parseAddress(base);
  if (!address || !network || address.bits !== network.bits) return false;
  const prefix = prefixText === undefined ? network.bits : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > network.bits) return false;
  const shift = BigInt(network.bits - prefix);
  return address.value >> shift === network.value >> shift;
}

/** Whether `cidr` is something inRange() can use — for validating admin input. */
export function isValidRange(cidr: string): boolean {
  const [base, prefixText, extra] = cidr.split("/");
  const network = parseAddress(base);
  if (!network || extra !== undefined) return false;
  if (prefixText === undefined) return true;
  const prefix = Number(prefixText);
  return /^\d{1,3}$/.test(prefixText) && prefix >= 0 && prefix <= network.bits;
}

/** The first unexpired entry covering `ip`, if any. */
export function matchEntry(ip: string, entries: DenyEntry[], now = Date.now()): DenyEntry | null {
  for (const entry of entries) {
    if (entry.until && Date.parse(entry.until) <= now) continue;
    if (inRange(ip, entry.cidr)) return entry;
  }
  return null;
}

/** Parse the stored value defensively: a hand-edited key must not break every request. */
export function parseDenylist(value: unknown): DenyEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is DenyEntry =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as DenyEntry).cidr === "string" &&
      isValidRange((entry as DenyEntry).cidr),
  );
}

let memo: { at: number; entries: DenyEntry[] } | null = null;

/** The current list, re-read from KV at most once a minute per isolate. */
export async function loadDenylist(kv: KVNamespace, now = Date.now()): Promise<DenyEntry[]> {
  if (memo && now - memo.at < MEMO_MS) return memo.entries;
  const value = await kv.get<unknown>(DENYLIST_KEY, { type: "json", cacheTtl: KV_CACHE_SECONDS });
  memo = { at: now, entries: parseDenylist(value) };
  return memo.entries;
}

/** Forget the isolate's copy (after the admin changes the list, and in tests). */
export function resetDenylistMemo(): void {
  memo = null;
}

/** The stored list as the admin edits it: straight from KV, no edge cache, no memo. */
export async function readDenylist(kv: KVNamespace): Promise<DenyEntry[]> {
  return parseDenylist(await kv.get<unknown>(DENYLIST_KEY, { type: "json" }));
}

/** Store the list, dropping entries that have already expired; returns what was kept. */
export async function writeDenylist(
  kv: KVNamespace,
  entries: DenyEntry[],
  now = Date.now(),
): Promise<DenyEntry[]> {
  const live = entries.filter((entry) => !entry.until || Date.parse(entry.until) > now);
  await kv.put(DENYLIST_KEY, JSON.stringify(live));
  resetDenylistMemo();
  return live;
}
