import { Pressable, Text } from "react-native";
import { Stack, useRouter } from "expo-router";

import { ExtWidgetsProvider } from "@acme/ext-kit/react";

import { extWidgets, hasExtension } from "~/ext/registry.generated";
import { useBrandColors } from "~/lib/brand";

function HeaderBell({ color }: { color: string }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push("/a/notifications")}
      hitSlop={8}
      accessibilityLabel="Notifications"
    >
      <Text style={{ color, fontSize: 18, marginRight: 12 }}>🔔</Text>
    </Pressable>
  );
}

export default function AppLayout() {
  // The bell is the notifications extension's surface — hidden when the
  // extension isn't installed (EXTENSIONS-PLAN.md §2.5).
  const showBell = hasExtension("notifications");
  const colors = useBrandColors();
  return (
    // Home-screen widgets from the generated registry (all installed; the
    // runtime kit-extensions disable toggle gates native at the menu level).
    <ExtWidgetsProvider widgets={extWidgets}>
      <Stack
        screenOptions={{
          // Dream's reserved volume inside the app: plain ground, ink titles.
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          contentStyle: { backgroundColor: colors.background },
          ...(showBell
            ? { headerRight: () => <HeaderBell color={colors.foreground} /> }
            : {}),
        }}
      />
    </ExtWidgetsProvider>
  );
}
