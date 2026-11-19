import { describe, expect, it } from "vitest";

import type { PostAuthInput, PostAuthMembership } from "./post-auth";
import { DEFAULT_AUTH_SETTINGS } from "./auth-settings";
import {
  needsWorkspaceGate,
  pickActiveMembership,
  readSignupIntent,
  resolvePostAuthDestination,
} from "./post-auth";
import { activeOnboardingSteps } from "./workspaces";

const stepsFor = (m: PostAuthMembership) =>
  activeOnboardingSteps(DEFAULT_AUTH_SETTINGS, {
    isAdmin: m.role !== "member",
    isInvitee: m.role === "member",
  });

const member = (
  over: Partial<PostAuthMembership> = {},
): PostAuthMembership => ({
  orgId: "org-1",
  role: "owner",
  onboardingStep: null,
  onboardingCompletedAt: "2026-11-18T00:00:00Z",
  ...over,
});

const base = (over: Partial<PostAuthInput> = {}): PostAuthInput => ({
  accountModel: "business",
  isStaff: false,
  isAnonymous: false,
  cmsSeeded: true,
  token: null,
  memberships: [],
  lastOrgId: null,
  pendingInvites: 0,
  hybridChoice: null,
  stepsFor,
  ...over,
});

const path = (input: PostAuthInput) => {
  const d = resolvePostAuthDestination(input);
  return d.kind === "redirect" ? d.path : `accept:${d.tokenKind}:${d.token}`;
};

describe("resolvePostAuthDestination", () => {
  describe("staff are routed before the account model", () => {
    it("unseeded CMS → /cms-setup", () => {
      expect(path(base({ isStaff: true, cmsSeeded: false }))).toBe(
        "/cms-setup",
      );
    });
    it("seeded-check failure (null) → /cms-setup (structured errors live there)", () => {
      expect(path(base({ isStaff: true, cmsSeeded: null }))).toBe("/cms-setup");
    });
    it("seeded CMS → /admin, even in business mode with a token", () => {
      expect(
        path(
          base({
            isStaff: true,
            cmsSeeded: true,
            token: { kind: "invite", value: "t" },
          }),
        ),
      ).toBe("/admin");
    });
    it("consumer staff behave exactly as today", () => {
      expect(
        path(
          base({ accountModel: "consumer", isStaff: true, cmsSeeded: true }),
        ),
      ).toBe("/admin");
    });
  });

  describe("consumer mode is unchanged", () => {
    it("→ /a regardless of memberships, tokens or invites", () => {
      expect(
        path(
          base({
            accountModel: "consumer",
            memberships: [member({ onboardingCompletedAt: null })],
            token: { kind: "invite", value: "t" },
            pendingInvites: 3,
          }),
        ),
      ).toBe("/a");
    });
  });

  it("anonymous sessions never enter workspace flows", () => {
    expect(resolvePostAuthDestination(base({ isAnonymous: true }))).toEqual({
      kind: "redirect",
      path: "/a",
      reason: "anonymous",
    });
  });

  describe("tokens", () => {
    it("an invite token beats existing memberships", () => {
      expect(
        path(
          base({
            token: { kind: "invite", value: "abc" },
            memberships: [member()],
          }),
        ),
      ).toBe("accept:invite:abc");
    });
    it("a join-link token is accepted too (hybrid)", () => {
      expect(
        path(
          base({ accountModel: "hybrid", token: { kind: "join", value: "j" } }),
        ),
      ).toBe("accept:join:j");
    });
  });

  describe("existing members", () => {
    it("finished onboarding → /a", () => {
      expect(
        resolvePostAuthDestination(base({ memberships: [member()] })),
      ).toEqual({ kind: "redirect", path: "/a", reason: "workspace-home" });
    });
    it("resumes at the saved step", () => {
      expect(
        path(
          base({
            memberships: [
              member({
                onboardingCompletedAt: null,
                onboardingStep: "updates",
              }),
            ],
          }),
        ),
      ).toBe("/onboarding/updates");
    });
    it("starts at the first step when none is saved", () => {
      expect(
        path(base({ memberships: [member({ onboardingCompletedAt: null })] })),
      ).toBe("/onboarding/profile");
    });
    it("falls back to the first step when the saved one is no longer offered", () => {
      expect(
        path(
          base({
            memberships: [
              member({ onboardingCompletedAt: null, onboardingStep: "plan" }),
            ],
          }),
        ),
      ).toBe("/onboarding/profile");
    });
    it("goes to /a when every step is disabled", () => {
      expect(
        path(
          base({
            memberships: [member({ onboardingCompletedAt: null })],
            stepsFor: () => [],
          }),
        ),
      ).toBe("/a");
    });
    it("uses the last-active workspace's progress", () => {
      expect(
        path(
          base({
            lastOrgId: "org-2",
            memberships: [
              member({ orgId: "org-1" }),
              member({
                orgId: "org-2",
                onboardingCompletedAt: null,
                onboardingStep: "updates",
              }),
            ],
          }),
        ),
      ).toBe("/onboarding/updates");
    });
    it("an invitee (member role) never resumes at the admin-only invite step", () => {
      expect(
        path(
          base({
            memberships: [
              member({
                role: "member",
                onboardingCompletedAt: null,
                onboardingStep: "invite",
              }),
            ],
          }),
        ),
      ).toBe("/onboarding/profile");
    });
    it("members beat pending invites and the hybrid question", () => {
      expect(
        path(
          base({
            accountModel: "hybrid",
            memberships: [member()],
            pendingInvites: 2,
          }),
        ),
      ).toBe("/a");
    });
  });

  it("no workspace but pending invites → You've been invited", () => {
    expect(path(base({ pendingInvites: 1 }))).toBe("/onboarding/invites");
    expect(path(base({ accountModel: "hybrid", pendingInvites: 1 }))).toBe(
      "/onboarding/invites",
    );
  });

  describe("hybrid", () => {
    it("asks once when no choice is saved", () => {
      expect(path(base({ accountModel: "hybrid" }))).toBe("/onboarding/choose");
    });
    it("For myself → /a", () => {
      expect(
        path(base({ accountModel: "hybrid", hybridChoice: "personal" })),
      ).toBe("/a");
    });
    it("With my team → Name your workspace", () => {
      expect(path(base({ accountModel: "hybrid", hybridChoice: "team" }))).toBe(
        "/onboarding/workspace",
      );
    });
  });

  it("business with nothing else → Name your workspace", () => {
    expect(resolvePostAuthDestination(base())).toEqual({
      kind: "redirect",
      path: "/onboarding/workspace",
      reason: "create-workspace",
    });
  });
});

describe("helpers", () => {
  it("picks the last-active membership, else the first", () => {
    const ms = [member({ orgId: "a" }), member({ orgId: "b" })];
    expect(pickActiveMembership(ms, "b")?.orgId).toBe("b");
    expect(pickActiveMembership(ms, "gone")?.orgId).toBe("a");
    expect(pickActiveMembership([], null)).toBeNull();
  });

  it("gates /a only for business-mode non-staff without a workspace", () => {
    const g = (over: Partial<Parameters<typeof needsWorkspaceGate>[0]>) =>
      needsWorkspaceGate({
        accountModel: "business",
        isStaff: false,
        isAnonymous: false,
        membershipCount: 0,
        ...over,
      });
    expect(g({})).toBe(true);
    expect(g({ membershipCount: 1 })).toBe(false);
    expect(g({ isStaff: true })).toBe(false);
    expect(g({ isAnonymous: true })).toBe(false);
    expect(g({ accountModel: "hybrid" })).toBe(false);
    expect(g({ accountModel: "consumer" })).toBe(false);
  });

  it("reads the hybrid signup intent from user metadata", () => {
    expect(readSignupIntent({ signup_intent: "team" })).toBe("team");
    expect(readSignupIntent({ signup_intent: "personal" })).toBe("personal");
    expect(readSignupIntent({ signup_intent: "other" })).toBeNull();
    expect(readSignupIntent(null)).toBeNull();
  });
});
