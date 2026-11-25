import { useColorScheme } from "react-native";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";

import { ModWidgetsProvider } from "@acme/mod-kit/react";

import { useBrandColors } from "~/lib/brand";
import { modWidgets } from "~/mod/registry.generated";
import { HeaderBell } from "~/nav/header-bell";
import { NativeNavProvider } from "~/nav/native-nav-provider";

// The tab bar is the base of the signed-in app; everything else (module
// detail screens, hidden modules opened by deep link, items picked from
// More) pushes over it.
export const unstable_settings = { initialRouteName: "(tabs)" };

export default function AppLayout() {
  const colors = useBrandColors();
  const scheme = useColorScheme();
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  return (
    // Navigation theme: stops iOS 26 flashing white between native tabs.
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: colors.primary,
          background: colors.background,
          card: colors.background,
          text: colors.foreground,
          border: colors.border,
        },
      }}
    >
      {/* Home-screen widgets from the generated registry (all installed; the
          runtime kit-modules disable toggle gates native at the menu level). */}
      <ModWidgetsProvider widgets={modWidgets}>
        <NativeNavProvider>
          <Stack
            screenOptions={{
              // Dream's reserved volume inside the app: plain ground, ink titles.
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.foreground,
              contentStyle: { backgroundColor: colors.background },
              headerRight: () => <HeaderBell color={colors.foreground} />,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </NativeNavProvider>
      </ModWidgetsProvider>
    </ThemeProvider>
  );
}
