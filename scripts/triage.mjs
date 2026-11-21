/**
 * Maintenance-mode triage (CONTRIBUTING.md): an issue or pull request that asks for a new
 * feature is labelled and closed with an explanation; everything else is left for the owner.
 * .github/workflows/triage.yml runs this through actions/github-script, from the default
 * branch — never from a pull request's own code.
 *
 * Deliberately narrow: only clear signals count (the title, or a label the reporter could not
 * set by accident). A bug report that happens to say "add" is not a feature request.
 */

export const LABELS = {
  /** Marks a feature request (GitHub's default label, reused). */
  feature: "enhancement",
  /** Closed because new features are out of scope while the project is in maintenance mode. */
  closed: "out-of-scope",
  /** The owner's exception: the bot leaves the item alone. */
  exception: "maintenance-exception",
};

const FEATURE_TITLES = [
  /^\s*feat(\([^)]*\))?!?:/i, // conventional commits: "feat: …", "feat(ui)!: …"
  /^\s*\[\s*(feat|feature|features|enhancement|request|idea|tính năng|đề xuất)\b[^\]]*\]/iu,
  /\bfeature[\s-]+request\b/i,
  /\b(new|add(ing)?\s+a?)\s*feature\b/i,
  /(đề xuất|yêu cầu|thêm|bổ sung)\s+tính năng|tính năng mới/iu,
];

/** People whose items are never closed: the owner and collaborators, and bots. */
const TRUSTED = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/**
 * What to do with one issue or pull request.
 *
 * @param {{ title: string, labels: string[], author: string, association?: string,
 *           sender?: string, owner?: string, state?: string }} item
 *   `association` is the author's (GitHub's author_association); `sender` is whoever
 *   triggered the event, so the owner reopening or relabelling an item is never undone.
 * @returns {{ action: "close" | "none", reason: string }}
 */
export function decide(item) {
  const labels = item.labels.map((label) => label.toLowerCase());
  if (item.state && item.state !== "open") return { action: "none", reason: "not open" };
  if (labels.includes(LABELS.exception)) return { action: "none", reason: "owner's exception" };
  if (TRUSTED.has(item.association ?? "")) return { action: "none", reason: "trusted author" };
  if (/\[bot\]$/.test(item.author)) return { action: "none", reason: "bot" };
  if (item.sender && item.owner && item.sender === item.owner) {
    return { action: "none", reason: "the owner acted on it" };
  }
  if (labels.includes(LABELS.feature)) return { action: "close", reason: "labelled as a feature" };
  if (FEATURE_TITLES.some((pattern) => pattern.test(item.title))) {
    return { action: "close", reason: "the title asks for a feature" };
  }
  return { action: "none", reason: "not a feature request" };
}

/** The comment left on a closed item, in both of the project's languages. */
export function closingComment(kind) {
  const what = kind === "pull_request" ? "pull request" : "issue";
  return [
    "**Vietnamese / Tiếng Việt** — Cảm ơn bạn! Dự án đang ở **chế độ bảo trì**: không nhận tính năng",
    "mới. Repo chỉ nhận cập nhật dependency, vá bảo mật, nâng cấp runtime/framework, sửa lỗi (kể",
    "cả UI/UX và accessibility) và sửa lỗi ngôn ngữ. Vì vậy mục này được đóng tự động. Nếu bạn",
    "nghĩ đây là lỗi chứ không phải tính năng mới, hãy trả lời bên dưới — chủ repo sẽ xem lại.",
    "",
    `**English** — Thank you! This project is in **maintenance mode** and does not take new`,
    `features. It accepts dependency updates, security fixes, runtime/framework upgrades, bug fixes`,
    `(including UI/UX and accessibility) and language fixes, so this ${what} was closed`,
    `automatically. If you think it is a bug rather than a new feature, reply below and the owner`,
    `will take another look.`,
    "",
    "→ [CONTRIBUTING.md](https://github.com/poli0981/poli0981-dev/blob/main/CONTRIBUTING.md)",
  ].join("\n");
}
