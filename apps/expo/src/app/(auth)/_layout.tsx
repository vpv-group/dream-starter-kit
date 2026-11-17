import { Stack } from "expo-router";

import { useBrandColors } from "~/lib/brand";

export default function AuthLayout() {
  const colors = useBrandColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
