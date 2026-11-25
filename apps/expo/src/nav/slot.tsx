import { Stack } from "expo-router";

import { useBrandColors } from "~/lib/brand";
import { HeaderBell } from "./header-bell";
import { useNativeMenu } from "./native-nav-provider";
import { NATIVE_SCREENS } from "./screens";

/** The Stack inside each tab, so module screens can set their own titles. */
export function TabStack({ bell = true }: { bell?: boolean }) {
  const colors = useBrandColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        contentStyle: { backgroundColor: colors.background },
        ...(bell
          ? { headerRight: () => <HeaderBell color={colors.foreground} /> }
          : {}),
      }}
    />
  );
}

/** Renders the screen staff put in tab slot `slot` (0-based). */
export function TabSlotScreen({ slot }: { slot: number }) {
  const entry = useNativeMenu().tabs[slot];
  const Screen = entry ? NATIVE_SCREENS[entry.href] : undefined;
  if (!entry || !Screen) return null;
  return (
    <>
      {/* Default title; screens that set their own override it. */}
      <Stack.Screen options={{ title: entry.label }} />
      <Screen />
    </>
  );
}
