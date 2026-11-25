# Brand

Dream Starter Kit is a Dream product, and the kit ships in Dream's brand: the
Dream logo, Dream emerald, and a shared type and neutral system. Dream and
Future.dev are built from the same kit: neutrals, ink, type, spacing and radius
are shared; the emerald, the D shape and the check are Dream's own. This page
says what the parts are, where they live in the code, and how to replace them
with your own brand.

The Apache-2.0 licence covers the code, not the Dream name or logo (see section
6 of the licence). If you ship your own product from this kit, replace them.

## Logo

The icon is a D whose counter is a check. The logo is the icon and the product
name, drawn as artwork. The wordmark is not typed, so never set "Dream" or
"Dream Starter Kit" in Geist as a substitute for the files.

| File                                                                 | Use                                                                                                                         |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `apps/nextjs/public/brand/dream-starter-kit-logo-color.svg`          | Emerald icon, ink type. Light grounds                                                                                       |
| `apps/nextjs/public/brand/dream-starter-kit-logo-reversed.svg`       | Emerald icon, white type. Dark grounds                                                                                      |
| `apps/nextjs/public/brand/dream-icon-green.svg`                      | The icon alone, where the name is already present                                                                           |
| `apps/nextjs/public/favicon.svg`, `favicon.ico`, `favicon-96x96.png` | Favicons. The SVG switches to a lighter green in dark mode                                                                  |
| `apps/nextjs/public/apple-touch-icon.png`, `web-app-manifest-*.png`  | Home-screen icons: white D with an emerald check on an emerald tile                                                         |
| `apps/expo/assets/icon.png`                                          | App icon, full bleed (the stores apply the corner mask)                                                                     |
| `apps/expo/assets/adaptive-icon.png`                                 | Android adaptive icon foreground, inside the safe zone, on `#009B53`                                                        |
| `apps/expo/assets/splash-icon.png`                                   | Splash screen mark                                                                                                          |
| `apps/expo/assets/tab-home.png`, `@2x`, `@3x`                        | Native Home tab glyph: the icon in black on transparent with the check cut out, 24pt on a 28pt canvas. The tab bar tints it |

Rules:

- Use the colour version on light grounds and the reversed version on dark ones.
  The site header and footer switch between them with the theme. On phones the
  header shows the icon alone, since the full logo would crowd it.
- Clear space is at least one ring (the distance from the icon's flat side to
  the check) on every side.
- Do not redraw, stretch, rotate, outline, or add a shadow or gradient. Do not
  recolour outside emerald, white and ink.
- The Payload admin shows the icon in its breadcrumb and the logo on Payload's
  own sign-in screens (`apps/nextjs/src/payload/components/BrandIcon.tsx`,
  `BrandLogo.tsx`; colours follow the admin's light/dark toggle in
  `app/(payload)/custom.css`). Replace both when you rebrand.
- The header and footer show the drawn logo only while the app name is still
  `Dream` and no logo is uploaded in `/admin` → Theme
  (`apps/nextjs/src/components/starter-kit-logo.tsx`). Rename the app or upload
  a logo and yours takes over.

## Colour

The tokens live in `tooling/tailwind/theme.css`, light and dark, in oklch. Hex
values below are their sRGB renderings.

| Role                                                  | Token                             | Light                           | Dark      |
| ----------------------------------------------------- | --------------------------------- | ------------------------------- | --------- |
| Dream emerald: the icon, finished states, large fills | `brand`                           | `#009B53`                       | `#009B53` |
| Buttons, active states, focus ring                    | `primary`, `ring`                 | `#008246`                       | `#41D686` |
| Text on `primary`                                     | `primary-foreground`              | `#FFFFFF`                       | `#090C14` |
| Inline links                                          | `link`                            | `#00793F`                       | `#61DA92` |
| Page ground                                           | `background`                      | `#FFFFFF`                       | `#090C14` |
| Headings and values                                   | `foreground`                      | `#101524`                       | `#F2F3F7` |
| Labels and captions                                   | `muted-foreground`                | `#636975`                       | `#9A9FA8` |
| Hairlines                                             | `border`                          | `#E3E6EC`                       | `#292E38` |
| The dark band and footer, in both themes              | `ink`, `on-ink`, `primary-on-ink` | `#0B1121`, `#F3F5F9`, `#41D686` | same      |
| Waiting states and notices                            | `info`                            | `#1D57F3`                       | `#87AFFF` |
| Something to fix                                      | `warning`                         | `#985B0B`                       | `#F2AF48` |
| Errors and deleting                                   | `destructive`                     | `#D01C29`                       | `#FA686A` |

Rules:

- Green means done, or the one next action. Nothing is green for decoration.
- Small text never sits on emerald: white on `brand` is only 3.6:1. Buttons use
  `primary`, which carries white text at 4.9:1.
- Blue is information, not a second accent.
- No gradients between brand colours, and colour is never the only sign of a
  state. A finished state always has a check and a word.
- Every text colour meets 4.5:1 on the grounds it is meant for, in both themes.

The shadcn tokens (`background`, `primary`, `accent`, `sidebar-*`, `chart-*`,
`brand` and the rest) are mirrored in `apps/nextjs/src/lib/theme/defaults.ts`
and can be changed at runtime from `/admin` → Theme. The extended palette
(`surface`, `ink`, `on-ink`, `link`, `info`, `success`, `warning`, the
`primary-*` tints) is static: edit it in `theme.css`. Every token is available
as a Tailwind colour, for example `bg-ink text-on-ink` or `text-link`.

Native surfaces that take a plain colour value instead of a class (navigation
headers, screen backgrounds) read `apps/expo/src/lib/brand.ts`. The Payload
admin has its own fixed copy of the palette in
`apps/nextjs/src/lib/theme/admin-theme.ts`.

## Type

- **Geist** is the voice: headings, body and buttons.
- **Geist Mono** is for exact values, step counters and status lines.
- **Instrument Serif italic** is for the customer's own words, such as the thing
  they want to build. Nothing else is set in it.

All three are open source (SIL Open Font License) and are self-hosted through
`next/font`. Headlines are in sentence case; nothing is set smaller than 12px.
The native app uses the system typeface for running text.

## Shape

Radius is 10px for buttons and fields and 14px for cards (`--radius:
0.625rem`). Buttons are rounded rectangles, not pills. Dream's own shape is the
D: flat on the left, round on the right
(`border-radius: 0 9999px 9999px 0`), for status chips and step numbers.

## Voice

- Plain and exact. Say what to type, not "follow the instructions".
- Short sentences, sentence case, numbers as digits.
- No exclamation marks or emoji, and no "simply", "just" or "easy".
- Free things say Free. The kit is "Free forever. Open source."
- Never promise speed or approval, and label every time estimate as one.

## Use your own brand

1. Set your app name, logo, favicon, colours and fonts in `/admin` → Theme, or
   change the defaults in `tooling/tailwind/theme.css` and
   `apps/nextjs/src/lib/theme/defaults.ts` (keep the two in step), and
   `APP_NAME` in `packages/config`.
2. Replace the files in the logo table above with your own, keeping the names
   or updating `apps/expo/app.config.ts` and
   `apps/nextjs/src/app/(frontend)/layout.tsx`.
3. Update the Open Graph image in
   `apps/nextjs/src/app/(frontend)/opengraph-image.tsx`, the palette in
   `apps/expo/src/lib/brand.ts` and the admin palette in
   `apps/nextjs/src/lib/theme/admin-theme.ts`.
4. Change the site copy in `apps/nextjs/src/lib/site-chrome.ts` and the seeded
   pages in `apps/nextjs/src/payload/seed.ts`.
