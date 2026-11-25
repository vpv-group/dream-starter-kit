import { Redirect } from "expo-router";

import { useNativeMenu } from "~/nav/native-nav-provider";

/**
 * "/" opens the first tab of the configured tab bar — or the More / Search
 * tab if staff left no tabs. (The home screen — the dashboard module's
 * `mount: "index"` screen — lives at /home and is a menu item like any other.)
 */
export default function Index() {
  const menu = useNativeMenu();
  return <Redirect href={menu.tabs.length > 0 ? "/t0" : "/more"} />;
}
