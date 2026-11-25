import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { KeyValueStorage, NativeMenu } from "@acme/app";
import { defaultNativeNavConfig, useNativeNav } from "@acme/app";

import { useBrandColors } from "~/lib/brand";
import { modInstalled, modNavDefaults } from "~/mod/registry.generated";
import { NATIVE_SCREEN_HREFS } from "./screens";

const storage: KeyValueStorage = AsyncStorage;

/** Bundled first-launch menu: core + installed modules' defaults. */
const FALLBACK = defaultNativeNavConfig({
  modDefaults: modNavDefaults.native,
  modules: modInstalled,
});

const NativeMenuContext = createContext<NativeMenu | null>(null);

/**
 * Loads the staff-configured native menu (cached → network → bundled) and
 * holds it fixed for the session; children render once it's known, so the
 * tab bar mounts with its final set of tabs (they can't change while
 * mounted). The wait is a local storage read except on a first launch.
 */
export function NativeNavProvider({ children }: { children: ReactNode }) {
  const { menu } = useNativeNav({
    storage,
    availableHrefs: NATIVE_SCREEN_HREFS,
    fallback: FALLBACK,
  });
  const colors = useBrandColors();
  if (!menu) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }
  return (
    <NativeMenuContext.Provider value={menu}>
      {children}
    </NativeMenuContext.Provider>
  );
}

export function useNativeMenu(): NativeMenu {
  const menu = useContext(NativeMenuContext);
  if (!menu) throw new Error("useNativeMenu() outside <NativeNavProvider>");
  return menu;
}
