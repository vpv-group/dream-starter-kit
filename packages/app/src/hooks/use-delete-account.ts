"use client";

import { useMutation } from "@tanstack/react-query";

import { useSupabase } from "@acme/api";

// `process.env.*_PUBLIC_*` is inlined by each platform's bundler (Metro / Next).
declare const process: { env: Record<string, string | undefined> };
const APP_BASE =
  process.env.EXPO_PUBLIC_CMS_URL ?? process.env.NEXT_PUBLIC_CMS_URL ?? "";

/**
 * Permanently delete the signed-in user's account. Calls the web app's
 * `POST /api/account/delete` (which uses the service role to delete
 * auth.users — the DB cascade removes all owned rows — and queues the erasure
 * of their CMS row and files), then signs out locally.
 *
 * App Store requirement: account deletion must be available in-app.
 *
 * Workspaces: a sole owner of a workspace with other members can't delete
 * their account until they transfer ownership (enforced by a DB trigger; the
 * route pre-checks too). We check first so both platforms can name
 * the workspaces instead of showing a generic failure.
 */
export class SoleOwnerError extends Error {
  constructor(public readonly workspaces: string[]) {
    super(
      `You're the only owner of ${workspaces.join(", ")}. Make someone else an owner, or remove the other members, before deleting your account.`,
    );
    this.name = "SoleOwnerError";
  }
}
export function useDeleteAccount() {
  const supabase = useSupabase();

  return useMutation({
    mutationFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data: blocking, error: checkError } = await supabase.rpc(
        "my_blocking_workspaces",
      );
      if (checkError) throw checkError;
      if (blocking.length > 0) {
        throw new SoleOwnerError(blocking.map((w) => w.org_name));
      }

      // Bearer token works on both platforms (cookies only exist on web).
      const res = await fetch(`${APP_BASE}/api/account/delete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as {
          workspaces?: string[];
        };
        throw new SoleOwnerError(body.workspaces ?? []);
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          body.error ?? `Account deletion failed (${res.status})`,
        );
      }

      await supabase.auth.signOut();
    },
  });
}
