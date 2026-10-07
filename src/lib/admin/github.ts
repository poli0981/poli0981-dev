// GitHub access for the admin, with two fine-grained tokens — a fine-grained token's
// permissions apply to EVERY repository it covers, so one token can't be "write here,
// dispatch only there":
//  - GITHUB_CONTENT_TOKEN: only poli0981/content, Contents read & write (saves);
//  - GITHUB_PUBLISH_TOKEN: only poli0981/poli0981-dev, Actions read & write (dispatches
//    .github/workflows/content-bump.yml). It has no Contents permission, so even leaked
//    it can't push code here. Status reads need nothing: both repos are public.

const API = "https://api.github.com";
const CONTENT_REPO = { owner: "poli0981", name: "content" } as const;
const SITE_REPO = { owner: "poli0981", name: "poli0981-dev" } as const;
const BRANCH = "main";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** What GitHub says the call needed (X-Accepted-GitHub-Permissions), e.g. "contents=write". */
    readonly needs: string | null = null,
  ) {
    super(message);
  }
}

/** The content changed under us since the editor loaded it. */
export class ConflictError extends Error {}

async function request<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "poli0981-admin",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GitHubError(
      `GitHub ${init.method ?? "GET"} ${path} → ${res.status} ${detail.slice(0, 300)}`,
      res.status,
      res.headers.get("x-accepted-github-permissions"),
    );
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

async function graphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const data = await request<{ data?: T; errors?: { message: string }[] }>(token, "/graphql", {
    method: "POST",
    body: JSON.stringify({ query, variables }),
  });
  if (data.errors?.length || !data.data) {
    throw new GitHubError(`GitHub GraphQL: ${data.errors?.map((e) => e.message).join("; ")}`, 502);
  }
  return data.data;
}

export interface RepoFile {
  path: string;
  /** Git blob sha — the optimistic-concurrency token for edits. */
  sha: string;
  text: string;
}

interface TreeEntry {
  path: string;
  type: string;
  object: { oid?: string; text?: string | null; entries?: TreeEntry[] } | null;
}

/**
 * Every text file of the content repo's main branch, in ONE GraphQL request (three
 * directory levels: collection/series/file), plus the commit it was read at.
 */
export async function listContentFiles(
  token: string,
): Promise<{ head: string; files: RepoFile[] }> {
  const blob = "... on Blob { oid text }";
  const level = (inner: string) => `entries { path type object { ${blob} ${inner} } }`;
  const query = `query($owner: String!, $name: String!, $expr: String!) {
    repository(owner: $owner, name: $name) {
      ref(qualifiedName: "refs/heads/${BRANCH}") { target { oid } }
      object(expression: $expr) { ... on Tree {
        ${level(`... on Tree { ${level(`... on Tree { ${level("")} }`)} }`)}
      } }
    }
  }`;
  const data = await graphql<{
    repository: { ref: { target: { oid: string } }; object: { entries: TreeEntry[] } };
  }>(token, query, { ...CONTENT_REPO, expr: `${BRANCH}:` });

  const files: RepoFile[] = [];
  const walk = (entries: TreeEntry[]) => {
    for (const entry of entries) {
      if (entry.type === "tree" && entry.object?.entries) walk(entry.object.entries);
      else if (
        entry.type === "blob" &&
        entry.object?.oid &&
        typeof entry.object.text === "string"
      ) {
        files.push({ path: entry.path, sha: entry.object.oid, text: entry.object.text });
      }
    }
  };
  walk(data.repository.object.entries);
  return { head: data.repository.ref.target.oid, files };
}

/** One file of the content repo at main, or null if it doesn't exist. */
export async function readContentFile(token: string, path: string): Promise<RepoFile | null> {
  try {
    const file = await request<{ sha: string; content: string; encoding: string }>(
      token,
      `/repos/${CONTENT_REPO.owner}/${CONTENT_REPO.name}/contents/${encodeURI(path)}?ref=${BRANCH}`,
    );
    const bytes = Uint8Array.from(atob(file.content.replace(/\n/g, "")), (c) => c.charCodeAt(0));
    return { path, sha: file.sha, text: new TextDecoder().decode(bytes) };
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return null;
    throw error;
  }
}

export interface FileChange {
  path: string;
  /** New text, or null to delete the file. */
  text: string | null;
  /** Blob sha the editor started from; null = the file must not exist yet. */
  expectSha: string | null;
}

/**
 * Commit several files to the content repo's main branch atomically (Git Data API:
 * tree → commit → fast-forward ref). Refuses with ConflictError when any file isn't at
 * the sha the caller expects; retries once if main moved between read and update.
 */
export async function commitContent(
  token: string,
  message: string,
  changes: FileChange[],
): Promise<string> {
  const repo = `/repos/${CONTENT_REPO.owner}/${CONTENT_REPO.name}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ref = await request<{ object: { sha: string } }>(
      token,
      `${repo}/git/ref/heads/${BRANCH}`,
    );
    const head = ref.object.sha;
    const commit = await request<{ tree: { sha: string } }>(token, `${repo}/git/commits/${head}`);

    for (const change of changes) {
      const current = await readContentFile(token, change.path);
      if ((current?.sha ?? null) !== change.expectSha) {
        throw new ConflictError(`${change.path} changed since it was opened`);
      }
    }

    const tree = await request<{ sha: string }>(token, `${repo}/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: commit.tree.sha,
        tree: changes.map((change) =>
          change.text === null
            ? { path: change.path, mode: "100644", type: "blob", sha: null }
            : { path: change.path, mode: "100644", type: "blob", content: change.text },
        ),
      }),
    });
    const created = await request<{ sha: string }>(token, `${repo}/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message, tree: tree.sha, parents: [head] }),
    });
    try {
      await request(token, `${repo}/git/refs/heads/${BRANCH}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: created.sha, force: false }),
      });
      return created.sha;
    } catch (error) {
      // 422 = not a fast-forward: someone pushed in between. Re-read and try once more.
      if (!(error instanceof GitHubError && error.status === 422) || attempt === 1) throw error;
    }
  }
  throw new GitHubError("unreachable", 500);
}

export interface PublishStatus {
  contentHead: string;
  /** The content commit the live site is built from (gitlink in the site repo's main). */
  published: string;
  pr: {
    number: number;
    url: string;
    autoMerge: boolean;
    checks: "pending" | "success" | "failure" | null;
  } | null;
  run: { status: string; conclusion: string | null; url: string } | null;
}

export async function publishStatus(token: string): Promise<PublishStatus> {
  const site = `/repos/${SITE_REPO.owner}/${SITE_REPO.name}`;
  const [contentRef, gitlink, pulls, runs] = await Promise.all([
    request<{ object: { sha: string } }>(
      token,
      `/repos/${CONTENT_REPO.owner}/${CONTENT_REPO.name}/git/ref/heads/${BRANCH}`,
    ),
    request<{ sha: string }>(token, `${site}/contents/src/content?ref=${BRANCH}`),
    request<{ number: number; html_url: string; auto_merge: unknown; head: { sha: string } }[]>(
      token,
      `${site}/pulls?state=open&head=${SITE_REPO.owner}:content/bump`,
    ),
    request<{ workflow_runs: { status: string; conclusion: string | null; html_url: string }[] }>(
      token,
      `${site}/actions/workflows/content-bump.yml/runs?per_page=1`,
    ),
  ]);

  let pr: PublishStatus["pr"] = null;
  const open = pulls[0];
  if (open) {
    const checks = await request<{
      check_runs: { name: string; status: string; conclusion: string | null }[];
    }>(token, `${site}/commits/${open.head.sha}/check-runs?check_name=build`);
    const build = checks.check_runs[0];
    pr = {
      number: open.number,
      url: open.html_url,
      autoMerge: Boolean(open.auto_merge),
      checks: !build
        ? null
        : build.status !== "completed"
          ? "pending"
          : build.conclusion === "success"
            ? "success"
            : "failure",
    };
  }
  const last = runs.workflow_runs[0];
  return {
    contentHead: contentRef.object.sha,
    published: gitlink.sha,
    pr,
    run: last ? { status: last.status, conclusion: last.conclusion, url: last.html_url } : null,
  };
}

/** Start the publish workflow (bump the submodule PR on the site repo). */
export async function dispatchPublish(token: string): Promise<void> {
  await request(
    token,
    `/repos/${SITE_REPO.owner}/${SITE_REPO.name}/actions/workflows/content-bump.yml/dispatches`,
    {
      method: "POST",
      body: JSON.stringify({ ref: BRANCH }),
    },
  );
}
