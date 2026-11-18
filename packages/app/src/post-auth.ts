/**
 * Where a user goes right after proving their email (the `/welcome` decision,
 * docs/WORKSPACES.md → Routing). A PURE function: `/welcome` (web) and the
 * Expo app gather the inputs and act on the result, so both platforms route
 * identically and every branch is unit-tested.
 *
 *   staff?            → /cms-setup (first time) or /admin
 *   consumer / anon?  → /a (today's flow)
 *   invite/join token → accept it (caller runs the RPC), then onboarding
 *   has workspaces?   → resume the saved onboarding step, else /a
 *   pending invites?  → "You've been invited" (PR 2)
 *   hybrid?           → ask once: For myself → /a · With my team → create
 *   business          → Name your workspace
 *
 * Staff are checked before the account model, so the founder's experience
 * never changes; `is_staff` never grants workspace rights and vice versa.
 */
import type { AccountModel } from "./auth-settings";
import type { OnboardingStepDef } from "./workspaces";

export type SignupIntent = "personal" | "team";

export interface PostAuthMembership {
  orgId: string;
  role: "owner" | "admin" | "member";
  onboardingStep: string | null;
  onboardingCompletedAt: string | null;
}

export interface PostAuthInput {
  accountModel: AccountModel;
  isStaff: boolean;
  isAnonymous?: boolean;
  /** Whether the CMS has been seeded; null when the check failed. */
  cmsSeeded: boolean | null;
  /** An invite (`/invite/{token}`) or join-link (`/join/{token}`) token carried through auth. */
  token: { kind: "invite" | "join"; value: string } | null;
  memberships: readonly PostAuthMembership[];
  /** profiles.last_org_id — the workspace that was last active. */
  lastOrgId: string | null;
  /** Count of my_pending_invitations() rows. */
  pendingInvites: number;
  /** Hybrid mode: the once-asked answer saved in auth user_metadata.signup_intent. */
  hybridChoice: SignupIntent | null;
  /**
   * Ordered onboarding steps for a membership (see activeOnboardingSteps).
   * Lets the resolver resume at the saved step or the first available one.
   */
  stepsFor: (membership: PostAuthMembership) => readonly OnboardingStepDef[];
}

export type PostAuthReason =
  | "staff-setup"
  | "staff-admin"
  | "consumer"
  | "anonymous"
  | "resume-onboarding"
  | "workspace-home"
  | "pending-invites"
  | "hybrid-choose"
  | "hybrid-personal"
  | "create-workspace";

export type PostAuthDestination =
  | { kind: "redirect"; path: string; reason: PostAuthReason }
  | { kind: "accept-token"; tokenKind: "invite" | "join"; token: string };

export const ONBOARDING_PATHS = {
  choose: "/onboarding/choose",
  workspace: "/onboarding/workspace",
  pendingInvites: "/onboarding/invites",
} as const;

const redirect = (
  path: string,
  reason: PostAuthReason,
): PostAuthDestination => ({ kind: "redirect", path, reason });

/** The membership whose workspace should be active: last-used, else the first. */
export function pickActiveMembership(
  memberships: readonly PostAuthMembership[],
  lastOrgId: string | null,
): PostAuthMembership | null {
  return (
    memberships.find((m) => m.orgId === lastOrgId) ?? memberships[0] ?? null
  );
}

/** Where an unfinished member resumes, or null when nothing is left to show. */
export function resumePath(
  membership: PostAuthMembership,
  steps: readonly OnboardingStepDef[],
): string | null {
  if (membership.onboardingCompletedAt) return null;
  const saved = steps.find((s) => s.key === membership.onboardingStep);
  return (saved ?? steps[0])?.path ?? null;
}

export function resolvePostAuthDestination(
  input: PostAuthInput,
): PostAuthDestination {
  if (input.isStaff) {
    return input.cmsSeeded === true
      ? redirect("/admin", "staff-admin")
      : redirect("/cms-setup", "staff-setup");
  }

  if (input.accountModel === "consumer") return redirect("/a", "consumer");
  // Anonymous (Turnstile) sessions can't create or join workspaces.
  if (input.isAnonymous) return redirect("/a", "anonymous");

  // An invite beats existing memberships.
  if (input.token) {
    return {
      kind: "accept-token",
      tokenKind: input.token.kind,
      token: input.token.value,
    };
  }

  const active = pickActiveMembership(input.memberships, input.lastOrgId);
  if (active) {
    const resume = resumePath(active, input.stepsFor(active));
    return resume
      ? redirect(resume, "resume-onboarding")
      : redirect("/a", "workspace-home");
  }

  if (input.pendingInvites > 0) {
    return redirect(ONBOARDING_PATHS.pendingInvites, "pending-invites");
  }

  if (input.accountModel === "hybrid") {
    if (input.hybridChoice === "personal") {
      return redirect("/a", "hybrid-personal");
    }
    if (input.hybridChoice !== "team") {
      return redirect(ONBOARDING_PATHS.choose, "hybrid-choose");
    }
  }

  return redirect(ONBOARDING_PATHS.workspace, "create-workspace");
}

/**
 * Business mode: a non-staff, signed-in user with no workspace can't use the
 * app yet. Used by the (app) shell to send them to "Name your workspace" when
 * they arrive at /a without going through /welcome (e.g. after the founder
 * switches Individuals → Teams). Hybrid and consumer never gate.
 */
export function needsWorkspaceGate(input: {
  accountModel: AccountModel;
  isStaff: boolean;
  isAnonymous: boolean;
  membershipCount: number;
}): boolean {
  return (
    input.accountModel === "business" &&
    !input.isStaff &&
    !input.isAnonymous &&
    input.membershipCount === 0
  );
}

/** Read the hybrid choice from auth user_metadata, tolerating junk. */
export function readSignupIntent(metadata: unknown): SignupIntent | null {
  if (!metadata || typeof metadata !== "object") return null;
  const v = (metadata as Record<string, unknown>).signup_intent;
  return v === "personal" || v === "team" ? v : null;
}
