// A fake GitHub API holding the poli0981/content repo in memory — enough REST, Git Data and
// GraphQL for src/lib/admin/github.ts — wired up through mockFetch().
import { jsonResponse, mockFetch, type FetchCall } from "./fakes.ts";

const CONTENT = "/repos/poli0981/content";
const SITE = "/repos/poli0981/poli0981-dev";

const shaOf = (text: string) => {
  let hash = 0;
  for (const char of text) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return `sha-${(hash >>> 0).toString(16)}`;
};

const toBase64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

export class FakeGitHub {
  readonly files = new Map<string, string>();
  head = "commit-0";
  commits = 0;
  /** Make the next ref update answer 422 (someone pushed in between) this many times. */
  raceRefUpdates = 0;
  /** Answer every call with this status (e.g. 403 for a token without permission). */
  failAll: { status: number; needs?: string } | null = null;
  publishedSha = "commit-0";
  openPr: { number: number; headSha: string; autoMerge: boolean } | null = null;
  buildCheck: { status: string; conclusion: string | null } | null = null;
  lastRun: { status: string; conclusion: string | null } | null = null;
  readonly dispatched: string[] = [];
  readonly calls: FetchCall[];
  readonly restore: () => void;

  constructor(files: Record<string, string> = {}) {
    for (const [path, text] of Object.entries(files)) this.files.set(path, text);
    const mock = mockFetch((call) => this.route(call));
    this.calls = mock.calls;
    this.restore = mock.restore;
  }

  sha(path: string): string | null {
    const text = this.files.get(path);
    return text === undefined ? null : shaOf(text);
  }

  private route(call: FetchCall): Response {
    const url = new URL(call.url);
    if (url.origin !== "https://api.github.com") throw new Error(`unexpected fetch ${call.url}`);
    if (this.failAll) {
      return jsonResponse(
        { message: "Resource not accessible by personal access token" },
        this.failAll.status,
        {
          ...(this.failAll.needs ? { "x-accepted-github-permissions": this.failAll.needs } : {}),
        },
      );
    }
    const path = decodeURIComponent(url.pathname);
    const body = call.body ? (JSON.parse(call.body) as Record<string, unknown>) : {};

    if (path === "/graphql") return jsonResponse({ data: this.graphqlTree() });

    if (path.startsWith(`${CONTENT}/contents/`)) {
      const file = path.slice(`${CONTENT}/contents/`.length);
      const text = this.files.get(file);
      if (text === undefined) return jsonResponse({ message: "Not Found" }, 404);
      return jsonResponse({ sha: shaOf(text), content: toBase64(text), encoding: "base64" });
    }
    if (path === `${CONTENT}/git/ref/heads/main`)
      return jsonResponse({ object: { sha: this.head } });
    if (path.startsWith(`${CONTENT}/git/commits/`))
      return jsonResponse({ tree: { sha: `tree-of-${this.head}` } });
    if (path === `${CONTENT}/git/trees` && call.method === "POST") {
      this.pendingTree = body.tree as { path: string; sha?: null; content?: string }[];
      return jsonResponse({ sha: "new-tree" }, 201);
    }
    if (path === `${CONTENT}/git/commits` && call.method === "POST") {
      return jsonResponse({ sha: `commit-${this.commits + 1}`, message: body.message }, 201);
    }
    if (path === `${CONTENT}/git/refs/heads/main` && call.method === "PATCH") {
      if (this.raceRefUpdates > 0) {
        this.raceRefUpdates -= 1;
        return jsonResponse({ message: "Update is not a fast forward" }, 422);
      }
      for (const entry of this.pendingTree) {
        if (entry.content === undefined) this.files.delete(entry.path);
        else this.files.set(entry.path, entry.content);
      }
      this.commits += 1;
      this.head = String(body.sha);
      return jsonResponse({ object: { sha: this.head } });
    }

    if (path === `${SITE}/contents/src/content`) return jsonResponse({ sha: this.publishedSha });
    if (path === `${SITE}/pulls`) {
      return jsonResponse(
        this.openPr
          ? [
              {
                number: this.openPr.number,
                html_url: `https://github.com/poli0981/poli0981-dev/pull/${this.openPr.number}`,
                auto_merge: this.openPr.autoMerge ? { method: "squash" } : null,
                head: { sha: this.openPr.headSha },
              },
            ]
          : [],
      );
    }
    if (path.startsWith(`${SITE}/commits/`) && path.endsWith("/check-runs")) {
      return jsonResponse({
        check_runs: this.buildCheck ? [{ name: "build", ...this.buildCheck }] : [],
      });
    }
    if (path === `${SITE}/actions/workflows/content-bump.yml/runs`) {
      return jsonResponse({
        workflow_runs: this.lastRun
          ? [{ ...this.lastRun, html_url: "https://github.com/run/1" }]
          : [],
      });
    }
    if (
      path === `${SITE}/actions/workflows/content-bump.yml/dispatches` &&
      call.method === "POST"
    ) {
      this.dispatched.push(String(body.ref));
      return new Response(null, { status: 204 });
    }
    throw new Error(`FakeGitHub: unhandled ${call.method} ${path}`);
  }

  private pendingTree: { path: string; sha?: null; content?: string }[] = [];

  /** The GraphQL tree query's answer: collection/series/file, three levels deep. */
  private graphqlTree() {
    type Node = { path: string; type: string; object: Record<string, unknown> };
    const root: Node[] = [];
    const dirs = new Map<string, Node[]>([["", root]]);
    const ensureDir = (dir: string): Node[] => {
      const existing = dirs.get(dir);
      if (existing) return existing;
      const parent = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "";
      const entries: Node[] = [];
      ensureDir(parent).push({ path: dir, type: "tree", object: { entries } });
      dirs.set(dir, entries);
      return entries;
    };
    for (const [path, text] of [...this.files.entries()].sort()) {
      const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      ensureDir(dir).push({ path, type: "blob", object: { oid: shaOf(text), text } });
    }
    return { repository: { ref: { target: { oid: this.head } }, object: { entries: root } } };
  }
}
