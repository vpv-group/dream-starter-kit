import { ScrollView, View } from "react-native";
import { Stack } from "expo-router";

import { useSession } from "@acme/api";
import { APP_NAME } from "@acme/config/constants";
import { useModWidgets } from "@acme/mod-kit/react";
import { Text } from "@acme/ui-native/text";

/**
 * The native home screen (served at /home; the first tab by default). The
 * app menu itself is the tab bar + More / Search screen, configured by staff
 * in /admin → Navigation; home shows the installed modules' widgets.
 */
export function HomeScreen() {
  const { user } = useSession();
  const widgets = useModWidgets();

  return (
    <ScrollView
      className="bg-background flex-1"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="items-center gap-4 p-6"
    >
      <Stack.Screen options={{ title: APP_NAME }} />
      <Text className="text-4xl font-bold">{APP_NAME}</Text>
      <Text className="text-muted-foreground text-center">
        Signed in as {user?.email}
      </Text>
      {/* Home-screen widgets from installed modules (host-provided). */}
      {widgets.length > 0 && (
        <View className="w-full gap-2">
          {widgets.map(({ slug, Widget }) => (
            <Widget key={slug} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
