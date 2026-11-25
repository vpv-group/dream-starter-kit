import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";

import { hasModule } from "~/mod/registry.generated";

/**
 * Header bell → notifications (the notifications module's surface; hidden
 * when it isn't installed — MODULES-PLAN.md §2.5).
 */
export function HeaderBell({ color }: { color: string }) {
  const router = useRouter();
  if (!hasModule("notifications")) return null;
  return (
    <Pressable
      onPress={() => router.push("/a/notifications")}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Notifications"
    >
      <SymbolView
        name={{ ios: "bell", android: "notifications" }}
        tintColor={color}
        size={22}
      />
    </Pressable>
  );
}
