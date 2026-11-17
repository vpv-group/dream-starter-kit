/**
 * The Payload admin panel's FIXED theme.
 *
 * Unlike the front end — which is themed at runtime by the editable
 * `theme-settings` global (see `serialize.ts#themeToCss`) — the admin uses this
 * hardcoded palette so its chrome stays consistent regardless of what a staff
 * user sets the site-wide global to. `ThemeStyleProvider` injects this string
 * into the admin `<head>`; `custom.css` maps these shadcn tokens onto Payload's
 * own chrome variables.
 *
 * Conventions match `serialize.ts`:
 *  - Doubled `:root:root` selector raises specificity above `theme.css`'s plain
 *    `:root`, so the override wins regardless of `<head>` source order.
 *  - The dark block targets `[data-theme="dark"]` — the selector the Payload
 *    admin toggles (the front end uses `.dark`). The source palette below uses
 *    `.dark`; it's remapped to `[data-theme="dark"]` here.
 *
 * To restyle the admin, edit the token values here. This is intentionally a
 * static constant, independent of `COLOR_TOKENS` / the CMS global.
 *
 * Fonts (`--font-sans`/`--font-mono`) are NOT set here — `ThemeStyleProvider`
 * injects them at `:root` with the resolved `next/font` Geist families, because a
 * `var(--font-geist-sans)` indirection would resolve at `:root` (where that
 * variable isn't defined) and inherit the fallback rather than Geist.
 */
export const ADMIN_THEME_CSS = `:root:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.2 0.03 268);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.2 0.03 268);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.2 0.03 268);
  --primary: oklch(0.53 0.14 155);
  --primary-foreground: oklch(1 0 0);
  --secondary: oklch(0.965 0.008 264);
  --secondary-foreground: oklch(0.2 0.03 268);
  --muted: oklch(0.985 0.004 264);
  --muted-foreground: oklch(0.52 0.02 264);
  --accent: oklch(0.97 0.025 155);
  --accent-foreground: oklch(0.2 0.03 268);
  --destructive: oklch(0.55 0.21 25);
  --border: oklch(0.925 0.008 264);
  /* Payload fills fields with --input (custom.css → --theme-input-bg), so the
     admin uses Dream's raised surface here, not the front end's outline grey. */
  --input: oklch(0.965 0.008 264);
  --ring: oklch(0.53 0.14 155);
  --chart-1: oklch(0.6 0.16 155);
  --chart-2: oklch(0.8 0.13 155);
  --chart-3: oklch(0.53 0.24 264);
  --chart-4: oklch(0.56 0.16 45);
  --chart-5: oklch(0.45 0.03 266);
  --radius: 0.625rem;
  --sidebar: oklch(0.985 0.004 264);
  --sidebar-foreground: oklch(0.2 0.03 268);
  --sidebar-primary: oklch(0.53 0.14 155);
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-accent: oklch(0.965 0.008 264);
  --sidebar-accent-foreground: oklch(0.2 0.03 268);
  --sidebar-border: oklch(0.925 0.008 264);
  --sidebar-ring: oklch(0.53 0.14 155);
}
:root:root[data-theme="dark"] {
  --background: oklch(0.155 0.018 268);
  --foreground: oklch(0.965 0.005 264);
  --card: oklch(0.205 0.021 268);
  --card-foreground: oklch(0.965 0.005 264);
  --popover: oklch(0.205 0.021 268);
  --popover-foreground: oklch(0.965 0.005 264);
  --primary: oklch(0.78 0.17 155);
  --primary-foreground: oklch(0.155 0.018 268);
  --secondary: oklch(0.225 0.022 268);
  --secondary-foreground: oklch(0.965 0.005 264);
  --muted: oklch(0.19 0.02 268);
  --muted-foreground: oklch(0.7 0.015 264);
  --accent: oklch(0.25 0.05 155);
  --accent-foreground: oklch(0.965 0.005 264);
  --destructive: oklch(0.7 0.18 22);
  --border: oklch(0.3 0.02 268);
  --input: oklch(0.225 0.022 268);
  --ring: oklch(0.78 0.17 155);
  --chart-1: oklch(0.7 0.17 155);
  --chart-2: oklch(0.86 0.1 155);
  --chart-3: oklch(0.66 0.19 264);
  --chart-4: oklch(0.76 0.14 55);
  --chart-5: oklch(0.72 0.02 264);
  --sidebar: oklch(0.19 0.02 268);
  --sidebar-foreground: oklch(0.965 0.005 264);
  --sidebar-primary: oklch(0.78 0.17 155);
  --sidebar-primary-foreground: oklch(0.155 0.018 268);
  --sidebar-accent: oklch(0.225 0.022 268);
  --sidebar-accent-foreground: oklch(0.965 0.005 264);
  --sidebar-border: oklch(0.3 0.02 268);
  --sidebar-ring: oklch(0.78 0.17 155);
}`;
