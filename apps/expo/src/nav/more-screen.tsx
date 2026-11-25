import type { AndroidSymbol, SFSymbol } from "expo-symbols";
import { useMemo, useState } from "react";
import { FlatList, Platform, Pressable, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";

import type { NativeMenuEntry } from "@acme/app";
import { NATIVE_PROFILE_HREF } from "@acme/app";
import { Text } from "@acme/ui-native/text";

import { useBrandColors } from "~/lib/brand";
import { AppLogoGlyph, isAppLogo } from "./app-logo";
import { useNativeMenu } from "./native-nav-provider";

const PROFILE_ENTRY: NativeMenuEntry = {
  key: "core:/profile",
  label: "Profile",
  href: NATIVE_PROFILE_HREF,
  sf: "person.crop.circle.fill",
  md: "account_circle",
};

/** System-colour tiles behind each glyph, picked per item so they stay put. */
const TILE_COLORS = [
  "#0A84FF",
  "#30D158",
  "#5E5CE6",
  "#FF9F0A",
  "#FF375F",
  "#BF5AF2",
  "#FF453A",
  "#32ADE6",
];

function tileColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length] ?? "#0A84FF";
}

/**
 * The Search tab (iOS) / More tab (Android): every module in the menu, in
 * the order staff set, as an icon + name list, filtered by a search field.
 *
 * iOS 26: this is the tab bar's dedicated Search tab. Selecting it turns the
 * bottom bar into a full-width Liquid Glass search field, and the other tabs
 * collapse into one round button on the leading side that returns to the
 * tab you came from — all drawn by the system (`Stack.SearchBar` with
 * `placement="automatic"` inside a search-role tab), so it follows Reduce
 * Transparency etc. Android: the search field sits in the top app bar.
 *
 * Hidden items stay out (deep link only), except Profile — it holds sign
 * out, so it's always listed.
 */
export function MoreScreen() {
  const menu = useNativeMenu();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const all = [...menu.tabs, ...menu.more];
    if (!all.some((e) => e.href === NATIVE_PROFILE_HREF))
      all.push(PROFILE_ENTRY);
    const q = query.trim().toLowerCase();
    return q ? all.filter((e) => e.label.toLowerCase().includes(q)) : all;
  }, [menu, query]);

  return (
    <>
      <Stack.Screen
        options={{
          title: Platform.OS === "ios" ? "Search" : "More",
          headerLargeTitle: Platform.OS === "ios",
        }}
      />
      <Stack.SearchBar
        placement="automatic"
        placeholder="Search"
        onChangeText={(e) => setQuery(e.nativeEvent.text)}
        onCancelButtonPress={() => setQuery("")}
      />
      <FlatList
        data={items}
        keyExtractor={(e) => e.key}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingVertical: 8 }}
        ListEmptyComponent={
          <Text className="text-muted-foreground p-6 text-center">
            No matches.
          </Text>
        }
        renderItem={({ item }) => (
          <MenuRow item={item} onPress={() => router.push(item.href)} />
        )}
      />
    </>
  );
}

function MenuRow({
  item,
  onPress,
}: {
  item: NativeMenuEntry;
  onPress: () => void;
}) {
  const colors = useBrandColors();
  const logo = isAppLogo(item.sf);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      className="flex-row items-center gap-4 px-5 py-3 active:opacity-60"
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 9,
          borderCurve: "continuous",
          // The app's own entry sits on the brand colour, like its icon.
          backgroundColor: logo ? colors.primary : tileColor(item.key),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {logo ? (
          <AppLogoGlyph size={26} color="#FFFFFF" />
        ) : (
          <SymbolView
            name={{
              ios: item.sf as SFSymbol,
              android: item.md as AndroidSymbol,
            }}
            tintColor="#FFFFFF"
            size={20}
          />
        )}
      </View>
      <Text className="text-xl">{item.label}</Text>
    </Pressable>
  );
}
