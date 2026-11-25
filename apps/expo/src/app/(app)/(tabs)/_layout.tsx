import type { AndroidSymbol, SFSymbol } from "expo-symbols";
import { Platform } from "react-native";
import { NativeTabs } from "expo-router/native-tabs";

import { useBrandColors } from "~/lib/brand";
import { APP_LOGO_GLYPH, isAppLogo } from "~/nav/app-logo";
import { useNativeMenu } from "~/nav/native-nav-provider";

const SLOTS = ["t0", "t1", "t2", "t3"] as const;

/**
 * The native tab bar, configured by staff in /admin → Navigation ("iOS and
 * Android App") and loaded at launch (NativeNavProvider) — no app release
 * needed to change it.
 *
 * NativeTabs can't add or remove tabs at runtime, so the tabs are fixed
 * slots (t0–t3) that render whichever screen the menu puts in them; unused
 * slots are hidden before the navigator mounts. The menu is fixed for the
 * session, so the bar never changes under the user (Apple HIG: stable tabs).
 *
 * iOS 26: the system Liquid Glass tab bar groups the tabs; the last trigger
 * has the Search role, which iOS draws as its own glass button on the
 * trailing side. Selecting it turns the bar into a full-width search field
 * with the tabs collapsed into one button that returns to the previous tab
 * (MoreScreen). No custom glass, backgrounds or blur — the system draws the
 * bar and adapts it to Reduce Transparency / Increase Contrast. iPad gets the
 * sidebar-adaptable tab bar. Android: Material bottom navigation with More.
 */
export default function TabsLayout() {
  const menu = useNativeMenu();
  const colors = useBrandColors();
  const ios = Platform.OS === "ios";

  return (
    <NativeTabs
      tintColor={colors.primary}
      minimizeBehavior="onScrollDown"
      sidebarAdaptable
    >
      {SLOTS.map((name, i) => {
        const tab = menu.tabs[i];
        return (
          <NativeTabs.Trigger key={name} name={name} hidden={!tab}>
            <NativeTabs.Trigger.Label>
              {tab?.label ?? ""}
            </NativeTabs.Trigger.Label>
            {tab && isAppLogo(tab.sf) ? (
              // The home tab wears the app logo (template-tinted), so iOS
              // 26's collapsed "back from Search" button shows the app mark.
              <NativeTabs.Trigger.Icon
                src={APP_LOGO_GLYPH}
                renderingMode="template"
              />
            ) : (
              <NativeTabs.Trigger.Icon
                sf={(tab?.sf ?? "circle") as SFSymbol}
                md={(tab?.md ?? "circle") as AndroidSymbol}
              />
            )}
          </NativeTabs.Trigger>
        );
      })}
      <NativeTabs.Trigger name="more" role={ios ? "search" : undefined}>
        <NativeTabs.Trigger.Label>
          {ios ? "Search" : "More"}
        </NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="menu" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
