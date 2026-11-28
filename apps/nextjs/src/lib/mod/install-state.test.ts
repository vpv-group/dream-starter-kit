import { describe, expect, it } from "vitest";

import type { InstallPr, InstallRun, InstallStateInput } from "./install-state";
import { installStateFor, isBusy, slugsInFlight } from "./install-state";

const NOW = Date.parse("2026-11-28T12:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

const input = (over: Partial<InstallStateInput> = {}): InstallStateInput => ({
  installed: new Set(),
  openPrs: [],
  mergedPrs: [],
  runs: [],
  pending: new Map(),
  now: NOW,
  ...over,
});

const run = (over: Partial<InstallRun> = {}): InstallRun => ({
  status: "in_progress",
  conclusion: null,
  url: "https://github.com/o/r/actions/runs/1",
  createdAt: ago(1),
  target: { op: "add", slugs: ["projects"] },
  ...over,
});

const pr = (over: Partial<InstallPr> = {}): InstallPr => ({
  url: "https://github.com/o/r/pull/7",
  slug: "projects-adapter-github",
  also: ["projects"],
  conflicts: false,
  needsReview: false,
  ...over,
});

describe("installStateFor", () => {
  it("is idle with nothing going on", () => {
    expect(installStateFor("crm", input()).stage).toBe("idle");
  });

  it("is installed once the running app has it", () => {
    const state = installStateFor(
      "crm",
      input({ installed: new Set(["crm"]), openPrs: [pr({ slug: "crm" })] }),
    );
    expect(state).toMatchObject({ stage: "installed", progress: 1 });
  });

  it("shows a click as requested until GitHub knows, then forgets it", () => {
    const clicked = input({ pending: new Map([["crm", NOW - 1000]]) });
    expect(installStateFor("crm", clicked)).toMatchObject({
      stage: "requested",
      progress: null,
    });
    const stale = input({ pending: new Map([["crm", NOW - 20 * 60_000]]) });
    expect(installStateFor("crm", stale).stage).toBe("idle");
  });

  it("follows a run, its PR, the merge and the deploy", () => {
    expect(installStateFor("projects", input({ runs: [run()] }))).toMatchObject(
      { stage: "preparing", progress: 0.3 },
    );
    const open = input({ openPrs: [pr()] });
    expect(installStateFor("projects", open)).toMatchObject({
      stage: "checking",
      url: "https://github.com/o/r/pull/7",
    });
    // The PR counts for the dependency it brings along, too.
    expect(installStateFor("projects-adapter-github", open).stage).toBe(
      "checking",
    );
    expect(
      installStateFor("projects", input({ mergedPrs: [pr()] })).stage,
    ).toBe("deploying");
  });

  it("reports a failed run, and a PR that needs a person", () => {
    const failed = input({
      runs: [run({ status: "completed", conclusion: "failure" })],
    });
    expect(installStateFor("projects", failed)).toMatchObject({
      stage: "failed",
      label: "Install failed",
    });
    expect(
      installStateFor(
        "projects",
        input({ openPrs: [pr({ needsReview: true })] }),
      ).label,
    ).toBe("Needs your review");
  });

  it("uses the newest run, and a retry click beats an old failure", () => {
    const runs = [
      run({ status: "completed", conclusion: "failure", createdAt: ago(10) }),
      run({ createdAt: ago(1) }),
    ];
    expect(installStateFor("projects", input({ runs })).stage).toBe(
      "preparing",
    );
    const retried = input({
      runs: runs.slice(0, 1),
      pending: new Map([["projects", NOW]]),
    });
    expect(installStateFor("projects", retried).stage).toBe("requested");
  });

  it("ignores runs for other ops or unnamed runs", () => {
    const runs = [
      run({ target: { op: "remove", slugs: ["projects"] } }),
      run({ target: null }),
    ];
    expect(installStateFor("projects", input({ runs })).stage).toBe("idle");
  });
});

describe("slugsInFlight", () => {
  it("lists only the modules already being installed", () => {
    expect(
      slugsInFlight({ openPrs: [pr()], mergedPrs: [], runs: [], now: NOW }, [
        "projects",
        "crm",
      ]),
    ).toEqual(["projects"]);
    expect(isBusy(installStateFor("crm", input()))).toBe(false);
  });
});
