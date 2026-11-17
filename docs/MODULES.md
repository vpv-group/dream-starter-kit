# Modules

## Naming

A module is something you add to your app, such as Billing or Notifications.
In code it is a folder in `modules/`; the code says `module` in full
(`defineModule`, `module.config.ts`, `/api/modules`) and `mod` where a short
prefix is needed (`@acme/mod-<slug>`, `pnpm mod`, `mod_<slug>_*` tables,
`/api/mod/<slug>`, `MOD_*` env vars). A feature is one thing a module does,
such as a pricing screen or a coupon. A connector is a module's link to
another company's service, such as Slack or Stripe.

In this kit, `chat-adapter-slack` is the Slack connector and
`chat-adapter-sendblue` is the Sendblue connector: both let the AI Chat module
answer outside the app.

Modules used to be called "extensions" (`ext` for short). Projects created
before the rename upgrade automatically, apart from a few settings outside the
repo; see [Upgrading from extensions](#upgrading-from-extensions).

## Overview

The kit is a host for **installable modules**: vendored pnpm workspace
packages under `modules/<slug>/` that own their tables, screens, API routes,
CMS collections and settings — installable with one command (or one click in
`/admin`), updatable from upstream even after local edits, and removable
without touching unrelated code. Design rationale lives in
`docs/MODULES-PLAN.md`; this is the working reference.

**The governing constraint:** Next.js and Expo are statically bundled and
serverless has a read-only filesystem. There is no runtime plugin loading —
*installing a module means code lands in the git repo, CI gates it, the
deploy rolls, and the boot-time bootstrap applies migrations.* The framework
makes that pipeline feel like one click.

## The model in one paragraph

A module is a workspace package with a typed manifest
(`module.config.ts`, `defineModule()` from `@acme/mod-kit`) and a strict
exports split that keeps server/Payload code out of the native bundle. The
host consumes modules **only** through committed generated files produced by
`pnpm mod sync` (registries, route stubs, materialized migrations) — static
imports, no runtime discovery. Forgetting sync fails `pnpm test` via the
registry drift test. Provenance lives in `modules.lock` + hidden
`refs/mod-base/<slug>` snapshot refs, which make updates a real git three-way
merge over your local modifications.

## Anatomy (the working reference is `modules/reminders`)

```
modules/<slug>/
  module.config.ts      defineModule({...}) — the manifest
  package.json             @acme/mod-<slug>; exports map below
  src/
    index.ts               CLIENT-SAFE barrel: validators + hooks (web+native)
    hooks/  validators/    zod/v4 + react-query over useSupabase()
    web/                   client components (@acme/ui); may import next/*
    web-server/            optional: RSC pages using the Payload Local API
    native/                react-native-reusables screens (@acme/ui-native)
    server/                import "server-only"; exports routes/publicRoutes
    payload/               collections, globals, plugins, migrations, seed, settings
  supabase/
    migrations/001_*.sql   LOCAL sequence numbers — never timestamps
    drop.sql               teardown for `mod remove`
    functions/<slug>-*/    optional Deno edge functions
  tests/                   vitest unit tests (run by root `pnpm test`)
```

### Bundle safety (the hard rules)

| Entry          | May import                                              | Guarded by |
| -------------- | -------------------------------------------------------- | ---------- |
| `.` (barrel)   | zod, react-query, `@acme/api`, `@acme/config`, `@acme/cms` types | RN-safe by construction; expo lint bans the rest |
| `./web`        | `@acme/ui`, next/* — **client-safe only**                 | the client registry imports it for widgets — server imports here leak into client chunks |
| `./web-server` | payload Local API, node — RSC pages (`rsc: true` routes)  | never imported client-side |
| `./native`     | `@acme/ui-native`, expo-*                                 | the only module code Metro ever sees (plus `.`) |
| `./server`     | anything server-side; first line `import "server-only"`   | poison pill + dispatcher-only imports |
| `./payload`    | `payload`, `@acme/mod-kit/payload`                        | unreachable from clients |

The CI `expo export` smoke check is the backstop: a server import leaking into
the native graph fails the PR.

## Namespacing (collisions hard-fail `mod sync`)

| Thing | Rule | Example |
|---|---|---|
| slug / package | `^[a-z][a-z0-9-]{1,30}$` / `@acme/mod-<slug>` | `chat` |
| Supabase tables | `mod_<slug_snake>` or `mod_<slug_snake>_*`, RLS required | `mod_chat_threads` |
| Payload slugs | `mod-<slug>-*` (labels stay clean) | `mod-billing-plans` |
| Web routes | `/a/<slug>/…` default; validated `mount` overrides | billing mounts `/billing` |
| Server API | `/api/mod/<slug>/…` | `POST /api/mod/chat/stream` |
| Edge functions | `<slug>-*` | `reminders-process` |
| Env vars | `MOD_<SLUG>_*` (client keys get `NEXT_PUBLIC_`/`EXPO_PUBLIC_` added by codegen) | `MOD_CHAT_MAX_TOKENS` |

A best-effort SQL lint verifies migrations only DDL tables the manifest
declares and never touch `auth.*`/`storage.*`/role/grant DDL.

## How the host consumes modules

`pnpm mod sync` (drift-tested, so commit its outputs):

- **registries** in `apps/nextjs/src/mod/*.generated.ts` +
  `apps/expo/src/mod/*.generated.ts`: nav defaults, widgets, icon map, server
  route tables, Payload collections/globals/plugins/migrations/seeds/settings,
  merged env shapes, the bundled lock;
- **route stubs**: two-line `page.tsx`/screen files under `/a/<slug>` (or the
  mount override), plus a per-module `layout.tsx` that 404s when disabled;
- **migrations**: module SQL is version-pinned (`modules/.mod-lock.json`)
  and copied into `supabase/migrations/`; Payload migrations are copied into
  the host migrationDir (local CLI) *and* merged into `prodMigrations` (prod);
- **app deps**: `@acme/mod-<slug>` entries in both apps' package.json;
- the `.env.example` fenced block.

**Server API**: one dispatcher (`/api/mod/[mod]/[[...route]]`) authenticates
every call (session cookie on web, `Authorization: Bearer` on native), applies
the shared rate limit and the enablement gate, then matches `"METHOD /path"` in
the module's `routes` table — golden rule #6 holds for every module
endpoint with zero per-module auth code. `publicRoutes` (manifest
`server.publicRoutes`) skips the session requirement for genuinely anonymous
flows (billing's guest checkout) but stays rate-limited; signature-verified
endpoints (Stripe webhooks) belong in edge functions or Payload plugin
endpoints instead.

**Menus are CMS-driven** (`kit-modules` + `nav-items` collections,
**Modules** admin group): manifest nav entries are *defaults*, seeded by the
boot reconcile (`lib/mod/reconcile-nav.ts`); staff rename/drag-reorder/re-icon/
toggle in `/admin` and the web sidebar + native `useNavMenu()` follow without a
redeploy. Disabling a module in `kit-modules` hides its menu items,
404s its pages and API, and removes its dashboard widgets — without
uninstalling.

**Settings screens** (§ per-module config): export `settings =
defineModuleSettings({ slug, name, fields })` from `./payload` and set
`cms.hasSettings: true`. The screen appears under the **Modules** admin group
(versioned, staff-read/admin-update; `publicRead` for client-consumed toggles).
Server code reads it with `getModuleSettings(payload, settings)` — defaults
apply before the screen is ever saved. Secrets stay in the zod env schema.

**Services** (cross-module): declare `requires: ["notifications"]` and
import the provider's exported APIs directly — e.g.
`notify()` from `@acme/mod-notifications/server`, `usePremium()` from
`@acme/mod-billing`. `database.dml` whitelists DML on a dependency's tables
(or the tiny core whitelist: `tags`, `user_tags`) for edge functions that
follow the SQL contract.

**Widgets**: declare `widgets: { web, native }` (export names). The host wires
its generated widget registry through `@acme/mod-kit/react`'s
`ModWidgetsProvider`; the dashboard module renders `useModWidgets()`.

## Lifecycle

```bash
pnpm mod create <slug>            # working scaffold (table+RLS, hooks, screens,
                                  #   widget, settings, ping route, tests)
pnpm mod add <url[#vX.Y.Z]|.zip>  # vendor + validate + snapshot + lock + sync
pnpm mod update <slug> [--to vX.Y.Z] [--continue]
pnpm mod remove <slug> [--keep-data]
pnpm mod list | status [--json] [--check]
pnpm mod eject <slug> --repo <url>
pnpm mod payload-migrate <slug> <desc>
pnpm mod sync                     # after ANY change under modules/
```

Updates are a three-way merge (base = `refs/mod-base/<slug>` pinned in the
lock, ours = your possibly-modified copy, theirs = upstream) — local edits
survive clean updates; conflicts get standard markers + `--continue`.
`remove` refuses while another installed module `requires` the target,
generates the drop migrations (Supabase + a best-effort cms scaffold), and
tombstones the lock (pinned migration versions are never reused).

## Admin panel + automatic updates

`/admin/modules` lists installed modules (from the **bundled** lock — an
honest "this deploy contains it" signal), the curated catalog
(`MOD_CATALOG_URL`, format: `docs/module-catalog.example.json`),
install-from-GitHub and verified zip-upload forms, and live operations. Every
mutation dispatches `.github/workflows/module-ops.yml`, which runs the same
CLI on a runner, enforces **path confinement** (the op may only write
`modules/<slug>/**` + known sync outputs), and opens a labeled PR. A daily
schedule opens update PRs with auto-merge — CI green ⇒ merged ⇒ deployed ⇒
migrations at boot. Brakes: `MOD_AUTO_UPDATE=off` / `MOD_AUTO_MERGE=off`
(repo variables), per-module `pinned` in the lock; removals never
auto-merge.

**Founder setup:** create a fine-grained PAT (contents:write,
pull-requests:write, actions:read on this repo); set it as the `MOD_OPS_TOKEN`
repo secret AND the `GITHUB_OPS_TOKEN` Vercel env (plus `GITHUB_REPO` off
Vercel); enable “Allow auto-merge” in the repo settings.

## Trust model (read before installing)

Installing a module = trusting its author like an npm dependency: vendored
code runs server-side with env access and its SQL runs as the privileged
bootstrap role. No sandbox is claimed. The mitigations are review surface and
hygiene: everything is a PR (zip installs included), pre-PR validation
(manifest schema, namespacing, mounts, SQL lint, path confinement,
Payload-plugin flagging, the license gate, pnpm's install-script blocking),
the full CI on every PR, and documented GitHub hardening (branch protection +
fine-grained PAT). With auto-update on, module authors can effectively ship
code to your server gated only by your CI — pinning and review mode are the
brakes.

## Versioning

`KIT_VERSION` (`@acme/config`, = root package.json version, unit-tested)
anchors `kitCompat` ranges, checked at add/update/sync. Module version =
git tag = package.json (the template module CI enforces it). Incompatible
after a kit upgrade = a warning state, not a kill switch — vendored code keeps
running until updated.

## Upgrading from extensions

Modules used to be called "extensions": the folder was `extensions/`, packages
were `@acme/ext-<slug>`, tables `ext_<slug>_*`, and the CLI `pnpm ext`. A
project created before the rename upgrades like this.

**Automatic (on the next deploy, or `pnpm db:reset` locally):**

- Each table-owning module ships a migration that renames its `ext_*` tables to
  `mod_*`, together with their constraints, indexes and RLS policies
  (`modules/<slug>/supabase/migrations/*_rename_to_mod_prefix.sql`). Rows,
  grants and foreign keys are kept.
- A Payload migration (`20261117_200000_rename_extensions_to_modules`) renames
  the CMS side: every installed module's `ext-<slug>-*` collections and
  globals become `mod-<slug>-*`, `kit-extensions` becomes `kit-modules`, and nav-items' `extension` field
  becomes `module`. Staff edits to menus, saved admin preferences and document
  locks carry over.
- A new private `module-uploads` bucket replaces `extension-uploads` for admin
  zip uploads. Storage won't let a migration delete buckets, so the old one
  stays; delete it from Studio if you like (it only ever held one-off zips).
- The CLI still finds base snapshots stored under the old `refs/ext-base/*` and
  re-roots them under `modules/`, so `pnpm mod update` and `pnpm mod status`
  keep working for modules installed before the rename.

**By hand (settings that live outside the repo):**

| Before | After | Where |
| --- | --- | --- |
| `EXT_OPS_TOKEN` | `MOD_OPS_TOKEN` | GitHub repo secret |
| `EXT_AUTO_UPDATE`, `EXT_AUTO_MERGE` | `MOD_AUTO_UPDATE`, `MOD_AUTO_MERGE` | GitHub repo variables |
| `EXT_CATALOG_URL` | `MOD_CATALOG_URL` | Vercel / `.env` |
| `EXT_<SLUG>_*` (and `NEXT_PUBLIC_`/`EXPO_PUBLIC_` forms) | `MOD_<SLUG>_*` | Vercel / `.env` / EAS |
| `/admin/extensions` | `/admin/modules` | bookmarks |

**Modules you added yourself** (anything not shipped with the kit) need the same
rename before they build again: move the folder to `modules/<slug>`, rename the
package to `@acme/mod-<slug>`, `extension.config.ts` to `module.config.ts` and
`defineExtension` to `defineModule` (likewise the other `Extension`/`Ext` names
from `@acme/mod-kit`), declare tables as `mod_<slug>_*` and add a rename
migration (copy one of the kit's `*_rename_to_mod_prefix.sql` files), then run
`pnpm mod sync`. Leave already-synced migrations as they are: the SQL lint
treats a legacy `ext_<slug>_*` name as the module's own `mod_<slug>_*` table.
