// Content labels and age ratings (src/lib/content-labels.ts), their names in both languages,
// and the age check's stored answer (src/lib/age-gate.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import en from "../src/i18n/en.ts";
import vi from "../src/i18n/vi.ts";
import {
  AGE_RATINGS,
  LABEL_IDS,
  LABELS,
  labelNames,
  minAge,
  needsBlur,
  warningPrefix,
} from "../src/lib/content-labels.ts";
import {
  answer,
  decide,
  readAnswer,
  resetAnswer,
  saveAnswer,
  withAge,
  type AgeAnswer,
} from "../src/lib/age-gate.ts";

describe("content labels", () => {
  it("has a name for every label in both languages, and nothing else", () => {
    for (const dict of [vi, en]) {
      assert.deepEqual(Object.keys(dict.labels).sort(), [...LABEL_IDS].sort());
      for (const id of LABEL_IDS) assert.ok(dict.labels[id].trim(), id);
    }
  });

  it("blurs images only for the visual labels", () => {
    assert.equal(needsBlur(["politics", "spoilers"]), false);
    assert.equal(needsBlur(["politics", "blood"]), true);
    assert.equal(needsBlur(["not-a-label"]), false);
    assert.equal(needsBlur([]), false);
    assert.deepEqual(
      LABEL_IDS.filter((id) => LABELS[id].blur),
      ["horror", "blood", "jumpscare", "violence", "self-harm", "death"],
    );
  });

  it("reads the age out of a rating", () => {
    assert.deepEqual(
      AGE_RATINGS.map((rating) => minAge(rating)),
      [13, 16, 18],
    );
    assert.equal(minAge(undefined), null);
    assert.equal(minAge(null), null);
  });

  it("names labels in order, skipping unknown ones", () => {
    assert.deepEqual(labelNames(["blood", "x", "horror"], vi.labels), ["Máu me", "Kinh dị"]);
    assert.deepEqual(labelNames(["politics"], en.labels), ["Politics"]);
  });

  it("builds the feed/preview prefix, or nothing for an unlabelled item", () => {
    const strings = { prefix: vi.cw.feedPrefix, names: vi.labels };
    assert.equal(warningPrefix(["horror"], "16+", strings), "[Cảnh báo: Kinh dị · 16+] ");
    assert.equal(warningPrefix([], "18+", strings), "[Cảnh báo: 18+] ");
    assert.equal(warningPrefix([], undefined, strings), "");
  });
});

/** A Storage stand-in; `fail` makes every call throw, like blocked storage in private mode. */
function storage(fail = false) {
  const data = new Map<string, string>();
  const guard = () => {
    if (fail) throw new DOMException("blocked", "SecurityError");
  };
  return {
    data,
    getItem: (key: string) => (guard(), data.get(key) ?? null),
    setItem: (key: string, value: string) => (guard(), void data.set(key, value)),
    removeItem: (key: string) => (guard(), void data.delete(key)),
  };
}

const none: AgeAnswer = { v: 1, ok: null, no: null };

describe("age check", () => {
  it("asks until answered, then allows or denies by threshold", () => {
    assert.equal(decide(none, 16), "ask");
    const sixteen = answer(none, 16, true);
    assert.deepEqual(sixteen, { v: 1, ok: 16, no: null });
    assert.equal(decide(sixteen, 13), "allow");
    assert.equal(decide(sixteen, 16), "allow");
    assert.equal(decide(sixteen, 18), "ask"); // 16+ says nothing about 18+
    const notEighteen = answer(sixteen, 18, false);
    assert.deepEqual(notEighteen, { v: 1, ok: 16, no: 18 });
    assert.equal(decide(notEighteen, 18), "deny");
    assert.equal(decide(notEighteen, 16), "allow");
  });

  it("lets a newer answer override an older one", () => {
    const notSixteen = answer(none, 16, false);
    assert.equal(decide(notSixteen, 18), "deny"); // under 16 is under 18 too
    assert.equal(decide(notSixteen, 13), "ask");
    const eighteen = answer(notSixteen, 18, true);
    assert.deepEqual(eighteen, { v: 1, ok: 18, no: null });
    assert.deepEqual(answer(eighteen, 13, false), { v: 1, ok: null, no: 13 });
  });

  it("stores only thresholds, reads garbage as unanswered, and survives blocked storage", () => {
    const store = storage();
    assert.equal(saveAnswer(store, answer(none, 18, true)), true);
    assert.equal(store.data.get("ageGate"), '{"v":1,"ok":18,"no":null}');
    assert.deepEqual(readAnswer(store), { v: 1, ok: 18, no: null });
    for (const raw of ["not json", "null", '{"v":2,"ok":18}', '{"v":1,"ok":"18","no":-1}']) {
      store.data.set("ageGate", raw);
      assert.deepEqual(readAnswer(store), none, raw);
    }
    resetAnswer(store);
    assert.equal(store.data.has("ageGate"), false);

    const blocked = storage(true);
    assert.deepEqual(readAnswer(blocked), none);
    assert.equal(saveAnswer(blocked, none), false);
    assert.doesNotThrow(() => resetAnswer(blocked));
    assert.equal(saveAnswer(null, none), false);
    assert.deepEqual(readAnswer(null), none);
  });

  it("fills the age into the dictionaries' strings", () => {
    assert.equal(withAge(vi.cw.question, 16), "Bạn đã đủ 16 tuổi?");
    assert.equal(withAge(en.cw.yes, 18), "Yes, I'm 18 or older");
  });
});
