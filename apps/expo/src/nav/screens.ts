import type * as React from "react";

import PostsList from "~/app/(app)/content/posts";
import Profile from "~/app/(app)/profile";
import { modNativeScreens } from "~/mod/registry.generated";

/**
 * Every screen the native menu can point at, by href: installed modules'
 * static screens (generated) plus the host's core menu screens. The tab slots
 * render from this map; a menu row whose href isn't here (a module added on
 * the server but not shipped in this build) is dropped from the menu.
 */
export const NATIVE_SCREENS: Record<string, React.ComponentType> = {
  ...modNativeScreens,
  "/content/posts": PostsList,
  "/profile": Profile,
};

export const NATIVE_SCREEN_HREFS: ReadonlySet<string> = new Set(
  Object.keys(NATIVE_SCREENS),
);
