import type {
  ExternalIssue,
  IssueTrackerProvider,
  ProviderContext,
  StateCategory,
} from "./types";
import { ProviderError } from "./types";

/**
 * GitHub, through the repository connected with the Meet Dream AI GitHub App
 * (ctx.host.github — the host mints the token; this code never sees it).
 * Issues map to the shared categories:
 *   open → unstarted, or started when it carries an "in progress" label;
 *   closed (completed) → completed; closed (not planned / duplicate) → canceled.
 */

export interface GithubIssue {
  number: number;
  html_url: string;
  title: string;
  state: "open" | "closed";
  state_reason?: "completed" | "not_planned" | "reopened" | "duplicate" | null;
  labels?: ({ name?: string } | string)[];
  updated_at: string;
  pull_request?: unknown;
}

const labelNames = (issue: GithubIssue) =>
  (issue.labels ?? [])
    .map((l) => (typeof l === "string" ? l : (l.name ?? "")))
    .filter(Boolean);

export function githubCategory(
  issue: GithubIssue,
  inProgressLabels: string[],
): StateCategory {
  if (issue.state === "closed") {
    return issue.state_reason === "not_planned" ||
      issue.state_reason === "duplicate"
      ? "canceled"
      : "completed";
  }
  const wanted = new Set(inProgressLabels.map((l) => l.toLowerCase()));
  return labelNames(issue).some((l) => wanted.has(l.toLowerCase()))
    ? "started"
    : "unstarted";
}

export function toExternal(
  issue: GithubIssue,
  inProgressLabels: string[],
): ExternalIssue {
  const category = githubCategory(issue, inProgressLabels);
  return {
    provider: "github",
    externalId: String(issue.number),
    key: `#${issue.number}`,
    url: issue.html_url,
    title: issue.title,
    state: {
      category,
      raw:
        issue.state === "closed"
          ? `closed:${issue.state_reason ?? "completed"}`
          : "open",
    },
    labels: labelNames(issue),
    updatedAt: issue.updated_at,
  };
}

/** The PATCH a category needs, or null when the issue already matches. */
export function githubPatch(
  issue: GithubIssue,
  category: StateCategory,
  inProgressLabels: string[],
): Record<string, unknown> | null {
  const labels = labelNames(issue);
  const progress = new Set(inProgressLabels.map((l) => l.toLowerCase()));
  const hasProgress = labels.some((l) => progress.has(l.toLowerCase()));
  if (category === "completed" || category === "canceled") {
    const reason = category === "completed" ? "completed" : "not_planned";
    const already =
      issue.state === "closed" &&
      (category === "completed"
        ? issue.state_reason !== "not_planned" &&
          issue.state_reason !== "duplicate"
        : issue.state_reason === "not_planned" ||
          issue.state_reason === "duplicate");
    return already ? null : { state: "closed", state_reason: reason };
  }
  const patch: Record<string, unknown> = {};
  if (issue.state === "closed") {
    patch.state = "open";
    patch.state_reason = "reopened";
  }
  const first = inProgressLabels[0];
  if (category === "started" && !hasProgress && first) {
    patch.labels = [...labels, first];
  }
  if ((category === "unstarted" || category === "backlog") && hasProgress) {
    patch.labels = labels.filter((l) => !progress.has(l.toLowerCase()));
  }
  return Object.keys(patch).length ? patch : null;
}

async function gh<T>(res: Response, what: string): Promise<T> {
  if (res.status === 403) {
    const accepted = res.headers.get("x-accepted-github-permissions");
    throw new ProviderError(
      accepted?.includes("issues")
        ? "The GitHub token lacks Issues access — reconnect GitHub in /admin → Updates."
        : `GitHub refused ${what}.`,
      403,
      "github_forbidden",
    );
  }
  if (res.status === 503) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new ProviderError(
      body?.error ?? "GitHub isn't connected. Connect it in /admin → Updates.",
      503,
      "github_not_connected",
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new ProviderError(
      `GitHub ${what} failed: ${body?.message ?? res.status}`,
      502,
    );
  }
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const githubProvider: IssueTrackerProvider = {
  id: "github",
  label: "GitHub",

  async status(ctx: ProviderContext) {
    const s = await ctx.host.github.status();
    return s.connected
      ? { connected: true, target: s.repo }
      : { connected: false, reason: s.reason, message: s.message };
  },

  async search(ctx, query) {
    const q = query.trim();
    if (/^#?\d+$/.test(q)) {
      return [await this.get(ctx, q.replace("#", ""))];
    }
    const res = await gh<{ items: GithubIssue[] }>(
      await ctx.host.github.searchIssues(q, 10),
      "search",
    );
    return res.items
      .filter((i) => !i.pull_request)
      .map((i) => toExternal(i, ctx.settings.inProgressLabels));
  },

  async get(ctx, externalId) {
    const issue = await gh<GithubIssue>(
      await ctx.host.github.api(`/issues/${encodeURIComponent(externalId)}`),
      "issue lookup",
    );
    if (issue.pull_request)
      throw new ProviderError("That number is a pull request.", 400);
    return toExternal(issue, ctx.settings.inProgressLabels);
  },

  async create(ctx, input) {
    const issue = await gh<GithubIssue>(
      await ctx.host.github.api("/issues", { method: "POST", ...json(input) }),
      "issue creation",
    );
    return toExternal(issue, ctx.settings.inProgressLabels);
  },

  async setState(ctx, externalId, category) {
    const issue = await gh<GithubIssue>(
      await ctx.host.github.api(`/issues/${encodeURIComponent(externalId)}`),
      "issue lookup",
    );
    const patch = githubPatch(issue, category, ctx.settings.inProgressLabels);
    if (!patch) return false;
    await gh(
      await ctx.host.github.api(`/issues/${encodeURIComponent(externalId)}`, {
        method: "PATCH",
        ...json(patch),
      }),
      "issue update",
    );
    return true;
  },

  async upsertBacklink(ctx, externalId, body, commentId) {
    if (commentId) {
      const res = await ctx.host.github.api(
        `/issues/comments/${encodeURIComponent(commentId)}`,
        { method: "PATCH", ...json({ body }) },
      );
      if (res.ok) return { commentId };
    }
    const created = await gh<{ id: number }>(
      await ctx.host.github.api(
        `/issues/${encodeURIComponent(externalId)}/comments`,
        {
          method: "POST",
          ...json({ body }),
        },
      ),
      "comment",
    );
    return { commentId: String(created.id) };
  },

  async pollChanged(ctx, cursor, externalIds) {
    const wanted = new Set(externalIds);
    const since = cursor ?? new Date(Date.now() - 24 * 3600_000).toISOString();
    const issues: ExternalIssue[] = [];
    let latest = since;
    for (let page = 1; page <= 5; page++) {
      const batch = await gh<GithubIssue[]>(
        await ctx.host.github.api(
          `/issues?state=all&sort=updated&direction=asc&per_page=100&page=${page}&since=${encodeURIComponent(since)}`,
        ),
        "issue list",
      );
      for (const issue of batch) {
        if (issue.updated_at > latest) latest = issue.updated_at;
        if (issue.pull_request || !wanted.has(String(issue.number))) continue;
        issues.push(toExternal(issue, ctx.settings.inProgressLabels));
      }
      if (batch.length < 100) break;
    }
    return { issues, cursor: latest };
  },
};
