"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useSession, useSupabase } from "@acme/api";

const notificationsKey = ["notifications"] as const;

/** Newest notifications shown in the feed and the bell. */
export const NOTIFICATIONS_PAGE = 50;

/**
 * The user's in-app notification feed (RLS: own): the newest page only, so
 * reads stay cheap however much history a user has. Served by the
 * (user_id, created_at desc) index.
 */
export function useNotifications() {
  const supabase = useSupabase();
  const { user } = useSession();

  return useQuery({
    queryKey: notificationsKey,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mod_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(NOTIFICATIONS_PAGE);
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Unread total across ALL of the user's notifications (not just the loaded
 * page) — counted in the database from a partial index of unread rows.
 */
export function useUnreadCount(): number {
  const supabase = useSupabase();
  const { user } = useSession();
  const query = useQuery({
    queryKey: [...notificationsKey, "unread-count"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "mod_notifications_unread_count",
      );
      if (error) throw error;
      return data;
    },
  });
  return query.data ?? 0;
}

/** Mark every unread notification read, in one statement. */
export function useMarkAllNotificationsRead() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("mod_notifications_mark_all_read");
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: notificationsKey }),
  });
}

export function useMarkNotificationRead() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("mod_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: notificationsKey }),
  });
}
