// Where a content change is on its way to the live site (lib/admin/publish-phase), and the
// admin's toast after a save.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  afterSaveMessage,
  canPublish,
  PHASE_TEXT,
  publishPhase,
  type PhaseInput,
} from "../src/lib/admin/publish-phase.ts";

const base: PhaseInput = {
  contentHead: "c2",
  published: "c1",
  live: "c1",
  pr: null,
  run: null,
};

describe("publishPhase", () => {
  it("is live once the running build has the content head", () => {
    assert.equal(publishPhase({ ...base, published: "c2", live: "c2" }), "live");
    // Unknown build-time content commit (local dev): main's pointer stands in for it.
    assert.equal(publishPhase({ ...base, published: "c2", live: null }), "live");
  });

  it("follows the bump PR: building, waiting for review, or failed", () => {
    const pr = (autoMerge: boolean, checks: "pending" | "success" | "failure" | null) =>
      publishPhase({ ...base, pr: { autoMerge, checks } });
    assert.equal(pr(true, "pending"), "building");
    assert.equal(pr(true, "success"), "building");
    assert.equal(pr(true, null), "building");
    assert.equal(pr(false, "success"), "review");
    assert.equal(pr(true, "failure"), "failed");
  });

  it("is building while the workflow runs, before any PR exists", () => {
    assert.equal(
      publishPhase({ ...base, run: { status: "in_progress", conclusion: null } }),
      "building",
    );
    assert.equal(
      publishPhase({ ...base, run: { status: "queued", conclusion: null } }),
      "building",
    );
  });

  it("is deploying when main has the content but the running build doesn't", () => {
    assert.equal(publishPhase({ ...base, published: "c2", live: "c1" }), "deploying");
  });

  it("reports a failed last run, and plain pending changes otherwise", () => {
    assert.equal(
      publishPhase({ ...base, run: { status: "completed", conclusion: "failure" } }),
      "failed",
    );
    assert.equal(
      publishPhase({ ...base, run: { status: "completed", conclusion: "success" } }),
      "pending",
    );
    assert.equal(publishPhase(base), "pending");
  });

  it("offers a manual publish only when nothing is moving", () => {
    assert.deepEqual((Object.keys(PHASE_TEXT) as (keyof typeof PHASE_TEXT)[]).filter(canPublish), [
      "pending",
      "failed",
    ]);
  });
});

describe("afterSaveMessage", () => {
  it("says the change is on its way, or how to publish it by hand", () => {
    const queued = afterSaveMessage("queued", "Đã lưu");
    assert.equal(queued.queued, true);
    assert.equal(queued.kind, "ok");
    assert.match(queued.text, /^Đã lưu — đang tự xuất bản/);
    for (const other of ["failed", undefined]) {
      const message = afterSaveMessage(other, "Đã xoá album");
      assert.equal(message.queued, false);
      assert.equal(message.kind, "info");
      assert.match(message.text, /^Đã xoá album, nhưng chưa tự xuất bản được/);
    }
  });
});
