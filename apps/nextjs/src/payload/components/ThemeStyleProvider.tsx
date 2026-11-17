import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";

import { ADMIN_THEME_CSS } from "~/lib/theme/admin-theme";

/**
 * The admin's pinned fonts: Geist and Geist Mono, the same families as the
 * front end. Payload's auto-generated `(payload)/layout.tsx` doesn't load the
 * front end's `next/font` families, so the admin had no `--font-*` value and
 * fell back to the browser serif. We self-host them here.
 */
const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

/**
 * Font tokens injected at `:root` with each font's RESOLVED family
 * (`geist.style.fontFamily` → e.g. `"Geist", "Geist Fallback"`). We
 * deliberately avoid a `var(--font-geist-sans)` indirection: a custom
 * property's `var()` is substituted at the element where the property is
 * declared (`:root`), where `--font-geist-sans` isn't defined — so the
 * indirection would inherit the fallback, not Geist. Declaring the literal
 * family at `:root` themes the whole admin (chrome reads
 * `--font-body: var(--font-sans)` via custom.css).
 */
const ADMIN_FONT_CSS = `:root:root {
  --font-sans: ${geist.style.fontFamily}, system-ui, sans-serif;
  --font-mono: ${geistMono.style.fontFamily}, ui-monospace, Menlo, monospace;
}`;

/**
 * Payload admin provider (registered as `admin.components.providers`). Wraps
 * every admin route and injects the admin's FIXED theme as a `<style>`. Unlike
 * the front end — themed at runtime by the editable `theme-settings` global —
 * the admin is pinned to a hardcoded palette (`~/lib/theme/admin-theme.ts`), so
 * the admin chrome stays consistent regardless of the site-wide global.
 *
 * These tokens (`--background`/`--foreground`/…) are what `custom.css` maps onto
 * Payload's own chrome variables, so the admin follows the fixed theme. The
 * font-variable wrapper (a `display: contents` box, so no layout impact)
 * ensures `next/font` emits the `@font-face` rules for this route.
 */
export function ThemeStyleProvider({ children }: { children: ReactNode }) {
  return (
    <>
      <style
        id="theme-admin"
        dangerouslySetInnerHTML={{
          __html: `${ADMIN_THEME_CSS}\n${ADMIN_FONT_CSS}`,
        }}
      />
      <div
        className={`${geist.variable} ${geistMono.variable}`}
        style={{ display: "contents" }}
      >
        {children}
      </div>
    </>
  );
}
