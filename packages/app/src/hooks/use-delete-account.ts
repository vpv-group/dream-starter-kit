"use client";

import { useMutation } from "@tanstack/react-query";

import { useSupabase } from "@acme/api";

/**
 * Permanently delete the signed-in user's account. Invokes the `delete-account`
 * edge function (which uses the service role to delete auth.users — the DB
 * cascade removes all owned rows), then signs out locally.
 *
 * App Store requirement: account deletion must be available in-app.
 *
 * Workspaces: a sole owner of a workspace with other members can't delete
 * their account until they transfer ownership (enforced by a DB trigger; the
 * edge function pre-checks too). We check first so both platforms can name
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

      // invoke() attaches the user's access token automatically. supabase-js
      // types `functions.invoke` loosely (it resolves to `any`); the response
      // is `{ data, error }`.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;

      await supabase.auth.signOut();
    },
  });
}
