"use client";

import { useMutation } from "@tanstack/react-query";

import { useSession, useSupabase } from "@acme/api";

import {
  changePassword,
  isReauthenticationNeeded,
  requestEmailChange,
  resendEmailChange,
  sendReauthenticationCode,
} from "../auth";

/**
 * Account-settings mutations for /profile (web + native). All go through the
 * user's own session via `supabase.auth.updateUser` — Supabase enforces the
 * confirmation / reauthentication rules server-side (docs/AUTH.md → Account
 * settings).
 */

/**
 * Request an email change. Resolves once Supabase has sent the confirmation
 * email(s) — to BOTH addresses with "Secure email change" on. The session's
 * `user.new_email` shows the pending address until it's confirmed.
 */
export function useChangeEmail(opts?: { emailRedirectTo?: string }) {
  const supabase = useSupabase();
  return useMutation({
    mutationFn: async (email: string) => {
      // updateUser stores the returned user (with `new_email`) and emits
      // USER_UPDATED, so useSession() shows the pending change right away.
      await requestEmailChange(supabase, email.trim(), opts);
    },
  });
}

/** Re-send the confirmation(s) for the pending `user.new_email`. */
export function useResendEmailChange(opts?: { emailRedirectTo?: string }) {
  const supabase = useSupabase();
  const { user } = useSession();
  return useMutation({
    mutationFn: async () => {
      if (!user?.new_email) throw new Error("No pending email change.");
      await resendEmailChange(supabase, user.new_email, opts);
    },
  });
}

export type ChangePasswordResult =
  | { status: "updated" }
  /** Session is older than 24h: a code was emailed — retry with `nonce`. */
  | { status: "needs_reauth" };

/**
 * Change the password. With "Secure password change" on, a stale session gets
 * `{ status: "needs_reauth" }` (and the reauthentication code is emailed);
 * prompt for the code and call again with `nonce`.
 */
export function useChangePassword() {
  const supabase = useSupabase();
  return useMutation({
    mutationFn: async ({
      password,
      nonce,
    }: {
      password: string;
      nonce?: string;
    }): Promise<ChangePasswordResult> => {
      try {
        await changePassword(supabase, password, nonce);
        return { status: "updated" };
      } catch (e) {
        if (!nonce && isReauthenticationNeeded(e)) {
          await sendReauthenticationCode(supabase);
          return { status: "needs_reauth" };
        }
        throw e;
      }
    },
  });
}

/** Email a fresh reauthentication code (the "Resend code" action). */
export function useSendReauthenticationCode() {
  const supabase = useSupabase();
  return useMutation({
    mutationFn: () => sendReauthenticationCode(supabase),
  });
}
