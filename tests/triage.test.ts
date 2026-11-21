// Maintenance-mode triage (scripts/triage.mjs): which issues and pull requests the bot closes
// as feature requests, and which it must leave alone.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { closingComment, decide, LABELS } from "../scripts/triage.mjs";

const outsider = { labels: [] as string[], author: "someone", association: "NONE" };

describe("triage", () => {
  it("closes clear feature requests, in either language", () => {
    for (const title of [
      "feat: dark mode for the admin",
      "feat(ui)!: new home page",
      "[Feature] Comments under posts",
      "[đề xuất] thêm trang tìm kiếm nâng cao",
      "Feature request: RSS for the gallery",
      "Add a feature to export posts",
      "Đề xuất tính năng: chế độ đọc to",
      "Thêm tính năng bình luận",
      "Tính năng mới: newsletter",
    ]) {
      assert.equal(decide({ ...outsider, title }).action, "close", title);
    }
    assert.equal(
      decide({ ...outsider, title: "Comments please", labels: ["Enhancement"] }).action,
      "close",
    );
  });

  it("leaves bugs, fixes and questions alone, even when they say 'add'", () => {
    for (const title of [
      "[web-report] Menu does not close on iPhone",
      "[a11y] Focus lost after closing the viewer",
      "fix: wrong date on the now page",
      "Typo in the privacy policy (vi)",
      "Please add alt text to the gallery cover",
      "How do I run the site locally?",
      "Lỗi chính tả trong trang giới thiệu",
    ]) {
      assert.equal(decide({ ...outsider, title }).action, "none", title);
    }
  });

  it("never closes the owner's items, bots, exceptions, or anything already closed", () => {
    const title = "feat: something new";
    assert.equal(decide({ ...outsider, title, association: "OWNER" }).reason, "trusted author");
    assert.equal(decide({ ...outsider, title, author: "dependabot[bot]" }).reason, "bot");
    assert.equal(
      decide({ ...outsider, title, labels: ["maintenance-exception"] }).reason,
      "owner's exception",
    );
    assert.equal(
      decide({ ...outsider, title, sender: "poli0981", owner: "poli0981" }).reason,
      "the owner acted on it",
    );
    assert.equal(decide({ ...outsider, title, state: "closed" }).reason, "not open");
    assert.equal(decide({ ...outsider, title, state: "open" }).action, "close");
  });

  it("explains itself in Vietnamese and English and links the policy", () => {
    const issue = closingComment("issue");
    assert.match(issue, /chế độ bảo trì/);
    assert.match(issue, /maintenance mode/);
    assert.match(issue, /this issue was closed/);
    assert.match(closingComment("pull_request"), /this pull request was closed/);
    assert.match(issue, /CONTRIBUTING\.md/);
    assert.deepEqual(Object.values(LABELS), [
      "enhancement",
      "out-of-scope",
      "maintenance-exception",
    ]);
  });
});
