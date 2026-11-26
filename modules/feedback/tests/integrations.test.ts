import { describe, expect, it } from "vitest";

import type { GithubIssue } from "../src/integrations/github";
import { inboundStage, outboundCategory } from "../src/integrations/engine";
import {
  githubCategory,
  githubPatch,
  githubProvider,
} from "../src/integrations/github";
import { DEFAULT_GITHUB_MAPPING } from "../src/integrations/settings";
import { runProviderContractTests } from "../src/integrations/testing";
import { fakeContext, fakeGithub } from "./fake-github";

runProviderContractTests(githubProvider, () =>
  fakeContext(fakeGithub().github),
);

const issue = (over: Partial<GithubIssue>): GithubIssue => ({
  number: 1,
  html_url: "https://github.com/acme/app/issues/1",
  title: "x",
  state: "open",
  labels: [],
  updated_at: "2026-11-20T00:00:00Z",
  ...over,
});

describe("GitHub state mapping", () => {
  it("maps issue states to shared categories", () => {
    expect(githubCategory(issue({}), ["in progress"])).toBe("unstarted");
    expect(
      githubCategory(issue({ labels: [{ name: "In Progress" }] }), [
        "in progress",
      ]),
    ).toBe("started");
    expect(
      githubCategory(issue({ state: "closed", state_reason: "completed" }), []),
    ).toBe("completed");
    expect(
      githubCategory(
        issue({ state: "closed", state_reason: "not_planned" }),
        [],
      ),
    ).toBe("canceled");
    expect(
      githubCategory(issue({ state: "closed", state_reason: "duplicate" }), []),
    ).toBe("canceled");
  });

  it("patches only what differs", () => {
    expect(githubPatch(issue({}), "unstarted", ["in progress"])).toBeNull();
    expect(githubPatch(issue({}), "completed", [])).toEqual({
      state: "closed",
      state_reason: "completed",
    });
    expect(
      githubPatch(
        issue({ state: "closed", state_reason: "completed" }),
        "completed",
        [],
      ),
    ).toBeNull();
    expect(
      githubPatch(
        issue({ state: "closed", state_reason: "completed" }),
        "canceled",
        [],
      ),
    ).toEqual({
      state: "closed",
      state_reason: "not_planned",
    });
    expect(
      githubPatch(issue({ state: "closed" }), "started", ["in progress"]),
    ).toEqual({
      state: "open",
      state_reason: "reopened",
      labels: ["in progress"],
    });
    expect(
      githubPatch(
        issue({ labels: [{ name: "in progress" }, { name: "ux" }] }),
        "unstarted",
        ["in progress"],
      ),
    ).toEqual({
      labels: ["ux"],
    });
  });
});

describe("status mapping (first match wins, direction-aware)", () => {
  const rows = [
    {
      external: "completed" as const,
      stage: "shipped",
      direction: "both" as const,
    },
    {
      external: "completed" as const,
      stage: "done",
      direction: "inbound" as const,
    },
    {
      external: "canceled" as const,
      stage: "shipped",
      direction: "outbound" as const,
    },
    {
      external: "unstarted" as const,
      stage: "planned",
      direction: "outbound" as const,
    },
  ];
  it("inbound uses the first non-outbound row", () => {
    expect(inboundStage("completed", rows)).toBe("shipped");
    expect(inboundStage("unstarted", rows)).toBeNull();
  });
  it("outbound uses the first non-inbound row for the stage", () => {
    expect(outboundCategory("shipped", rows)).toBe("completed");
    expect(outboundCategory("done", rows)).toBeNull();
    expect(outboundCategory("planned", rows)).toBe("unstarted");
  });
  it("the defaults round-trip", () => {
    for (const row of DEFAULT_GITHUB_MAPPING) {
      expect(outboundCategory(row.stage, DEFAULT_GITHUB_MAPPING)).toBe(
        row.external,
      );
      expect(inboundStage(row.external, DEFAULT_GITHUB_MAPPING)).toBe(
        row.stage,
      );
    }
  });
});

describe("GitHub provider", () => {
  it("reports not connected when the App isn't connected", async () => {
    const status = await githubProvider.status(
      fakeContext(fakeGithub(false).github),
    );
    expect(status).toMatchObject({ connected: false, reason: "no-site-key" });
  });

  it("search by #number reads the issue directly", async () => {
    const fake = fakeGithub();
    const found = await githubProvider.search(fakeContext(fake.github), "#1");
    expect(found.map((i) => i.key)).toEqual(["#1"]);
    expect(fake.calls).toContain("GET /issues/1");
  });

  it("only ever calls issue endpoints", async () => {
    const fake = fakeGithub();
    const ctx = fakeContext(fake.github);
    await githubProvider.setState(ctx, "1", "started");
    await githubProvider.create(ctx, {
      title: "t",
      body: "b",
      labels: ["feedback"],
    });
    await githubProvider.pollChanged?.(ctx, null, ["1"]);
    for (const c of fake.calls) expect(c).toMatch(/^(GET|POST|PATCH) \/issues/);
  });
});
