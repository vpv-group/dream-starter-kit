import type { ImageSourcePropType } from "react-native";
import { Image } from "react-native";

import { APP_LOGO_ICON } from "@acme/app";

/**
 * The app's logo as a single-colour glyph (the Dream icon, check knocked
 * out), rendered as a template so the tab bar tints it like a system symbol.
 * 28pt canvas at 1x/2x/3x. Swap these PNGs when you rebrand (docs/BRAND.md).
 */
// Metro resolves @2x/@3x by suffix; require() is how RN loads bundled images.
export const APP_LOGO_GLYPH =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("../../assets/tab-home.png") as ImageSourcePropType;

/** Is this menu icon "use the app logo"? */
export const isAppLogo = (icon: string): boolean => icon === APP_LOGO_ICON;

export function AppLogoGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Image
      source={APP_LOGO_GLYPH}
      style={{ width: size, height: size, tintColor: color }}
      accessibilityIgnoresInvertColors
    />
  );
}
