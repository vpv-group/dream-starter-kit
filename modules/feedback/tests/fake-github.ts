import type { ModHostGithub } from "@acme/mod-kit/server";

import type { GithubIssue } from "../src/integrations/github";
import type {
  ProviderContext,
  ProviderSettings,
} from "../src/integrations/types";
import { DEFAULT_GITHUB_MAPPING } from "../src/integrations/settings";

/** In-memory GitHub REST double behind ctx.host.github. */
export function fakeGithub(connected = true) {
  let clock = Date.now() - 3600_000;
  const tick = () => new Date((clock += 1000)).toISOString();
  const issues = new Map<number, GithubIssue>([
    [
      1,
      {
        number: 1,
        html_url: "https://github.com/acme/app/issues/1",
        title: "Dark mode",
        state: "open",
        labels: [],
        updated_at: tick(),
      },
    ],
  ]);
  const comments = new Map<number, string>();
  let next = 2;
  let nextComment = 100;
  const calls: string[] = [];
  const reply = (status: number, body: unknown) =>
    Response.json(body, { status });

  const github: ModHostGithub = {
    status: () =>
      Promise.resolve(
        connected
          ? { connected: true as const, repo: "acme/app" }
          : {
              connected: false as const,
              reason: "no-site-key",
              message: "Connect GitHub",
            },
      ),
    searchIssues: (query) => {
      calls.push(`SEARCH ${query}`);
      const q = query.toLowerCase();
      return Promise.resolve(
        reply(200, {
          items: [...issues.values()].filter((i) =>
            i.title.toLowerCase().includes(q),
          ),
        }),
      );
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- async to match the real fetch-backed API
    api: async (path, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push(`${method} ${path}`);
      if (!connected)
        return reply(503, {
          error: "not connected",
          code: "github_not_connected",
        });
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : {};
      const list = /^\/issues\?(.*)$/.exec(path);
      if (list && method === "GET") {
        const since = new URLSearchParams(list[1]).get("since") ?? "";
        return reply(
          200,
          [...issues.values()].filter((i) => i.updated_at >= since),
        );
      }
      const comment = /^\/issues\/comments\/(\d+)$/.exec(path);
      if (comment && method === "PATCH") {
        const id = Number(comment[1]);
        if (!comments.has(id)) return reply(404, { message: "Not Found" });
        comments.set(id, String(body.body));
        return reply(200, { id });
      }
      const one = /^\/issues\/(\d+)(\/comments)?$/.exec(path);
      if (one) {
        const issue = issues.get(Number(one[1]));
        if (!issue) return reply(404, { message: "Not Found" });
        if (one[2] && method === "POST") {
          const id = nextComment++;
          comments.set(id, String(body.body));
          return reply(201, { id });
        }
        if (method === "PATCH") {
          if (body.state) issue.state = body.state as GithubIssue["state"];
          if ("state_reason" in body)
            issue.state_reason =
              body.state_reason as GithubIssue["state_reason"];
          if (body.labels)
            issue.labels = (body.labels as string[]).map((name) => ({ name }));
          issue.updated_at = tick();
          return reply(200, issue);
        }
        return reply(200, issue);
      }
      if (path === "/issues" && method === "POST") {
        const issue: GithubIssue = {
          number: next,
          html_url: `https://github.com/acme/app/issues/${next}`,
          title: String(body.title),
          state: "open",
          labels: ((body.labels as string[] | undefined) ?? []).map((name) => ({
            name,
          })),
          updated_at: tick(),
        };
        issues.set(next++, issue);
        return reply(201, issue);
      }
      return reply(404, { message: `unexpected ${method} ${path}` });
    },
  };
  return { github, issues, comments, calls };
}

export const githubTestSettings: ProviderSettings = {
  enabled: true,
  statusMapping: DEFAULT_GITHUB_MAPPING,
  inProgressLabels: ["in progress"],
  newIssueLabels: ["feedback"],
  backlinkComment: true,
};

export function fakeContext(github: ModHostGithub): ProviderContext {
  return {
    host: { github },
    db: {} as ProviderContext["db"],
    settings: githubTestSettings,
    siteUrl: "https://app.example.com",
  };
}
