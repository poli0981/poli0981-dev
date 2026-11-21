// Where a content change is on its way to the live site, as one word for the admin. Shared
// by /api/admin/publish (which computes it) and the PublishBar and Dashboard (which show it),
// so "published" can no longer mean "merged into main" while production still runs the old
// content — the symptom behind the Oct 2026 "content pushed but not on the web".
//
//   content repo main ──dispatch──▶ content/bump PR ──build──▶ merged into site main ──deploy──▶ live
//                      (pending)        (building · review · failed)        (deploying)        (live)

export type PublishPhase = "live" | "pending" | "building" | "review" | "deploying" | "failed";

export interface PhaseInput {
  /** poli0981/content main. */
  contentHead: string;
  /** The content commit the site repo's main points at (src/content gitlink). */
  published: string;
  /** The content commit the running Worker was built with; null when unknown (local dev). */
  live: string | null;
  pr: { autoMerge: boolean; checks: "pending" | "success" | "failure" | null } | null;
  run: { status: string; conclusion: string | null } | null;
}

const RUNNING = new Set(["queued", "in_progress", "requested", "waiting", "pending"]);

export function publishPhase(status: PhaseInput): PublishPhase {
  // Without a build-time content commit, main's pointer is the best available stand-in.
  const live = status.live ?? status.published;
  if (live === status.contentHead) return "live";
  const { pr, run } = status;
  if (pr) {
    if (pr.checks === "failure") return "failed";
    // content-bump.yml leaves auto-merge off when the publish touches .mdx (code at build time).
    return pr.autoMerge ? "building" : "review";
  }
  if (run && RUNNING.has(run.status)) return "building";
  if (status.published === status.contentHead) return "deploying";
  if (run?.conclusion === "failure") return "failed";
  return "pending";
}

/** How each phase reads in the admin (Vietnamese), and the tone of its badge. */
export const PHASE_TEXT: Record<
  PublishPhase,
  { label: string; tone: "ok" | "warn" | "err" | "info" }
> = {
  live: { label: "đã lên web", tone: "ok" },
  pending: { label: "có thay đổi chưa xuất bản", tone: "warn" },
  building: { label: "đang build…", tone: "info" },
  review: { label: "chờ duyệt (có file .mdx)", tone: "warn" },
  deploying: { label: "đã merge — đang deploy…", tone: "info" },
  failed: { label: "xuất bản lỗi", tone: "err" },
};

/** Phases in which nothing is moving, so starting a publish by hand makes sense. */
export const canPublish = (phase: PublishPhase) => phase === "pending" || phase === "failed";

/**
 * The admin's toast after a save or delete, from the `publish` field the API returns
 * ("queued" | "failed", lib/admin/autopublish). `done` says what happened, e.g. "Đã lưu".
 */
export function afterSaveMessage(
  publish: unknown,
  done: string,
): { text: string; kind: "ok" | "info"; queued: boolean } {
  return publish === "queued"
    ? {
        text: `${done} — đang tự xuất bản, thường lên web sau 10–15 phút.`,
        kind: "ok",
        queued: true,
      }
    : {
        text: `${done}, nhưng chưa tự xuất bản được — bấm “Xuất bản” trên thanh trên cùng.`,
        kind: "info",
        queued: false,
      };
}
