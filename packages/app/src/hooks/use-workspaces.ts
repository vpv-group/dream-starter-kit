"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Tables } from "@acme/api";
import { useSession, useSupabase } from "@acme/api";

import type { SignupIntent } from "../post-auth";
import type { CreateWorkspaceInput } from "../validators/workspace";
import type { InviteResult } from "../workspaces";
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

// ---------------------------------------------------------------------------
// Invitations + members (PR 2)
// ---------------------------------------------------------------------------

// `process.env.*_PUBLIC_*` is inlined by each platform's bundler (Metro / Next).
declare const process: { env: Record<string, string | undefined> };
const APP_BASE =
  process.env.EXPO_PUBLIC_CMS_URL ?? process.env.NEXT_PUBLIC_CMS_URL ?? "";

/** One row of my_pending_invitations(): invites sent to my confirmed email. */
export interface PendingInvitation {
  invitationId: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  logoUrl: string | null;
  inviterName: string | null;
  role: string;
  expiresAt: string | null;
}

export function useMyPendingInvitations() {
  const supabase = useSupabase();
  const { user } = useSession();
  return useQuery({
    queryKey: ["pending-invitations", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<PendingInvitation[]> => {
      const { data, error } = await supabase.rpc("my_pending_invitations");
      if (error) throw error;
      return data.map((r) => ({
        invitationId: r.invitation_id,
        orgId: r.org_id,
        orgName: r.org_name,
        orgSlug: r.org_slug,
        logoUrl: r.logo_url,
        inviterName: r.inviter_name,
        role: r.role,
        expiresAt: r.expires_at,
      }));
    },
  });
}

/** Join from the "You've been invited" screen (accept_pending_invitation). */
export function useAcceptPendingInvitation() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { data, error } = await supabase.rpc("accept_pending_invitation", {
        _invitation_id: invitationId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      void queryClient.invalidateQueries({ queryKey: ["pending-invitations"] });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

/** Join with an emailed invite token (accept_invitation) — e.g. a deep link. */
export function useAcceptInvitation() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await supabase.rpc("accept_invitation", {
        _token: token,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      void queryClient.invalidateQueries({ queryKey: ["pending-invitations"] });
    },
  });
}

export interface WorkspaceMember {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  title: string | null;
  email: string | null;
  role: "owner" | "admin" | "member";
  joinedAt: string;
  isYou: boolean;
}

const MEMBERS_PAGE = 1000;

/** Members of a workspace I belong to (workspace_members — safe columns only). */
export function useWorkspaceMembers(orgId: string | null | undefined) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["workspace-members", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<WorkspaceMember[]> => {
      if (!orgId) return [];
      // Keyset pages of up to 1000 (the Data API's row cap) until a short page.
      const rows = [];
      let after: string | undefined;
      for (;;) {
        const { data, error } = await supabase.rpc("workspace_members", {
          _org: orgId,
          _limit: MEMBERS_PAGE,
          _after: after,
        });
        if (error) throw error;
        rows.push(...data);
        if (data.length < MEMBERS_PAGE) break;
        after = data[data.length - 1]?.user_id;
      }
      return rows.map((m) => ({
        userId: m.user_id,
        displayName: m.display_name,
        avatarUrl: m.avatar_url,
        title: m.title,
        email: m.email,
        role: m.role as WorkspaceMember["role"],
        joinedAt: m.joined_at,
        isYou: m.is_you,
      }));
    },
  });
}

export interface WorkspaceInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
}

/** Pending invitations of a workspace (RLS: owners/admins only). */
export function useWorkspaceInvitations(orgId: string | null | undefined) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["workspace-invitations", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<WorkspaceInvitation[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("invitations")
        .select("id, email, role, status, expires_at, created_at")
        .eq("org_id", orgId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        status: i.status,
        expiresAt: i.expires_at,
        createdAt: i.created_at,
      }));
    },
  });
}

function useInvalidateWorkspace(orgId: string | null | undefined) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({
      queryKey: ["workspace-members", orgId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["workspace-invitations", orgId],
    });
  };
}

export function useRevokeInvitation(orgId: string | null | undefined) {
  const supabase = useSupabase();
  const invalidate = useInvalidateWorkspace(orgId);
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase
        .from("invitations")
        .update({ status: "revoked" })
        .eq("id", invitationId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateMemberRole(orgId: string | null | undefined) {
  const supabase = useSupabase();
  const invalidate = useInvalidateWorkspace(orgId);
  return useMutation({
    mutationFn: async (input: {
      userId: string;
      role: WorkspaceMember["role"];
    }) => {
      if (!orgId) throw new Error("No workspace");
      const { data, error } = await supabase
        .from("memberships")
        .update({ role: input.role })
        .eq("org_id", orgId)
        .eq("user_id", input.userId)
        .select("id");
      if (error) throw error;
      if (data.length === 0) throw new Error("not_allowed");
    },
    onSuccess: invalidate,
  });
}

export function useRemoveMember(orgId: string | null | undefined) {
  const supabase = useSupabase();
  const invalidate = useInvalidateWorkspace(orgId);
  return useMutation({
    mutationFn: async (userId: string) => {
      if (!orgId) throw new Error("No workspace");
      const { data, error } = await supabase
        .from("memberships")
        .delete()
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .select("id");
      if (error) throw error;
      if (data.length === 0) throw new Error("not_allowed");
    },
    onSuccess: invalidate,
  });
}

/** Enable/disable the invite link and set its allowed domains (set_join_link). */
export function useSetJoinLink(orgId: string | null | undefined) {
  const supabase = useSupabase();
  return useMutation({
    mutationFn: async (input: {
      enabled: boolean;
      allowedDomains: string[];
    }) => {
      if (!orgId) throw new Error("No workspace");
      const { error } = await supabase.rpc("set_join_link", {
        _org: orgId,
        _enabled: input.enabled,
        _allowed_domains: input.allowedDomains,
      });
      if (error) throw error;
    },
  });
}

/** POST to a workspace API route with the session's access token (web + Expo). */
async function postWorkspaceApi<T>(
  supabase: ReturnType<typeof useSupabase>,
  path: string,
  body?: unknown,
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${APP_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

export interface InviteResultRow {
  email: string;
  result: InviteResult;
  link?: string;
}

/** Send invites (POST /api/workspaces/:id/invitations). */
export function useSendInvitations(orgId: string | null | undefined) {
  const supabase = useSupabase();
  const invalidate = useInvalidateWorkspace(orgId);
  return useMutation({
    mutationFn: async (input: {
      emails: string[];
      role: "member" | "admin";
    }) => {
      if (!orgId) throw new Error("No workspace");
      return (
        await postWorkspaceApi<{ results: InviteResultRow[] }>(
          supabase,
          `/api/workspaces/${orgId}/invitations`,
          input,
        )
      ).results;
    },
    onSuccess: invalidate,
  });
}

export function useResendInvitation(orgId: string | null | undefined) {
  const supabase = useSupabase();
  const invalidate = useInvalidateWorkspace(orgId);
  return useMutation({
    mutationFn: async (invitationId: string) => {
      if (!orgId) throw new Error("No workspace");
      return postWorkspaceApi<Omit<InviteResultRow, "email">>(
        supabase,
        `/api/workspaces/${orgId}/invitations/${invitationId}/resend`,
      );
    },
    onSuccess: invalidate,
  });
}

/** Create or rotate the invite link; the plaintext link is returned once. */
export function useResetJoinLink(orgId: string | null | undefined) {
  const supabase = useSupabase();
  return useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No workspace");
      return (
        await postWorkspaceApi<{ link: string }>(
          supabase,
          `/api/workspaces/${orgId}/join-link`,
        )
      ).link;
    },
  });
}
