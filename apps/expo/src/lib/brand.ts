import { useColorScheme } from "react-native";

/**
 * Dream colours for the few native surfaces that take a plain colour value
 * instead of a NativeWind class (navigation headers, screen backgrounds). They
 * are the sRGB values of the oklch tokens in `tooling/tailwind/theme.css`;
 * keep the two in step. See docs/BRAND.md.
 */
export const BRAND_COLORS = {
  light: {
    background: "#FFFFFF",
    foreground: "#101524",
    border: "#E3E6EC",
    primary: "#008246",
  },
  dark: {
    background: "#090C14",
    foreground: "#F2F3F7",
    border: "#292E38",
    primary: "#41D686",
  },
} as const;

/** The Dream palette for the device's current light/dark setting. */
export function useBrandColors() {
  return useColorScheme() === "dark" ? BRAND_COLORS.dark : BRAND_COLORS.light;
}
