import { describe, expect, it, vi } from "vitest";

import type { CheckRun, GitHubClient, PrFile, PullRequest } from "./github";
import type { PrMeta } from "./pr-meta";
import type { OpsSession } from "./session";
import {
  addsContractMigration,
  holdFor,
  runMerge,
  summarizeChecks,
  watchDeployment,
} from "./merge";
import { prMarker } from "./pr-meta";

const NOW = new Date("2026-12-10T12:00:00Z");
const OLD = "2026-12-01T00:00:00Z"; // past the 72 h soak
const GREEN: CheckRun[] = [
  { name: "lint", status: "completed", conclusion: "success" },
  { name: "integration", status: "completed", conclusion: "success" },
];

function session(over: Partial<OpsSession> = {}): OpsSession {
  return {
    githubToken: "ghs_x",
    repo: "acme/app",
    settings: {
      autoUpdate: true,
      autoMerge: true,
      paused: [],
      skipped: [],
      pausedReason: null,
    },
    hold: null,
    releaseHolds: [],
    site: { canary: false },
    ...over,
  };
}

interface FakePr {
  number: number;
  meta?: PrMeta;
  branch?: string;
  labels?: string[];
  mergeableState?: string;
  checks?: CheckRun[];
  files?: PrFile[];
  createdAt?: string;
}

function fakeGitHub(prs: FakePr[]) {
  const pull = (p: FakePr): PullRequest => ({
    number: p.number,
    title: `PR ${p.number}`,
    body: p.meta ? `Update.\n\n${prMarker(p.meta)}` : "",
    createdAt: p.createdAt ?? OLD,
    headRef: p.branch ?? `dream/update-x-${p.number}`,
    headSha: `sha${p.number}`,
    baseRef: "main",
    labels: p.labels ?? ["dream-update"],
    mergeableState: p.mergeableState ?? "clean",
    mergeCommitSha: null,
  });
  const merged: { number: number; method: string }[] = [];
  const labeled: { number: number; labels: string[] }[] = [];
  const comments: { number: number; body: string }[] = [];
  const gh: GitHubClient = {
    listOpenPulls: () =>
      Promise.resolve(
        prs.map((p) => ({ ...pull(p), mergeableState: "unknown" })),
      ),
    getPull: (n) => {
      const p = prs.find((x) => x.number === n);
      if (!p) throw new Error("no pr");
      return Promise.resolve(pull(p));
    },
    listFiles: (n) =>
      Promise.resolve(
        prs.find((x) => x.number === n)?.files ?? [
          { filename: "modules/crm/src/index.ts", status: "modified" },
        ],
      ),
    listCheckRuns: (sha) =>
      Promise.resolve(
        prs.find((x) => `sha${x.number}` === sha)?.checks ?? GREEN,
      ),
    merge: (n, method) => {
      merged.push({ number: n, method });
      return Promise.resolve({ merged: true, sha: `m${n}`, message: "ok" });
    },
    addLabels: (n, labels) => {
      labeled.push({ number: n, labels });
      return Promise.resolve();
    },
    comment: (n, body) => {
      comments.push({ number: n, body });
      return Promise.resolve();
    },
    deploymentStates: () => Promise.resolve(["success"]),
  };
  return { gh, merged, labeled, comments };
}

const moduleUpdate = (over: Partial<PrMeta> = {}): PrMeta => ({
  kind: "module",
  op: "update",
  slug: "crm",
  from: "1.2.0",
  to: "1.3.0",
  verified: true,
  ...over,
});

const kitUpdate: PrMeta = {
  kind: "kit",
  op: "kit-update",
  slug: "kit",
  from: "2.3.0",
  to: "2.4.0",
  verified: true,
  publishedAt: OLD,
};

async function run(
  prs: FakePr[],
  s: OpsSession = session(),
  watch?: (sha: string) => Promise<"ok" | "failed" | "unknown">,
) {
  const fake = fakeGitHub(prs);
  const report = vi.fn(() => Promise.resolve());
  const outcomes = await runMerge({
    gh: fake.gh,
    session: s,
    report,
    now: () => NOW,
    ...(watch ? { watchDeploy: watch } : {}),
  });
  return { ...fake, report, outcomes };
}

describe("runMerge", () => {
  it("merges a clean, green, verified module update by squash and reports it", async () => {
    const { merged, report } = await run([{ number: 1, meta: moduleUpdate() }]);
    expect(merged).toEqual([{ number: 1, method: "squash" }]);
    expect(report).toHaveBeenCalledWith(
      "merged",
      expect.objectContaining({ slug: "crm" }),
      1,
    );
  });

  it("merges kit updates with a merge commit", async () => {
    const { merged } = await run([{ number: 2, meta: kitUpdate }]);
    expect(merged).toEqual([{ number: 2, method: "merge" }]);
  });

  it("merges at most one update per run, oldest first", async () => {
    const { merged, outcomes } = await run([
      {
        number: 5,
        meta: moduleUpdate({ slug: "b" }),
        createdAt: "2026-12-02T00:00:00Z",
      },
      { number: 4, meta: moduleUpdate({ slug: "a" }), createdAt: OLD },
    ]);
    expect(merged.map((m) => m.number)).toEqual([4]);
    expect(outcomes[1]?.decision).toEqual({
      action: "wait",
      reason: "one-at-a-time",
    });
  });

  it("labels a PR that needs a person once, says why, and reports failed checks", async () => {
    const failing = [
      { name: "integration", status: "completed", conclusion: "failure" },
    ];
    const first = await run([
      { number: 3, meta: moduleUpdate(), checks: failing },
    ]);
    expect(first.merged).toEqual([]);
    expect(first.labeled).toEqual([{ number: 3, labels: ["dream-review"] }]);
    expect(first.comments[0]?.body).toContain("a check failed");
    expect(first.report).toHaveBeenCalledWith(
      "checks_failed",
      expect.anything(),
      3,
    );

    const again = await run([
      {
        number: 3,
        meta: moduleUpdate(),
        checks: failing,
        labels: ["dream-update", "dream-review"],
      },
    ]);
    expect(again.labeled).toEqual([]);
    expect(again.comments).toEqual([]);
    expect(again.report).not.toHaveBeenCalled();
  });

  it("never merges while Meet Dream holds the release or everything", async () => {
    const held = await run(
      [{ number: 1, meta: moduleUpdate() }],
      session({ releaseHolds: [{ target: "crm", version: "1.3.0" }] }),
    );
    expect(held.merged).toEqual([]);
    expect(held.outcomes[0]?.decision).toEqual({
      action: "wait",
      reason: "hold",
    });

    const global = await run(
      [{ number: 1, meta: moduleUpdate() }],
      session({ hold: "bad release" }),
    );
    expect(global.merged).toEqual([]);
  });

  it("treats a pause after a failed deploy like automatic merging off", async () => {
    const s = session();
    s.settings.pausedReason = "deploy failed";
    const { merged, outcomes } = await run(
      [{ number: 1, meta: moduleUpdate() }],
      s,
    );
    expect(merged).toEqual([]);
    expect(outcomes[0]?.decision).toEqual({
      action: "review",
      reason: "auto-merge-off",
    });
  });

  it("still merges what an admin approved in /admin", async () => {
    const s = session();
    s.settings.autoMerge = false;
    const { merged } = await run(
      [
        {
          number: 1,
          meta: moduleUpdate(),
          labels: ["dream-update", "dream-approved"],
        },
      ],
      s,
    );
    expect(merged).toHaveLength(1);
  });

  it("merges the PR an admin chose with Merge now, even with merging off", async () => {
    const s = session();
    s.settings.autoMerge = false;
    const fake = fakeGitHub([
      { number: 1, meta: moduleUpdate() },
      { number: 2, meta: moduleUpdate({ slug: "b" }) },
    ]);
    const outcomes = await runMerge({
      gh: fake.gh,
      session: s,
      report: () => Promise.resolve(),
      now: () => NOW,
      approvePr: 2,
    });
    expect(fake.merged).toEqual([{ number: 2, method: "squash" }]);
    expect(outcomes[0]?.decision).toEqual({
      action: "review",
      reason: "auto-merge-off",
    });
  });

  it("waits out the soak time unless the site is a canary", async () => {
    const fresh = { ...kitUpdate, publishedAt: "2026-12-10T00:00:00Z" };
    const regular = await run([{ number: 1, meta: fresh }]);
    expect(regular.outcomes[0]?.decision).toEqual({
      action: "wait",
      reason: "not-eligible-yet",
    });
    const canary = await run(
      [{ number: 1, meta: fresh }],
      session({ site: { canary: true } }),
    );
    expect(canary.merged).toHaveLength(1);
  });

  it("waits for a required review instead of bypassing branch protection", async () => {
    const { outcomes } = await run([
      { number: 1, meta: moduleUpdate(), mergeableState: "blocked" },
    ]);
    expect(outcomes[0]?.decision).toEqual({
      action: "wait",
      reason: "required-review",
    });
  });

  it("sends conflicts, removals and unverified legacy PRs to a person", async () => {
    const { outcomes, merged } = await run([
      { number: 1, meta: moduleUpdate(), mergeableState: "dirty" },
      { number: 2, meta: moduleUpdate({ op: "remove", slug: "old" }) },
      { number: 3, branch: "mod/update-crm-123", labels: ["module-op"] },
      { number: 4, branch: "feature/unrelated", labels: [] },
    ]);
    expect(merged).toEqual([]);
    expect(outcomes.map((o) => [o.pr, o.decision])).toEqual([
      [1, { action: "review", reason: "conflicts" }],
      [2, { action: "review", reason: "removal" }],
      [3, { action: "review", reason: "attestation" }],
    ]);
  });

  it("reports a failed production deploy after merging", async () => {
    const { report, outcomes } = await run(
      [{ number: 1, meta: moduleUpdate() }],
      session(),
      () => Promise.resolve("failed"),
    );
    expect(outcomes[0]?.deploy).toBe("failed");
    expect(report).toHaveBeenLastCalledWith(
      "deploy_failed",
      expect.objectContaining({ slug: "crm" }),
      1,
    );
  });
});

describe("helpers", () => {
  it("counts skipped and neutral checks as passed", () => {
    expect(
      summarizeChecks([
        { name: "a", status: "completed", conclusion: "skipped" },
        { name: "b", status: "completed", conclusion: "neutral" },
        { name: "c", status: "in_progress", conclusion: null },
        { name: "d", status: "completed", conclusion: "timed_out" },
      ]),
    ).toEqual({ total: 4, pending: 1, failed: 1 });
  });

  it("spots added migrations that contract the schema", () => {
    const file = (filename: string, patch: string): PrFile => ({
      filename,
      status: "added",
      patch,
    });
    expect(
      addsContractMigration([
        file(
          "supabase/migrations/20261201_x.sql",
          "@@ -0,0 +1 @@\n+alter table public.t drop column c;",
        ),
      ]),
    ).toBe(true);
    expect(
      addsContractMigration([
        file(
          "modules/crm/supabase/migrations/002_x.sql",
          "@@ -0,0 +1 @@\n+alter table public.t add column c text;",
        ),
        file("docs/x.md", "+drop table everything;"),
      ]),
    ).toBe(false);
  });

  it("applies a release hold only to that release", () => {
    const s = session({ releaseHolds: [{ target: "crm", version: "1.3.0" }] });
    expect(holdFor(s, moduleUpdate())).toContain("crm 1.3.0");
    expect(holdFor(s, moduleUpdate({ to: "1.4.0" }))).toBeNull();
    expect(holdFor(s, kitUpdate)).toBeNull();
  });

  it("watches the production deploy until it settles", async () => {
    const states = [[], ["pending"], ["success"]];
    const gh = {
      deploymentStates: () => Promise.resolve(states.shift() ?? []),
    } as unknown as GitHubClient;
    const sleep = () => Promise.resolve();
    expect(await watchDeployment(gh, "s", { sleep })).toBe("ok");
    const failing = {
      deploymentStates: () => Promise.resolve(["error"]),
    } as unknown as GitHubClient;
    expect(await watchDeployment(failing, "s", { sleep })).toBe("failed");
    const none = {
      deploymentStates: () => Promise.resolve([]),
    } as unknown as GitHubClient;
    expect(
      await watchDeployment(none, "s", {
        sleep,
        timeoutMs: 60_000,
        intervalMs: 30_000,
      }),
    ).toBe("unknown");
  });
});
