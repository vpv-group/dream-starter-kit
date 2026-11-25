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
_installing a module means code lands in the git repo, CI gates it, the
deploy rolls, and the boot-time bootstrap applies migrations._ The framework
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

| Entry          | May import                                                       | Guarded by                                                                               |
| -------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `.` (barrel)   | zod, react-query, `@acme/api`, `@acme/config`, `@acme/cms` types | RN-safe by construction; expo lint bans the rest                                         |
| `./web`        | `@acme/ui`, next/* — **client-safe only**                        | the client registry imports it for widgets — server imports here leak into client chunks |
| `./web-server` | payload Local API, node — RSC pages (`rsc: true` routes)         | never imported client-side                                                               |
| `./native`     | `@acme/ui-native`, expo-*                                        | the only module code Metro ever sees (plus `.`)                                          |
| `./server`     | anything server-side; first line `import "server-only"`          | poison pill + dispatcher-only imports                                                    |
| `./payload`    | `payload`, `@acme/mod-kit/payload`                               | unreachable from clients                                                                 |
| `./admin`      | `@acme/ui`, the module's barrel — **client component**           | imported only by Payload's admin import map (module page)                                |

The CI `expo export` smoke check is the backstop: a server import leaking into
the native graph fails the PR.

## Namespacing (collisions hard-fail `mod sync`)

| Thing           | Rule                                                                            | Example                     |
| --------------- | ------------------------------------------------------------------------------- | --------------------------- |
| slug / package  | `^[a-z][a-z0-9-]{1,30}$` / `@acme/mod-<slug>`                                   | `chat`                      |
| Supabase tables | `mod_<slug_snake>` or `mod_<slug_snake>_*`, RLS required                        | `mod_chat_threads`          |
| Payload slugs   | `mod-<slug>-*` (labels stay clean)                                              | `mod-billing-plans`         |
| Web routes      | `/a/<slug>/…` default; validated `mount` overrides                              | billing mounts `/billing`   |
| Server API      | `/api/mod/<slug>/…`                                                             | `POST /api/mod/chat/stream` |
| Edge functions  | `<slug>-*`                                                                      | `reminders-process`         |
| Env vars        | `MOD_<SLUG>_*` (client keys get `NEXT_PUBLIC_`/`EXPO_PUBLIC_` added by codegen) | `MOD_CHAT_MAX_TOKENS`       |

A best-effort SQL lint verifies migrations only DDL tables the manifest
declares and never touch `auth.*`/`storage.*`/role/grant DDL. DML is only
counted where it really is DML (`update <table> set`, `insert into`,
`delete from`), so `for update` policies, `before update` triggers and
`on update cascade` are fine.

**Trigger hook-points.** A module that must react to core data (a CRM
mirroring sign-ups, say) declares `database.triggersOn`: the core
hook-point tables `organizations`, `memberships`, `invitations`,
`profiles`, `auth_events`, or tables of modules it `requires`. Triggers on
those tables must be named `mod_<slug>_*` and dropped in `drop.sql`; the
lint rejects triggers on any other foreign table. Trigger functions should
be `security definer`, catch their own errors and never block the core
write.

**Module tests.** Unit tests live in `modules/<slug>/tests/*.test.ts` and run
in `pnpm test` (no database). Suites that need the live database go in
`modules/<slug>/tests/rls/*.test.ts` — `pnpm test:rls` picks them up alongside
the kit's and they import `admin`, `createUser`, `signIn`, `anonymousUser`
from `@acme/rls-tests/helpers` (exclude `tests/rls/**` from the module's own
vitest config). Browser specs go in `modules/<slug>/e2e/*.spec.ts` and run in
the `modules` Playwright project (`pnpm test:e2e`) with the founder setup and
helpers from `@acme/web-e2e/helpers`.

**Environment variables.** `turbo.json` declares `MOD_*`,
`NEXT_PUBLIC_MOD_*` and `EXPO_PUBLIC_MOD_*` globally, so module code may read
its own `process.env.MOD_<SLUG>_*` keys without tripping
`turbo/no-undeclared-env-vars`.

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
  the host migrationDir (local CLI) _and_ merged into `prodMigrations` (prod);
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
**Modules** admin group): manifest nav entries are _defaults_, seeded by the
boot reconcile (`lib/mod/reconcile-nav.ts`); staff rename/drag-reorder/re-icon/
toggle in `/admin` and the web sidebar + native `useNavMenu()` follow without a
redeploy. Disabling a module in `kit-modules` hides its menu items,
404s its pages and API, and removes its dashboard widgets — without
uninstalling.

**Settings live on the module's page** (**Modules** in `/admin` →
the module, i.e. `/admin/collections/kit-modules/<id>`; link to it with
`/admin/module-settings/<slug>`, which resolves the id). A module puts
settings there in either or both of two ways:

- **Payload fields:** export `settings = defineModuleSettings({ slug, name,
fields })` from `./payload` and set `cms.hasSettings: true`. The fields
  render as a "Settings" group on the module's page, stored on its
  `kit-modules` row (group `mod_<slug>`). They are staff-readable
  (`publicRead` for client-consumed toggles) and admin-editable. Server code
  reads them with `getModuleSettings(payload, settings)` (defaults apply
  before the page is ever saved) and writes them with
  `updateModuleSettings(payload, settings, data, { req })`. `afterChange`
  hooks set on `settings.global.hooks` run when the module's page is saved,
  with the module's settings as `doc`. Secrets stay in the zod env schema.
  - **Upgrading from kit ≤2.1:** settings used to be a separate global at
    `/admin/globals/mod-<slug>-settings`. On first boot the reconcile copies
    a saved global onto the module's row once (`settingsCopied`); the old
    URL redirects to the module page. The legacy globals stay registered,
    hidden, for one release.
- **A settings component:** for settings that live in the module's own
  Supabase tables, set `admin.settingsComponent: true` and export a client
  `AdminSettings` component from a `./admin` entry. It renders on the
  module's page inside the admin's Supabase + react-query providers
  (`ModAdminProviders`), so the module's own hooks work as the signed-in
  staff user. RLS still decides what they can do. Tailwind classes in
  `modules/**` are picked up by the admin stylesheet.

**Access** (who may use a module): staff can set any menu item to
**Staff only** (`nav-items` `audience`; manifest nav entries may default it
with `audience: "staff"`). That hides the entry, on web and native, from
users without `profiles.is_staff`. For a module-wide rule, set
`access: { check: "mod_<slug>_<fn>" }`: a no-arg SQL function returning
boolean for the current user. Then:

- its menu entries are dropped (server-side on web, in `useNavMenu()` on
  native) when the check is false;
- its generated web layout redirects to `/a`;
- its native screens are wrapped in `withModuleAccess`, which sends the user
  home.

Checks fail closed. The UX gate is not the security boundary — the
module's RLS must enforce the same rule on its data.

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
pnpm mod add dream:<slug>[@x.y.z] # paid module from the Dream registry (below)
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

**Modules** in `/admin` (`/admin/collections/kit-modules`, the `kit-modules`
collection) is the one screen for managing modules:

- **The list** shows every installed module with its version (plus an
  **Update** pill when a newer installable version exists), its source
  (Bundled, GitHub, Dream registry — with license state — and Pinned) and
  whether it's Enabled (plus **System** for modules the app shell depends on).
  Install state comes from the **bundled** lock — an honest "this deploy
  contains it" signal.
- **A banner above the table** says when module ops is off, or lists what's
  in flight: open module-ops PRs and running or failed workflow runs.
- **Install module** (top right) opens a drawer: the curated catalog
  (`MOD_CATALOG_URL`, format: `docs/module-catalog.example.json`), then
  install from a GitHub URL (`#vX.Y.Z` pins a tag) or a verified ZIP upload.
  With module ops off, catalog cards show the `pnpm mod add` command instead.
- **A module's page** has its settings in the main column, and in the
  sidebar: **Enabled**, then a **Module** panel with version, **Update**,
  source, license, a link to its menu items and — behind a confirmation —
  **Remove module…** (not for system modules).

The old `/admin/modules` URL redirects here. Every mutation dispatches `.github/workflows/module-ops.yml`, which runs the same
CLI on a runner, enforces **path confinement** (the op may only write
`modules/<slug>/**` + known sync outputs), and opens a labeled PR. The op
starts a local Supabase on the runner (a few minutes), so `db:gen-types`
includes the module's tables before typecheck. The apps' `package.json`
files are allowed only for `"@acme/mod-<slug>": "workspace:*"` lines; any
other change to them fails the check. A daily
schedule opens update PRs with auto-merge — CI green ⇒ merged ⇒ deployed ⇒
migrations at boot. Brakes: `MOD_AUTO_UPDATE=off` / `MOD_AUTO_MERGE=off`
(repo variables), per-module `pinned` in the lock; removals never
auto-merge.

**Founder setup** (also shown at the top of `/admin` until it's done): create
a fine-grained PAT on this repo with read & write access to Contents, Pull
requests, Actions and Workflows; set it as the `MOD_OPS_TOKEN` repo secret
AND the `GITHUB_OPS_TOKEN` env (plus `GITHUB_REPO` off Vercel); enable
“Allow auto-merge” in the repo settings.

**Without the token, module ops is off.** Every job in `module-ops.yml` is
_skipped_ (a preflight job leaves a notice explaining why) instead of failing,
the Modules screen is read-only, and **paid modules are disabled everywhere**:
the admin panel hides them and never contacts the registry, its API routes
refuse `dream:` installs and paid updates (`403 paid_modules_disabled`), and
the CLI refuses `pnpm mod add|update` of a registry module until
`MOD_OPS_TOKEN` (or `GITHUB_OPS_TOKEN`) is set. Free modules keep working
from the CLI.

**Kit updates (free).** The same daily run also checks the Dream Starter Kit
itself (`kit-update` job): when the kit's `upstream/main` has moved on, it
opens one PR labeled `kit-update` from a `sync/upstream-<date>` branch, or
refreshes the open one. No license key is needed. These PRs **never
auto-merge**: review them and land them with a **merge commit, never a
squash** (docs/UPDATING.md). Conflicts are committed as markers and the PR is
labeled `kit-update-conflicts`. Turn the check off with `KIT_AUTO_UPDATE=off`,
or run it on demand with _Run workflow_ → `op: kit-update`. It is skipped in
the kit repository itself.

## Site license

Every deployment gets a **free site license key** from meetdream.com, so kit
updates and free modules work without anyone creating or pasting a key:

1. **First CMS seed.** Right after the founder's `/cms-setup` seed finishes,
   `lib/dream/site.ts` registers the site:
   - It asks the registry for a signed challenge and serves the nonce at
     `/.well-known/dream-site.json`. The registry fetches it to confirm that
     the request really comes from this domain.
   - It sends the founder's email (the earliest admin), the other
     admin/editor emails, the kit version and the GitHub repo slug.
   - The registry returns the site key. It is stored in the admin-only
     **System → Site License** global and shown at the top of `/admin`.
2. **Daily.** Vercel Cron calls `/api/cms/dream-site/report`
   (`CRON_SECRET`); without the cron, a staff visit to `/admin` does it at
   most once a day. Each report sends the kit version and any new
   admin/editor emails. If the key was rotated, the site registers again.
3. **Upgrading.** The founder signs in at meetdream.com (their account was
   created with that email, unconfirmed and with no email sent). Under
   **/a/modules → Your sites** they choose **Use my plan on this site**. A
   site key never inherits a plan on its own.

**No key yet?** Deployments set up before site licenses existed never ran
the post-seed registration, and a failed attempt otherwise waits a day for
its retry. While the global has no key, **System → Site License** shows a
**Generate license key** button (admin-only;
`POST /api/cms/dream-site/register`) that registers right away and shows
the registry's error if it fails.

The app uses `DREAM_LICENSE_KEY` when set and the site key otherwise. The
`module-ops` workflow can't read the database, so to use paid modules, copy
the key (top of `/admin`) into the `DREAM_LICENSE_KEY` repository secret.

**Privacy and opt-out.** The founder is told on `/cms-setup` before anything
is sent. Registration sends only:

- the public domain;
- admin and editor emails (up to 25);
- the kit version;
- the repository slug.

Local and private hosts (localhost, IPs, `.local`, `.test`, …) never
register. Set **`DREAM_TELEMETRY=off`** to turn all of it off. Errors never
break the app: they are recorded in the global's `lastError`.

## Paid modules (Dream registry)

Paid modules distribute through a Dream module registry
(default `https://www.meetdream.com/api/mod/modules/v1` — the `modules` module
in meet-dream, served as public, rate-limited routes; protocol reference:
meet-dream's `docs/MODULES.md`) instead of a public GitHub repo, addressed as
`dream:<slug>` sources:

```bash
pnpm mod add dream:crm         # latest version compatible with this kit
pnpm mod add dream:crm@1.2.0   # a specific version
pnpm mod update crm            # same refs/mod-base three-way merge as GitHub
pnpm mod status --check        # update + license state per module
```

**Setup**

0. Set up module ops first (above): paid modules are off without it.
1. Use this site's free key (see [Site license](#site-license)) with your
   meetdream.com plan put on the site, or get an account key from
   meetdream.com.
2. Optionally set `DREAM_LICENSE_KEY` in the Vercel env (it overrides the
   site key) (server-only — the browser only
   ever sees derived entitlement state via the staff-gated
   `/api/modules/entitlements` proxy, never the key).
3. Add the same key as the **`DREAM_LICENSE_KEY` GitHub repo secret** so
   `module-ops.yml` (admin installs/updates + the daily auto-update) can run
   the CLI. The workflow masks it in logs (`::add-mask::`); the CLI never
   prints it — it travels only in the `X-Dream-License-Key` header.
4. Optional: `DREAM_REGISTRY_URL` points at a different registry. The
   Modules screen's catalog defaults to `${DREAM_REGISTRY_URL}/catalog?schema=2`;
   a self-hoster who sets `MOD_CATALOG_URL` keeps their own catalog.

**How it works.** `mod add dream:<slug>` sends
`POST {registry}/download` (`{ slug, version?, kitVersion, repo }` — the repo
identity comes from `GITHUB_REPOSITORY`/`GITHUB_REPO` or the git origin, so
the registry can enforce per-repo activations), downloads the returned signed
URL **immediately** (it expires in minutes), verifies its `sha256` before
anything touches disk, and then runs the normal zip install path. The lock
records a `{ type: "registry", registry, slug, version, sha256 }` source, so
updates are the same pristine-base three-way merge as GitHub sources — local
edits survive. In the Modules screen's **Install module** drawer, paid catalog cards show "Included in
\<plan\>" with **Install** when the key is entitled (dispatching
`op: add, source: dream:<slug>` through the same PR pipeline) and
**Get access** (the module's pricing page) when it isn't or no key is set;
installed registry modules show version, update state and license status.

**When the license lapses** (`revoked_key` / `not_entitled`) nothing breaks:
the vendored code keeps running and deploying; `mod status` and the admin page
report "license inactive — updates paused"; the scheduled auto-update skips
the module quietly. Re-activating resumes updates. The other registry error
codes (`invalid_key`, `incompatible_kit`, `no_release`, `activation_limit`,
`registry_not_configured`) map to actionable CLI messages.

**License/trust note.** A registry module is vendored code like any other
install — the trust model below applies unchanged (everything is a PR, path
confinement, full CI); the recorded sha256 pins exactly the bytes the registry
served. The license key is a secret: env/secret stores only, never committed,
never logged.

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

Kit 2.0 renamed extensions to modules. On kit 1.x the folder was
`extensions/`, packages were `@acme/ext-<slug>`, tables `ext_<slug>_*`, and the
CLI `pnpm ext`. A 1.x project upgrades like this (merge the kit as described
in `docs/UPDATING.md`, then deploy).

**Automatic (on the next deploy, or `pnpm db:reset` locally):**

- Each table-owning module ships a migration that renames its `ext_*` tables to
  `mod_*`, together with their constraints, indexes and RLS policies
  (`modules/<slug>/supabase/migrations/*_rename_to_mod_prefix.sql`). Rows,
  grants and foreign keys are kept.
- A Payload migration (`20261117_200000_rename_extensions_to_modules`) renames
  the CMS side: every installed module's `ext-<slug>-*` collections and
  globals become `mod-<slug>-*`, `kit-extensions` becomes `kit-modules`, and
  nav-items' `extension` field becomes `module`. Staff edits to menus, saved admin preferences and document
  locks carry over.
- A new private `module-uploads` bucket replaces `extension-uploads` for admin
  zip uploads. Storage won't let a migration delete buckets, so the old one
  stays; delete it from Studio if you like (it only ever held one-off zips).
- The CLI still finds base snapshots stored under the old `refs/ext-base/*` and
  re-roots them under `modules/`, so `pnpm mod update` and `pnpm mod status`
  keep working for modules installed before the rename.

**By hand (settings that live outside the repo):**

| Before                                                   | After                               | Where                 |
| -------------------------------------------------------- | ----------------------------------- | --------------------- |
| `EXT_OPS_TOKEN`                                          | `MOD_OPS_TOKEN`                     | GitHub repo secret    |
| `EXT_AUTO_UPDATE`, `EXT_AUTO_MERGE`                      | `MOD_AUTO_UPDATE`, `MOD_AUTO_MERGE` | GitHub repo variables |
| `EXT_CATALOG_URL`                                        | `MOD_CATALOG_URL`                   | Vercel / `.env`       |
| `EXT_<SLUG>_*` (and `NEXT_PUBLIC_`/`EXPO_PUBLIC_` forms) | `MOD_<SLUG>_*`                      | Vercel / `.env` / EAS |
| `/admin/extensions`                                      | `/admin/collections/kit-modules`    | bookmarks             |

**Modules you added yourself** (anything not shipped with the kit) need the same
rename before they build again: move the folder to `modules/<slug>`, rename the
package to `@acme/mod-<slug>`, `extension.config.ts` to `module.config.ts` and
`defineExtension` to `defineModule` (likewise the other `Extension`/`Ext` names
from `@acme/mod-kit`), declare tables as `mod_<slug>_*`, add a rename
migration (copy one of the kit's `*_rename_to_mod_prefix.sql` files) and widen
`kitCompat` to include 2.x (for example `">=2.0.0 <3"`), then run
`pnpm mod sync` (sync refuses a module whose `kitCompat` excludes the kit
version). Leave already-synced migrations as they are: the SQL lint
treats a legacy `ext_<slug>_*` name as the module's own `mod_<slug>_*` table.
