/**
 * The few GitHub REST calls the update ops make (module-ops.yml), with the
 * short-lived Meet Dream AI token from `ops/session`. Injected fetch, so the
 * merge logic is tested against a fake API (merge.test.ts).
 */

export interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  createdAt: string;
  headRef: string;
  headSha: string;
  baseRef: string;
  labels: string[];
  /** GitHub's mergeability: clean | blocked | dirty | unstable | behind | unknown … */
  mergeableState: string;
  mergeCommitSha: string | null;
}

export interface PrFile {
  filename: string;
  status: string;
  patch?: string;
}

export interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
}

/**
 * A commit status (the older API). Vercel and many CI tools report here
 * instead of as check runs, so "all checks passed" must read both.
 */
export interface CommitStatus {
  context: string;
  state: string;
}

export interface GitHubClient {
  listOpenPulls(): Promise<PullRequest[]>;
  getPull(number: number): Promise<PullRequest>;
  listFiles(number: number): Promise<PrFile[]>;
  listCheckRuns(sha: string): Promise<CheckRun[]>;
  /** The latest status per context for `sha` (GET …/commits/{sha}/status). */
  listStatuses(sha: string): Promise<CommitStatus[]>;
  merge(
    number: number,
    method: "merge" | "squash",
    sha: string,
  ): Promise<{ merged: boolean; sha: string | null; message: string }>;
  addLabels(number: number, labels: string[]): Promise<void>;
  comment(number: number, body: string): Promise<void>;
  deploymentStates(sha: string): Promise<string[]>;
}

interface RawPull {
  number: number;
  title: string;
  body: string | null;
  created_at: string;
  head: { ref: string; sha: string };
  base: { ref: string };
  labels: { name: string }[];
  mergeable_state?: string;
  merge_commit_sha?: string | null;
}

function toPull(raw: RawPull): PullRequest {
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body,
    createdAt: raw.created_at,
    headRef: raw.head.ref,
    headSha: raw.head.sha,
    baseRef: raw.base.ref,
    labels: raw.labels.map((l) => l.name),
    mergeableState: raw.mergeable_state ?? "unknown",
    mergeCommitSha: raw.merge_commit_sha ?? null,
  };
}

export function githubClient(opts: {
  repo: string;
  token: string;
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}): GitHubClient {
  const base = `${(opts.apiUrl ?? "https://api.github.com").replace(/\/$/, "")}/repos/${opts.repo}`;
  const fetchImpl = opts.fetchImpl ?? fetch;

  async function call<T>(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const res = await fetchImpl(`${base}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${opts.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const text = await res.text();
    const json: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const message =
        (json as { message?: string } | null)?.message ?? `HTTP ${res.status}`;
      throw new GitHubError(res.status, `${path}: ${message}`);
    }
    return json as T;
  }

  async function paged<T>(path: string, key?: string): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= 10; page++) {
      const sep = path.includes("?") ? "&" : "?";
      const data = await call<unknown>(
        `${path}${sep}per_page=100&page=${page}`,
      );
      const items = (
        key ? (data as Record<string, unknown>)[key] : data
      ) as T[];
      out.push(...items);
      if (items.length < 100) break;
    }
    return out;
  }

  return {
    async listOpenPulls() {
      return (await paged<RawPull>("/pulls?state=open&sort=created")).map(
        toPull,
      );
    },
    async getPull(number) {
      return toPull(await call<RawPull>(`/pulls/${number}`));
    },
    async listFiles(number) {
      return await paged<PrFile>(`/pulls/${number}/files`);
    },
    async listCheckRuns(sha) {
      return await paged<CheckRun>(`/commits/${sha}/check-runs`, "check_runs");
    },
    async listStatuses(sha) {
      const res = await call<{ statuses?: CommitStatus[] }>(
        `/commits/${sha}/status?per_page=100`,
      );
      return res.statuses ?? [];
    },
    async merge(number, method, sha) {
      try {
        const res = await call<{
          merged: boolean;
          sha?: string;
          message: string;
        }>(`/pulls/${number}/merge`, {
          method: "PUT",
          body: { merge_method: method, sha },
        });
        return {
          merged: res.merged,
          sha: res.sha ?? null,
          message: res.message,
        };
      } catch (err) {
        if (err instanceof GitHubError && [405, 409].includes(err.status)) {
          return { merged: false, sha: null, message: err.message };
        }
        throw err;
      }
    },
    async addLabels(number, labels) {
      await call(`/issues/${number}/labels`, {
        method: "POST",
        body: { labels },
      });
    },
    async comment(number, body) {
      await call(`/issues/${number}/comments`, {
        method: "POST",
        body: { body },
      });
    },
    async deploymentStates(sha) {
      const deployments = await call<{ id: number; environment: string }[]>(
        `/deployments?sha=${sha}&per_page=20`,
      );
      const production = deployments.filter((d) => /prod/i.test(d.environment));
      const states: string[] = [];
      for (const d of production) {
        const statuses = await call<{ state: string }[]>(
          `/deployments/${d.id}/statuses?per_page=1`,
        );
        if (statuses[0]) states.push(statuses[0].state);
      }
      return states;
    },
  };
}

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}
