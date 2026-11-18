import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import type { AuthSettings, MyWorkspace } from "@acme/app";
import { activeOnboardingSteps, isWorkspaceMode } from "@acme/app";

import { getAuthSettings } from "~/lib/payload";
import { createClient } from "~/lib/supabase/server";

/**
 * Server-side workspace context (docs/WORKSPACES.md). The active workspace is
 * a cookie hint (set by the sidebar switcher) falling back to
 * `profiles.last_org_id`, then the oldest membership — always validated
 * against the user's own memberships (RLS), so a stale or forged cookie can
 * never surface another workspace.
 */
export const ACTIVE_ORG_COOKIE = "active_org";

export interface WorkspaceMember extends MyWorkspace {
  /** True when this user created (owns) the workspace. */
  isCreator: boolean;
}

export interface WorkspaceProfile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  title: string | null;
  isStaff: boolean;
  emailPreferences: unknown;
}

export interface WorkspaceContext {
  settings: AuthSettings;
  /** Teams or Both. In consumer mode `workspaces` is always empty. */
  workspaceMode: boolean;
  profile: WorkspaceProfile;
  isAnonymous: boolean;
  workspaces: WorkspaceMember[];
  active: WorkspaceMember | null;
}

/** The signed-in user's workspace context, or null when signed out. Cached per request. */
export const getWorkspaceContext = cache(
  async (): Promise<WorkspaceContext | null> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const settings = await getAuthSettings();
    const workspaceMode = isWorkspaceMode(settings);

    const [{ data: profile }, memberships] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "display_name, avatar_url, title, is_staff, last_org_id, email_preferences",
        )
        .eq("id", user.id)
        .maybeSingle(),
      workspaceMode
        ? supabase
            .from("memberships")
            .select(
              "role, onboarding_step, onboarding_completed_at, onboarding_done, created_at, organizations(id, name, slug, logo_url, owner_id)",
            )
            .eq("user_id", user.id)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] }),
    ]);

    const workspaces: WorkspaceMember[] = (memberships.data ?? []).map(
      (row) => ({
        id: row.organizations.id,
        name: row.organizations.name,
        slug: row.organizations.slug,
        logoUrl: row.organizations.logo_url,
        role: row.role as WorkspaceMember["role"],
        onboardingStep: row.onboarding_step,
        onboardingCompletedAt: row.onboarding_completed_at,
        onboardingDone: row.onboarding_done,
        isCreator: row.organizations.owner_id === user.id,
      }),
    );

    const cookieOrg = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
    const active =
      workspaces.find((w) => w.id === cookieOrg) ??
      workspaces.find((w) => w.id === profile?.last_org_id) ??
      workspaces[0] ??
      null;

    return {
      settings,
      workspaceMode,
      isAnonymous: user.is_anonymous ?? false,
      profile: {
        id: user.id,
        email: user.email ?? "",
        displayName: profile?.display_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        title: profile?.title ?? null,
        isStaff: profile?.is_staff ?? false,
        emailPreferences: profile?.email_preferences ?? {},
      },
      workspaces,
      active,
    };
  },
);

/** The active workspace for the signed-in user (null in consumer mode / none yet). */
export async function getActiveOrg(): Promise<WorkspaceMember | null> {
  return (await getWorkspaceContext())?.active ?? null;
}

/** The onboarding steps the active member walks through, in order. */
export function stepsForMember(
  settings: AuthSettings,
  member: Pick<WorkspaceMember, "role" | "isCreator">,
) {
  return activeOnboardingSteps(settings, {
    isAdmin: member.role !== "member",
    isInvitee: !member.isCreator,
  });
}

export interface StepContext {
  ctx: WorkspaceContext;
  active: WorkspaceMember;
  steps: ReturnType<typeof stepsForMember>;
  /** 0-based index of this step in `steps`. */
  index: number;
  /** The step after this one, or null when this is the last (or a revisit). */
  next: ReturnType<typeof stepsForMember>[number] | null;
  /** Where Continue / Do this later go. */
  nextPath: string;
  /** Opened from the /a checklist after onboarding finished. */
  revisit: boolean;
}

/**
 * Resolve an onboarding step page's context, or the path to redirect to when
 * the step doesn't apply (no workspace yet, step disabled for this member).
 */
export async function getStepContext(
  stepKey: string,
): Promise<{ redirect: string } | StepContext> {
  const ctx = await getWorkspaceContext();
  if (!ctx) return { redirect: "/sign-in" };
  if (!ctx.workspaceMode) return { redirect: "/a" };
  const active = ctx.active;
  if (!active) return { redirect: "/onboarding/workspace" };

  const steps = stepsForMember(ctx.settings, active);
  const index = steps.findIndex((s) => s.key === stepKey);
  if (index < 0) return { redirect: steps[0]?.path ?? "/a" };

  const revisit = active.onboardingCompletedAt !== null;
  const next = revisit ? null : (steps[index + 1] ?? null);
  return {
    ctx,
    active,
    steps,
    index,
    next,
    nextPath: next?.path ?? "/a",
    revisit,
  };
}
