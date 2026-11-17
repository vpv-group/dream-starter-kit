import { Pressable, Text } from "react-native";
import { Stack, useRouter } from "expo-router";

import { ModWidgetsProvider } from "@acme/mod-kit/react";

import { hasModule, modWidgets } from "~/mod/registry.generated";

function HeaderBell() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push("/a/notifications")}
      hitSlop={8}
      accessibilityLabel="Notifications"
    >
      <Text style={{ color: "#fff", fontSize: 18, marginRight: 12 }}>🔔</Text>
    </Pressable>
  );
}

export default function AppLayout() {
  // The bell is the notifications module's surface — hidden when the
  // module isn't installed (MODULES-PLAN.md §2.5).
  const showBell = hasModule("notifications");
  return (
    // Home-screen widgets from the generated registry (all installed; the
    // runtime kit-modules disable toggle gates native at the menu level).
    <ModWidgetsProvider widgets={modWidgets}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#c03484" },
          headerTintColor: "#fff",
          ...(showBell ? { headerRight: () => <HeaderBell /> } : {}),
        }}
      />
    </ModWidgetsProvider>
  );
}
