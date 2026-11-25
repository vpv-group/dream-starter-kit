import { describe, expect, it } from "vitest";

import type {
  CheckSummary,
  MergeContext,
  PrFacts,
  UpdateSettings,
} from "./decide-merge";
import {
  APPROVED_LABEL,
  decideMerge,
  isMajorUpdate,
  touchesWorkflows,
} from "./decide-merge";

const pr = (over: Partial<PrFacts> = {}): PrFacts => ({
  kind: "module",
  op: "update",
  slug: "crm",
  fromVersion: "1.2.1",
  toVersion: "1.3.0",
  labels: ["dream-update"],
  changedFiles: ["modules/crm/src/index.ts"],
  contractMigration: false,
  ...over,
});
const green: CheckSummary = { total: 6, pending: 0, failed: 0 };
const settings = (over: Partial<UpdateSettings> = {}): UpdateSettings => ({
  autoMerge: true,
  paused: [],
  skipped: [],
  ...over,
});
const ctx = (over: Partial<MergeContext> = {}): MergeContext => ({
  hold: null,
  eligible: true,
  attestationVerified: true,
  reviewRequired: false,
  mergedThisRun: false,
  ...over,
});

describe("decideMerge", () => {
  it("merges a clean, green, eligible module update by squash", () => {
    expect(decideMerge(pr(), green, settings(), ctx())).toEqual({
      action: "merge",
      method: "squash",
    });
  });

  it("merges kit updates with a merge commit, never a squash", () => {
    expect(
      decideMerge(
        pr({
          kind: "kit",
          op: "kit-update",
          slug: "kit",
          fromVersion: "2.3.0",
          toVersion: "2.4.0",
        }),
        green,
        settings(),
        ctx(),
      ),
    ).toEqual({ action: "merge", method: "merge" });
  });

  it.each([
    [
      "the global hold",
      pr(),
      green,
      settings(),
      ctx({ hold: "bad 2.4.0" }),
      { action: "wait", reason: "hold" },
    ],
    [
      "conflicts",
      pr({ labels: ["dream-update-conflicts"] }),
      green,
      settings(),
      ctx(),
      { action: "review", reason: "conflicts" },
    ],
    [
      "a removal",
      pr({ op: "remove" }),
      green,
      settings(),
      ctx(),
      { action: "review", reason: "removal" },
    ],
    [
      "no checks at all",
      pr(),
      { total: 0, pending: 0, failed: 0 },
      settings(),
      ctx(),
      { action: "review", reason: "no-checks" },
    ],
    [
      "checks still running",
      pr(),
      { total: 6, pending: 2, failed: 0 },
      settings(),
      ctx(),
      { action: "wait", reason: "checks-pending" },
    ],
    [
      "a failed check",
      pr(),
      { total: 6, pending: 0, failed: 1 },
      settings(),
      ctx(),
      { action: "review", reason: "checks-failed" },
    ],
    [
      "an unverified attestation",
      pr(),
      green,
      settings(),
      ctx({ attestationVerified: false }),
      { action: "review", reason: "attestation" },
    ],
    [
      "a paused module",
      pr(),
      green,
      settings({ paused: ["crm"] }),
      ctx(),
      { action: "review", reason: "paused" },
    ],
    [
      "a skipped version",
      pr(),
      green,
      settings({ skipped: ["crm@1.3.0"] }),
      ctx(),
      { action: "review", reason: "skipped" },
    ],
    [
      "a workflow change",
      pr({ changedFiles: [".github/workflows/ci.yml"] }),
      green,
      settings(),
      ctx(),
      { action: "review", reason: "workflow-change" },
    ],
    [
      "a contract migration",
      pr({ contractMigration: true }),
      green,
      settings(),
      ctx(),
      { action: "review", reason: "contract-migration" },
    ],
    [
      "a major version",
      pr({ toVersion: "2.0.0" }),
      green,
      settings(),
      ctx(),
      { action: "review", reason: "major-version" },
    ],
    [
      "a release still soaking",
      pr(),
      green,
      settings(),
      ctx({ eligible: false }),
      { action: "wait", reason: "not-eligible-yet" },
    ],
    [
      "a required review",
      pr(),
      green,
      settings(),
      ctx({ reviewRequired: true }),
      { action: "wait", reason: "required-review" },
    ],
    [
      "a merge earlier in this run",
      pr(),
      green,
      settings(),
      ctx({ mergedThisRun: true }),
      { action: "wait", reason: "one-at-a-time" },
    ],
    [
      "auto-merge switched off",
      pr(),
      green,
      settings({ autoMerge: false }),
      ctx(),
      { action: "review", reason: "auto-merge-off" },
    ],
  ] as const)("does not merge with %s", (_name, p, c, s, x, expected) => {
    expect(decideMerge(p, c, s, x)).toEqual(expected);
  });

  describe("an admin's approval (dream-approved)", () => {
    const approved = (over: Partial<PrFacts> = {}) =>
      pr({ labels: ["dream-update", APPROVED_LABEL], ...over });

    it("merges even with auto-merge off, a major version or a soaking release", () => {
      expect(
        decideMerge(
          approved({
            toVersion: "2.0.0",
            changedFiles: [".github/workflows/x.yml"],
          }),
          green,
          settings({ autoMerge: false, paused: ["crm"] }),
          ctx({ eligible: false }),
        ),
      ).toEqual({ action: "merge", method: "squash" });
    });

    it("never overrides the hold, conflicts, removals, checks or attestation", () => {
      expect(
        decideMerge(approved(), green, settings(), ctx({ hold: "x" })),
      ).toMatchObject({ reason: "hold" });
      expect(
        decideMerge(approved({ op: "remove" }), green, settings(), ctx()),
      ).toMatchObject({ reason: "removal" });
      expect(
        decideMerge(
          approved(),
          { total: 0, pending: 0, failed: 0 },
          settings(),
          ctx(),
        ),
      ).toMatchObject({ reason: "no-checks" });
      expect(
        decideMerge(
          approved(),
          { total: 3, pending: 0, failed: 1 },
          settings(),
          ctx(),
        ),
      ).toMatchObject({ reason: "checks-failed" });
      expect(
        decideMerge(
          approved(),
          green,
          settings(),
          ctx({ attestationVerified: false }),
        ),
      ).toMatchObject({ reason: "attestation" });
    });

    it("still waits for branch protection and one-at-a-time", () => {
      expect(
        decideMerge(
          approved(),
          green,
          settings(),
          ctx({ reviewRequired: true }),
        ),
      ).toMatchObject({ reason: "required-review" });
      expect(
        decideMerge(
          approved(),
          green,
          settings(),
          ctx({ mergedThisRun: true }),
        ),
      ).toMatchObject({ reason: "one-at-a-time" });
    });
  });
});

describe("helpers", () => {
  it("isMajorUpdate compares major versions, tolerating v prefixes", () => {
    expect(isMajorUpdate("v2.3.0", "v3.0.0")).toBe(true);
    expect(isMajorUpdate("2.3.0", "2.9.1")).toBe(false);
    expect(isMajorUpdate(undefined, "3.0.0")).toBe(false);
  });

  it("touchesWorkflows only matches .github/workflows", () => {
    expect(touchesWorkflows([".github/workflows/ci.yml"])).toBe(true);
    expect(touchesWorkflows([".github/renovate.json", "docs/x.md"])).toBe(
      false,
    );
  });
});
