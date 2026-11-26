"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";

import { useSupabase } from "@acme/api";

/**
 * The staff workspace view (docs/WORKSPACES.md → Staff workspace view).
 *
 * Staff aren't members of their customers' workspaces, so the header
 * switcher lets them pick one to *scope* what they look at (a module's staff
 * screens filter to that workspace). It is UI scoping only: RLS still
 * decides what staff may read. For members, the view is simply their active
 * workspace.
 *
 * The host provides the value (web: from the `view_org` cookie, validated on
 * the server) and the setter; modules read it with `useWorkspaceView()`.
 */
export interface WorkspaceView {
  /** The scoped workspace, or null for "all workspaces" / none. */
  orgId: string | null;
  /** Display name of the scoped workspace (null when unscoped). */
  name: string | null;
  /** True when a staff user picked this scope (not their own membership). */
  isStaffView: boolean;
}

interface WorkspaceViewContextValue extends WorkspaceView {
  setView: (orgId: string | null) => Promise<void>;
}

const UNSCOPED: WorkspaceViewContextValue = {
  orgId: null,
  name: null,
  isStaffView: false,
  setView: () => Promise.resolve(),
};

const WorkspaceViewContext = createContext<WorkspaceViewContextValue>(UNSCOPED);

export function WorkspaceViewProvider({
  value,
  setView,
  children,
}: {
  value: WorkspaceView;
  setView: (orgId: string | null) => Promise<void>;
  children: ReactNode;
}) {
  return (
    <WorkspaceViewContext.Provider value={{ ...value, setView }}>
      {children}
    </WorkspaceViewContext.Provider>
  );
}

/** The current workspace scope. Unscoped (orgId null) outside a provider. */
export function useWorkspaceView(): WorkspaceView {
  const { orgId, name, isStaffView } = useContext(WorkspaceViewContext);
  return { orgId, name, isStaffView };
}

/** Change the scope (staff). Pass null for "all workspaces". */
export function useSetWorkspaceView(): (orgId: string | null) => Promise<void> {
  return useContext(WorkspaceViewContext).setView;
}

/** A workspace as staff see it in the switcher. */
export interface StaffWorkspace {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  memberCount: number;
}

export const staffWorkspacesKey = (q: string) =>
  ["staff-workspaces", q] as const;

/**
 * Every workspace, for staff (the `staff_workspaces` RPC refuses anyone
 * else). Searchable; capped at `limit`.
 */
export function useStaffWorkspaces(
  q: string,
  { enabled = true, limit = 50 }: { enabled?: boolean; limit?: number } = {},
) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: [...staffWorkspacesKey(q), limit],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<StaffWorkspace[]> => {
      const { data, error } = await supabase.rpc("staff_workspaces", {
        _q: q || undefined,
        _limit: limit,
      });
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        logoUrl: row.logo_url,
        memberCount: row.member_count,
      }));
    },
  });
}
