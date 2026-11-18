"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Tables } from "@acme/api";
import { useSession, useSupabase } from "@acme/api";

import type { SignupIntent } from "../post-auth";
import type { CreateWorkspaceInput } from "../validators/workspace";
import { validateWorkspaceSlug } from "../workspaces";

/** One of the current user's workspaces, with their role and onboarding state. */
export interface MyWorkspace {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  role: "owner" | "admin" | "member";
  onboardingStep: string | null;
  onboardingCompletedAt: string | null;
  onboardingDone: string[];
}

export const workspacesKey = (userId: string | undefined) =>
  ["workspaces", userId] as const;

type MembershipRow = Pick<
  Tables<"memberships">,
  | "role"
  | "onboarding_step"
  | "onboarding_completed_at"
  | "onboarding_done"
  | "created_at"
> & {
  organizations: Pick<
    Tables<"organizations">,
    "id" | "name" | "slug" | "logo_url"
  > | null;
};

/** Map a memberships⋈organizations row (RLS: own memberships only). */
export function toMyWorkspace(row: MembershipRow): MyWorkspace | null {
  if (!row.organizations) return null;
  return {
    id: row.organizations.id,
    name: row.organizations.name,
    slug: row.organizations.slug,
    logoUrl: row.organizations.logo_url,
    role: row.role as MyWorkspace["role"],
    onboardingStep: row.onboarding_step,
    onboardingCompletedAt: row.onboarding_completed_at,
    onboardingDone: row.onboarding_done,
  };
}

/** The workspaces the signed-in user belongs to, oldest membership first. */
export function useMyWorkspaces() {
  const supabase = useSupabase();
  const { user } = useSession();
  return useQuery({
    queryKey: workspacesKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<MyWorkspace[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("memberships")
        .select(
          "role, onboarding_step, onboarding_completed_at, onboarding_done, created_at, organizations(id, name, slug, logo_url)",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as MembershipRow[])
        .map(toMyWorkspace)
        .filter((w): w is MyWorkspace => w !== null);
    },
  });
}

export type SlugStatus =
  | { state: "idle" }
  | { state: "invalid"; problem: "empty" | "format" | "reserved" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "taken" }
  | { state: "error" };

/**
 * Debounced (300ms) availability check for the "Name your workspace" URL
 * field: local format/reserved rules first, then `is_slug_available`.
 */
export function useSlugAvailability(slug: string, delayMs = 300): SlugStatus {
  const supabase = useSupabase();
  const [status, setStatus] = useState<SlugStatus>({ state: "idle" });

  useEffect(() => {
    if (slug.length === 0) {
      setStatus({ state: "idle" });
      return;
    }
    const local = validateWorkspaceSlug(slug);
    if (!local.ok) {
      setStatus({ state: "invalid", problem: local.problem });
      return;
    }
    setStatus({ state: "checking" });
    let cancelled = false;
    const timer = setTimeout(() => {
      void supabase
        .rpc("is_slug_available", { _slug: slug })
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) setStatus({ state: "error" });
          else setStatus({ state: data ? "available" : "taken" });
        });
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug, delayMs, supabase]);

  return status;
}

/** create_workspace RPC — the caller becomes owner and it becomes active. */
export function useCreateWorkspace() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateWorkspaceInput) => {
      const { data, error } = await supabase.rpc("create_workspace", {
        _name: input.name,
        _slug: input.slug,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

/** Record this member's stepper position (save_onboarding_progress RPC). */
export function useSaveOnboardingProgress() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      orgId: string;
      /** The step to resume at next time. */
      step: string;
      /** Mark the whole onboarding finished. */
      completed?: boolean;
      /** A step the member actually finished (vs skipped with "Do this later"). */
      done?: string;
    }) => {
      const { error } = await supabase.rpc("save_onboarding_progress", {
        _org_id: input.orgId,
        _step: input.step,
        _completed: input.completed ?? false,
        ...(input.done ? { _done: input.done } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
  });
}

/** Switch the active workspace (profiles.last_org_id; membership-guarded). */
export function useSetActiveOrg() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async (orgId: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("profiles")
        .update({ last_org_id: orgId })
        .eq("id", user.id);
      if (error) throw error;
      return orgId;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  });
}

/** Hybrid mode: save the once-asked "For myself / With my team" answer. */
export function useSetSignupIntent() {
  const supabase = useSupabase();
  return useMutation({
    mutationFn: async (intent: SignupIntent) => {
      const { error } = await supabase.auth.updateUser({
        data: { signup_intent: intent },
      });
      if (error) throw error;
      return intent;
    },
  });
}
