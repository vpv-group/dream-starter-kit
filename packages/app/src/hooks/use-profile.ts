"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AppSupabaseClient } from "@acme/api";
import { useSession, useSupabase } from "@acme/api";

import type { UpdateProfileInput } from "../validators/auth";

// `process.env.*_PUBLIC_*` is inlined by each platform's bundler (Metro / Next).
declare const process: { env: Record<string, string | undefined> };
const APP_BASE =
  process.env.EXPO_PUBLIC_CMS_URL ?? process.env.NEXT_PUBLIC_CMS_URL ?? "";

/** Read the current user's profile row (RLS: own only). */
export function useProfile() {
  const supabase = useSupabase();
  const { user } = useSession();

  return useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Ask the web app to copy the caller's profile (display name, phone, job title)
 * and current email into their CMS `users` row, so /admin stays in step with
 * what the member edited. Bearer token for Expo, cookie on web. Best-effort —
 * the (app) layout backstop + `pnpm cms:backfill-users` cover misses.
 */
export async function syncProfileToCms(
  supabase: AppSupabaseClient,
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    await fetch(`${APP_BASE}/api/cms/mirror-self`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ syncProfile: true }),
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Update the current user's profile metadata: display name, avatar, job title
 * and contact phone. Writes `profiles` under RLS (all user-grantable columns),
 * then keeps `user_metadata` in step (the sidebar/menus read it) and syncs the
 * CMS `users` row.
 */
export function useUpdateProfile() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const { user } = useSession();

  return useMutation({
    mutationFn: async (input: UpdateProfileInput) => {
      if (!user) throw new Error("Not authenticated");
      const avatarUrl = input.avatarUrl?.length ? input.avatarUrl : null;
      const update: {
        display_name: string;
        avatar_url: string | null;
        title?: string | null;
        phone?: string | null;
      } = { display_name: input.displayName, avatar_url: avatarUrl };
      // Only touch the optional columns when the form carries them, so older
      // callers that edit name/avatar only don't wipe them.
      if (input.title !== undefined) update.title = input.title.trim() || null;
      if (input.phone !== undefined) update.phone = input.phone.trim() || null;

      const { data, error } = await supabase
        .from("profiles")
        .update(update)
        .eq("id", user.id)
        .select()
        .single();
      if (error) throw error;

      // Best-effort: user_metadata feeds the sidebar/user menu (same as the
      // onboarding profile step). A failure here must not fail the save.
      try {
        await supabase.auth.updateUser({
          data: {
            display_name: input.displayName,
            avatar_url: avatarUrl,
            ...(update.phone !== undefined ? { phone: update.phone } : {}),
          },
        });
      } catch {
        /* best-effort */
      }
      await syncProfileToCms(supabase);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  });
}
