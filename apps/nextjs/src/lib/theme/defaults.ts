/**
 * Theme token defaults — the single TypeScript mirror of the CSS design tokens
 * in `tooling/tailwind/theme.css` (`@acme/tailwind-config/theme`).
 *
 * These power three things:
 *  1. the default values of the `theme-settings` Payload global,
 *  2. the fallback when the CMS/global is unavailable (fresh clone, no DB), and
 *  3. the serializer that turns a theme into the `<style>` injected site-wide.
 *
 * IMPORTANT: keep these values in sync with `theme.css` — that file is the SSR
 * no-flash default; this is the runtime/override default. They must match so the
 * day-one output is identical whether or not the global has been edited.
 */

/** One color token: the Payload field name (camelCase, no hyphens — Payload
 *  requires valid identifiers) ↔ the CSS custom property it drives. */
export interface ColorToken {
  /** Payload field name, e.g. `cardForeground`. */
  field: string;
  /** CSS variable name without the leading `--`, e.g. `card-foreground`. */
  cssVar: string;
  /** Human label for the admin field. */
  label: string;
  /** Default value in the light palette. */
  light: string;
  /** Default value in the dark palette. */
  dark: string;
}

/** The full ordered set of color tokens, light + dark, mirroring theme.css. */
export const COLOR_TOKENS: ColorToken[] = [
  {
    field: "background",
    cssVar: "background",
    label: "Background",
    light: "oklch(1 0 0)",
    dark: "oklch(0.155 0.018 268)",
  },
  {
    field: "foreground",
    cssVar: "foreground",
    label: "Foreground",
    light: "oklch(0.2 0.03 268)",
    dark: "oklch(0.965 0.005 264)",
  },
  {
    field: "card",
    cssVar: "card",
    label: "Card",
    light: "oklch(1 0 0)",
    dark: "oklch(0.205 0.021 268)",
  },
  {
    field: "cardForeground",
    cssVar: "card-foreground",
    label: "Card foreground",
    light: "oklch(0.2 0.03 268)",
    dark: "oklch(0.965 0.005 264)",
  },
  {
    field: "popover",
    cssVar: "popover",
    label: "Popover",
    light: "oklch(1 0 0)",
    dark: "oklch(0.205 0.021 268)",
  },
  {
    field: "popoverForeground",
    cssVar: "popover-foreground",
    label: "Popover foreground",
    light: "oklch(0.2 0.03 268)",
    dark: "oklch(0.965 0.005 264)",
  },
  {
    field: "primary",
    cssVar: "primary",
    label: "Primary",
    light: "oklch(0.53 0.14 155)",
    dark: "oklch(0.78 0.17 155)",
  },
  {
    field: "primaryForeground",
    cssVar: "primary-foreground",
    label: "Primary foreground",
    light: "oklch(1 0 0)",
    dark: "oklch(0.155 0.018 268)",
  },
  {
    field: "secondary",
    cssVar: "secondary",
    label: "Secondary",
    light: "oklch(0.965 0.008 264)",
    dark: "oklch(0.225 0.022 268)",
  },
  {
    field: "secondaryForeground",
    cssVar: "secondary-foreground",
    label: "Secondary foreground",
    light: "oklch(0.2 0.03 268)",
    dark: "oklch(0.965 0.005 264)",
  },
  {
    field: "muted",
    cssVar: "muted",
    label: "Muted",
    light: "oklch(0.985 0.004 264)",
    dark: "oklch(0.19 0.02 268)",
  },
  {
    field: "mutedForeground",
    cssVar: "muted-foreground",
    label: "Muted foreground",
    light: "oklch(0.52 0.02 264)",
    dark: "oklch(0.7 0.015 264)",
  },
  {
    field: "accent",
    cssVar: "accent",
    label: "Accent",
    light: "oklch(0.97 0.025 155)",
    dark: "oklch(0.25 0.05 155)",
  },
  {
    field: "accentForeground",
    cssVar: "accent-foreground",
    label: "Accent foreground",
    light: "oklch(0.2 0.03 268)",
    dark: "oklch(0.965 0.005 264)",
  },
  {
    field: "destructive",
    cssVar: "destructive",
    label: "Destructive",
    light: "oklch(0.55 0.21 25)",
    dark: "oklch(0.7 0.18 22)",
  },
  {
    field: "destructiveForeground",
    cssVar: "destructive-foreground",
    label: "Destructive foreground",
    light: "oklch(1 0 0)",
    dark: "oklch(0.155 0.018 268)",
  },
  {
    field: "border",
    cssVar: "border",
    label: "Border",
    light: "oklch(0.925 0.008 264)",
    dark: "oklch(0.3 0.02 268)",
  },
  {
    field: "input",
    cssVar: "input",
    label: "Input",
    light: "oklch(0.66 0.015 264)",
    dark: "oklch(0.5 0.02 268)",
  },
  {
    field: "ring",
    cssVar: "ring",
    label: "Ring",
    light: "oklch(0.53 0.14 155)",
    dark: "oklch(0.78 0.17 155)",
  },
  {
    field: "chart1",
    cssVar: "chart-1",
    label: "Chart 1",
    light: "oklch(0.6 0.16 155)",
    dark: "oklch(0.7 0.17 155)",
  },
  {
    field: "chart2",
    cssVar: "chart-2",
    label: "Chart 2",
    light: "oklch(0.8 0.13 155)",
    dark: "oklch(0.86 0.1 155)",
  },
  {
    field: "chart3",
    cssVar: "chart-3",
    label: "Chart 3",
    light: "oklch(0.53 0.24 264)",
    dark: "oklch(0.66 0.19 264)",
  },
  {
    field: "chart4",
    cssVar: "chart-4",
    label: "Chart 4",
    light: "oklch(0.56 0.16 45)",
    dark: "oklch(0.76 0.14 55)",
  },
  {
    field: "chart5",
    cssVar: "chart-5",
    label: "Chart 5",
    light: "oklch(0.45 0.03 266)",
    dark: "oklch(0.72 0.02 264)",
  },
  {
    field: "sidebar",
    cssVar: "sidebar",
    label: "Sidebar",
    light: "oklch(0.985 0.004 264)",
    dark: "oklch(0.19 0.02 268)",
  },
  {
    field: "sidebarForeground",
    cssVar: "sidebar-foreground",
    label: "Sidebar foreground",
    light: "oklch(0.2 0.03 268)",
    dark: "oklch(0.965 0.005 264)",
  },
  {
    field: "sidebarPrimary",
    cssVar: "sidebar-primary",
    label: "Sidebar primary",
    light: "oklch(0.53 0.14 155)",
    dark: "oklch(0.78 0.17 155)",
  },
  {
    field: "sidebarPrimaryForeground",
    cssVar: "sidebar-primary-foreground",
    label: "Sidebar primary foreground",
    light: "oklch(1 0 0)",
    dark: "oklch(0.155 0.018 268)",
  },
  {
    field: "sidebarAccent",
    cssVar: "sidebar-accent",
    label: "Sidebar accent",
    light: "oklch(0.965 0.008 264)",
    dark: "oklch(0.225 0.022 268)",
  },
  {
    field: "sidebarAccentForeground",
    cssVar: "sidebar-accent-foreground",
    label: "Sidebar accent foreground",
    light: "oklch(0.2 0.03 268)",
    dark: "oklch(0.965 0.005 264)",
  },
  {
    field: "sidebarBorder",
    cssVar: "sidebar-border",
    label: "Sidebar border",
    light: "oklch(0.925 0.008 264)",
    dark: "oklch(0.3 0.02 268)",
  },
  {
    field: "sidebarRing",
    cssVar: "sidebar-ring",
    label: "Sidebar ring",
    light: "oklch(0.53 0.14 155)",
    dark: "oklch(0.78 0.17 155)",
  },
  {
    field: "brand",
    cssVar: "brand",
    label: "Brand",
    light: "oklch(0.6 0.16 155)",
    dark: "oklch(0.6 0.16 155)",
  },
  {
    field: "brandForeground",
    cssVar: "brand-foreground",
    label: "Brand foreground",
    light: "oklch(0.78 0.17 155)",
    dark: "oklch(0.78 0.17 155)",
  },
];

/** A font choice: maps a stored value to the CSS `font-family` stack to apply.
 *  Sans families are loaded via `next/font` in the root layout and expose a CSS
 *  variable; `stack` references it so selection is a pure runtime CSS swap. */
export interface FontOption {
  value: string;
  label: string;
  /** The CSS value assigned to `--font-sans` / `--font-mono`. */
  stack: string;
}

export const FONT_SANS_OPTIONS: FontOption[] = [
  { value: "geist", label: "Geist Sans", stack: "var(--font-geist-sans)" },
  { value: "inter", label: "Inter", stack: "var(--font-inter)" },
  {
    value: "system",
    label: "System",
    stack: "ui-sans-serif, system-ui, sans-serif",
  },
];

export const FONT_MONO_OPTIONS: FontOption[] = [
  { value: "geist-mono", label: "Geist Mono", stack: "var(--font-geist-mono)" },
  {
    value: "jetbrains-mono",
    label: "JetBrains Mono",
    stack: "var(--font-jetbrains-mono)",
  },
];

export const FONT_SERIF_OPTIONS: FontOption[] = [
  {
    value: "instrument-serif",
    label: "Instrument Serif",
    stack: "var(--font-instrument-serif)",
  },
  {
    value: "merriweather",
    label: "Merriweather",
    stack: "var(--font-merriweather)",
  },
  { value: "lora", label: "Lora", stack: "var(--font-lora)" },
  { value: "system", label: "System Serif", stack: "ui-serif, Georgia, serif" },
];

export const DEFAULT_RADIUS = "0.625rem";
export const DEFAULT_LETTER_SPACING = "0rem";
export const DEFAULT_SPACING = "0.25rem";
export const DEFAULT_FONT_SANS = "geist";
export const DEFAULT_FONT_MONO = "geist-mono";
export const DEFAULT_FONT_SERIF = "instrument-serif";

/** Shadow primitives → composed into the shadcn `--shadow-*` scale. The stored
 *  (input) form is nullable/partial; the resolved form has every value. */
export interface ShadowSettings {
  color?: string | null;
  opacity?: number | null;
  blurRadius?: number | null;
  spread?: number | null;
  offsetX?: number | null;
  offsetY?: number | null;
}

export interface ResolvedShadow {
  color: string;
  opacity: number;
  blurRadius: number;
  spread: number;
  offsetX: number;
  offsetY: number;
}

export const DEFAULT_SHADOW: ResolvedShadow = {
  color: "oklch(0.2 0.03 268)",
  opacity: 0.06,
  blurRadius: 16,
  spread: 0,
  offsetX: 0,
  offsetY: 4,
};

/** A loose map of `field -> css color value`, as stored in a Payload group. */
export type ColorSet = Record<string, string | null | undefined>;

/** The shape the serializer consumes — structurally compatible with the
 *  generated `ThemeSetting` Payload global type. */
export interface ThemeSettingsInput {
  colorsLight?: ColorSet | null;
  colorsDark?: ColorSet | null;
  radius?: string | null;
  spacing?: string | null;
  letterSpacing?: string | null;
  fontSans?: string | null;
  fontMono?: string | null;
  fontSerif?: string | null;
  shadow?: ShadowSettings | null;
}

/** Default light palette keyed by Payload field name. */
export const lightDefaults: Record<string, string> = Object.fromEntries(
  COLOR_TOKENS.map((t) => [t.field, t.light]),
);

/** Default dark palette keyed by Payload field name. */
export const darkDefaults: Record<string, string> = Object.fromEntries(
  COLOR_TOKENS.map((t) => [t.field, t.dark]),
);

const FALLBACK_FONT_SANS = "var(--font-geist-sans)";
const FALLBACK_FONT_MONO = "var(--font-geist-mono)";
const FALLBACK_FONT_SERIF = "var(--font-instrument-serif)";

export function resolveFontSans(value: string | null | undefined): string {
  return (
    FONT_SANS_OPTIONS.find((f) => f.value === value)?.stack ??
    FALLBACK_FONT_SANS
  );
}

export function resolveFontMono(value: string | null | undefined): string {
  return (
    FONT_MONO_OPTIONS.find((f) => f.value === value)?.stack ??
    FALLBACK_FONT_MONO
  );
}

export function resolveFontSerif(value: string | null | undefined): string {
  return (
    FONT_SERIF_OPTIONS.find((f) => f.value === value)?.stack ??
    FALLBACK_FONT_SERIF
  );
}
