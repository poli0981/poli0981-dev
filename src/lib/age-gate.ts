// The age check on age-rated pages (src/components/AgeGate.astro): the reader says whether they
// are old enough, and the answer is remembered in THIS browser only — localStorage, never a
// cookie, never sent anywhere. It stores the age thresholds answered, not an age or a birth date:
//   ok = the highest age the reader confirmed ("I am 16 or older" → 16)
//   no = the lowest age they said they are NOT ("I am not 18 yet" → 18)
// It is a courtesy check, not age verification: anyone can answer anything, and without
// JavaScript the folded text simply opens.

const KEY = "ageGate";

export interface AgeAnswer {
  v: 1;
  ok: number | null;
  no: number | null;
}

export type AgeDecision = "allow" | "deny" | "ask";

const EMPTY: AgeAnswer = { v: 1, ok: null, no: null };

type ReadStore = Pick<Storage, "getItem">;
type WriteStore = Pick<Storage, "setItem" | "removeItem">;

const isAge = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0 && value < 100;

/** The stored answer; anything missing, unreadable or malformed reads as "never answered". */
export function readAnswer(storage: ReadStore | null): AgeAnswer {
  try {
    const raw = storage?.getItem(KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (typeof value !== "object" || value === null || (value as { v?: unknown }).v !== 1) {
      return EMPTY;
    }
    const { ok, no } = value as { ok?: unknown; no?: unknown };
    return { v: 1, ok: isAge(ok) ? ok : null, no: isAge(no) ? no : null };
  } catch {
    return EMPTY; // storage blocked (private mode) or not JSON
  }
}

/** What to do for a page that asks for `age`, given the stored answer. */
export function decide(answer: AgeAnswer, age: number): AgeDecision {
  if (answer.ok !== null && answer.ok >= age) return "allow";
  if (answer.no !== null && answer.no <= age) return "deny";
  return "ask";
}

/** The answer after the reader says yes or no to `age`; a new answer overrides an older one. */
export function answer(previous: AgeAnswer, age: number, yes: boolean): AgeAnswer {
  if (yes) {
    const ok = Math.max(previous.ok ?? 0, age);
    // "Not 18" no longer stands once they say they are 18 or older.
    return { v: 1, ok, no: previous.no !== null && previous.no <= ok ? null : previous.no };
  }
  const no = Math.min(previous.no ?? Number.POSITIVE_INFINITY, age);
  return { v: 1, ok: previous.ok !== null && previous.ok >= no ? null : previous.ok, no };
}

/** Remember an answer; false when the browser refuses (the choice then lasts for this page). */
export function saveAnswer(storage: WriteStore | null, value: AgeAnswer): boolean {
  try {
    if (!storage) return false;
    storage.setItem(KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Forget every answer ("Đặt lại"). */
export function resetAnswer(storage: WriteStore | null): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    /* storage blocked: nothing was stored either */
  }
}

/** Fill `{age}` in a string from the dictionaries. */
export const withAge = (text: string, age: number) => text.replaceAll("{age}", String(age));
