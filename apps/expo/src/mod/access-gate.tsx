import type { ComponentType } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { useSupabase } from "@acme/api";

/**
 * Native page guard for modules with an access check (manifest
 * `access.check` — a `mod_<slug>_*` SQL function). Generated route stubs wrap
 * the module's screen with it: users the check denies are sent home. The
 * module's own RLS still guards its data; this keeps them off its screens.
 */
export function withModuleAccess<P extends object>(
  check: string,
  Screen: ComponentType<P>,
): ComponentType<P> {
  function Gated(props: P) {
    const supabase = useSupabase();
    const access = useQuery({
      queryKey: ["mod-access", check],
      staleTime: 60_000,
      queryFn: async () => {
        const rpc = supabase.rpc.bind(supabase) as unknown as (
          fn: string,
        ) => Promise<{ data: unknown; error: unknown }>;
        const { data, error } = await rpc(check);
        return !error && data === true;
      },
    });
    if (access.isPending) {
      return (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      );
    }
    if (!access.data) return <Redirect href="/" />;
    return <Screen {...props} />;
  }
  Gated.displayName = `withModuleAccess(${Screen.displayName ?? Screen.name})`;
  return Gated;
}
