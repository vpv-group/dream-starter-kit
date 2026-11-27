# Native packages and config plugins

The Expo app (`apps/expo`) ships the native code the kit itself uses
(router, notifications, secure store, web browser, symbols, …). Everything
else a feature needs on iOS and Android — a file or photo picker, camera,
location, contacts, calendar, biometrics — **comes with the module that uses
it**. An app's binary then contains, and asks permission for, only what its
installed modules need.

## How a module brings native code

1. **List the package in the module's own `package.json` `dependencies`**, at
   the app's Expo SDK version (the one `npx expo install <pkg>` picks, e.g.
   `"expo-image-picker": "~58.0.4"`). The app depends on every installed
   `@acme/mod-*` package, and Expo's autolinking follows dependencies
   recursively (Expo SDK 54+), so the package is compiled into the app — no
   change to `apps/expo/package.json`.
2. **If it needs permissions or other native config**, ship a config plugin:
   an `app.plugin.js` at the package root that applies the packages' own
   plugins with the module's wording:

   ```js
   // modules/<slug>/app.plugin.js
   // Require the package's plugin directly: it's the module's dependency,
   // so a plugin *name* wouldn't resolve from the app. Plugins built from
   // TypeScript export `default`.
   const imagePicker = require("expo-image-picker/app.plugin");
   const withImagePicker = imagePicker.default ?? imagePicker;

   module.exports = (config) =>
     withImagePicker(config, {
       photosPermission: "Attach photos to your tasks.",
       microphonePermission: false, // also removes RECORD_AUDIO on Android
     });
   ```

   Export it from `package.json` (`"./app.plugin.js": "./app.plugin.js"`)
   and set `native: { plugin: true }` in `module.config.ts`. `pnpm mod sync`
   adds the module to `apps/expo/src/mod/plugins.generated.json`, which
   `app.config.ts` appends to its `plugins`.

3. **Import the package from `./native` only** (Metro sees `.` and `./native`;
   see [MODULES.md](./MODULES.md) → Bundle safety).

`pnpm mod sync` checks the versions: an `expo-*` package from another SDK, or
a range that conflicts with a package the app already lists, fails sync with
the version to use.

## Installing a module with native code needs a new build

Native code can't be delivered over the air. `pnpm mod sync` records what
each module adds in `apps/expo/src/mod/native.generated.json` and prints a
notice when it changes; module install/update/remove PRs opened from /admin
get the **`dream-native-rebuild`** label. After merging, ship the apps with a
new EAS build (`eas build`, then submit). Web deploys are unaffected.

## App Store and Google Play

- Every permission needs a **usage string** saying why (iOS shows it in the
  prompt). The module's plugin sets them; to change the wording for your app,
  pass the same plugin again in `apps/expo/app.config.ts` after
  `...modPlugins` — the later value wins.
- Declare what you collect in Apple's **privacy details** and Google Play's
  **data safety** form (e.g. photos uploaded as attachments).
- Removing a module removes its packages and plugin from the next build.

## What the kit leaves out on purpose

- In-app purchases (Stripe is web-only; see golden rule #4 in CLAUDE.md).
- Background location and background tasks (extra review and battery cost) —
  a module can add them, with the review it brings.
