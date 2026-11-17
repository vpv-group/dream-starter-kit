import { ScrollView, View } from "react-native";
import { Stack, useRouter } from "expo-router";

import type { NavMenuEntry } from "@acme/app";
import { useSession } from "@acme/api";
import { useNavMenu } from "@acme/app";
import { APP_NAME } from "@acme/config/constants";
import { useModWidgets } from "@acme/mod-kit/react";
import { Button } from "@acme/ui-native/button";
import { Text } from "@acme/ui-native/text";

/**
 * Fallback menu while the CMS-driven one (useNavMenu → nav-items collection)
 * is loading or unreachable — mirrors the host's core nav defaults.
 */
const FALLBACK_MENU: NavMenuEntry[] = [
  { key: "core:/content/posts", label: "Posts", href: "/content/posts" },
  { key: "mod:chat:/a/chat", label: "Chat", href: "/a/chat" },
  {
    key: "mod:reminders:/a/reminders",
    label: "Reminders",
    href: "/a/reminders",
  },
  {
    key: "mod:notifications:/a/notifications",
    label: "Notifications",
    href: "/a/notifications",
  },
  { key: "mod:billing:/a/billing", label: "Pricing", href: "/a/billing" },
  { key: "core:/profile", label: "Profile", href: "/profile" },
];

export function HomeScreen() {
  const router = useRouter();
  const { user } = useSession();
  const widgets = useModWidgets();
  // CMS-driven menu: installed-and-enabled modules appear automatically;
  // staff renames/reordering/toggles from /admin apply on next fetch.
  const { data: menu } = useNavMenu("native");
  const items = menu && menu.length > 0 ? menu : FALLBACK_MENU;

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="items-center justify-center gap-4 p-6"
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
      {items.map((item, i) => (
        <Button
          key={item.key}
          title={item.label}
          variant={i === 0 ? "default" : "outline"}
          onPress={() => router.push(item.href)}
        />
      ))}
    </ScrollView>
  );
}
