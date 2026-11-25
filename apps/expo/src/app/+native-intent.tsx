import AsyncStorage from "@react-native-async-storage/async-storage";

import { readLastTabHrefs, tabSlotForPath } from "@acme/app";

/**
 * Incoming links (dreamstarter://…, universal links): a link to a screen
 * that is currently in the tab bar opens that tab instead of pushing a
 * second copy over the tabs. Everything else — hidden modules (deep link
 * only), detail screens, More items — routes normally.
 */
export async function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): Promise<string> {
  try {
    const pathname = toPathname(path);
    const hrefs = await readLastTabHrefs(AsyncStorage);
    const slot = tabSlotForPath(
      { tabs: hrefs.map((href) => ({ href })) },
      pathname,
    );
    return slot === undefined ? path : `/t${slot}`;
  } catch {
    return path;
  }
}

/** "dreamstarter://a/chat" → "/a/chat"; "https://host/a/chat" → "/a/chat". */
function toPathname(path: string): string {
  if (/^https?:\/\//i.test(path)) return new URL(path).pathname;
  const m = /^[a-z][a-z0-9+.-]*:\/\/(.*)$/i.exec(path);
  return m ? `/${m[1] ?? ""}` : path;
}
