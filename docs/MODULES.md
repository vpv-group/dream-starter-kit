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
answer outside the app. `billing-adapter-stripe` is the Stripe connector: the
Billing module's web payment provider. Connectors are built as
[adapters](#how-the-host-consumes-modules) of the module they extend.

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

**Native packages travel with the module.** A module lists the `expo-*` /
`react-native-*` packages it needs in its own package.json `dependencies`
(at the app's Expo SDK version); Expo's autolinking follows dependencies, so
they're compiled into the app. Permissions and other native config come from
the module's own config plugin (`app.plugin.js`, manifest
`native: { plugin: true }`). Installing, updating or removing such a module
needs a **new native build** — sync says so. Full guide:
[NATIVE.md](./NATIVE.md).

## Namespacing (collisions hard-fail `mod sync`)

| Thing           | Rule                                                                            | Example                     |
| --------------- | ------------------------------------------------------------------------------- | --------------------------- |
| slug / package  | `^[a-z][a-z0-9-]{1,30}$` / `@acme/mod-<slug>`                                   | `chat`                      |
| Supabase tables | `mod_<slug_snake>` or `mod_<slug_snake>_*`, RLS required                        | `mod_chat_threads`          |
| Payload slugs   | `mod-<slug>-*` (labels stay clean)                                              | `mod-billing-plans`         |
| Web routes      | `/a/<slug>/…` default; validated `mount` overrides                              | billing mounts `/billing`   |
| Server API      | `/api/mod/<slug>/…`                                                             | `POST /api/mod/chat/stream` |
| Edge functions  | `<slug>-*` (prefer a cron route + `kit_register_app_schedule`)                  | `chat-adapter-sendblue-*`   |
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

**Service-only functions.** Module SQL can't GRANT or REVOKE, so a
function meant for the server (service role, cron) checks its caller itself:
`if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
raise exception … using errcode = '42501'`. See
`mod_notifications_broadcast` and `mod_reminders_claim`.

**Retention and housekeeping.** Nothing grows forever. A module whose
tables accumulate rows (logs, history, outboxes, dedupe keys) ships a purge
function and registers it from a migration; the kit's hourly Supabase Cron
job (`private.run_housekeeping()`) runs it, isolates failures, and writes
the per-task counts to the audit log. Windows come from the retention
policy table, never from literals, so a compliance module can raise them
and a legal hold can pause them:

```sql
-- in the module's migration
select public.kit_register_retention('mod_crm_activity', 365, 'CRM activity timeline');
create or replace function public.mod_crm_purge() returns integer
language plpgsql security definer set search_path = '' as $$
declare _cutoff timestamptz := private.retention_cutoff('mod_crm_activity'); _n integer;
begin
  if _cutoff is null then return 0; end if;       -- unknown class or legal hold
  delete from public.mod_crm_activity a where a.id in (
    select x.id from public.mod_crm_activity x where x.occurred_at < _cutoff limit 10000);
  get diagnostics _n = row_count; return _n;
end $$;
select public.kit_register_housekeeping('public.mod_crm_purge', 'crm');

-- in drop.sql
select public.kit_unregister_housekeeping('crm');
```

Batch deletes (≤10k rows per call; the next hourly run drains a backlog), and
index the column you delete by (BRIN suits append-only timestamps).
Audit-class data (who did what) is kept on the long `audit` policy, not
short-purged. Server code can append to the kit's audit log with the
service-role RPC `audit_log_event(action, actor_id, …)` — IDs and labels
only, never content or PII.

**Database guardrails.** These run in CI's integration job (all inside
`pnpm test:rls`) and are worth running before you commit a migration:

- `pnpm db:advisors` — Supabase's Security + Performance Advisor lints
  (`supabase db advisors --local`): unindexed foreign keys, `auth.uid()` not
  wrapped in a select, overlapping permissive policies, duplicate indexes,
  RLS gaps. Fails on any warning. In CI, `pnpm test:rls` runs it strictly in
  the kit's repository and as an advisory report in apps, so a module's
  warning never blocks an app's kit updates.
- `tooling/rls-tests/src/definer-guards.test.ts` — every SECURITY DEFINER
  function in `public` that anon can execute must check its caller
  (`auth.uid()` / `auth.role()`). Module SQL can't `REVOKE`, so put the guard
  in the function; a function you register for housekeeping
  (`kit_register_housekeeping`) also loses API execute automatically. It
  fails only for the kit's own functions (core and preinstalled modules); an
  installed module's unguarded functions are printed as a warning for the
  module's author, so they never fail an app's kit update. Module authors:
  run the same check in your module's CI.
- `tooling/rls-tests/src/plans.test.ts` (part of `pnpm test:rls`) — EXPLAINs
  the hot queries as a signed-in user: a public security-definer function
  called per row in a policy (`is_org_member(org_id)`) or a per-row SubPlan
  fails it, and so does a hot query that stops using its index. Add your
  module's hot queries to it, or mirror it in `tests/rls/`.

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
  merged env shapes, the bundled lock, and the Expo app's module config
  plugins + native fingerprint (`plugins.generated.json`,
  `native.generated.json`);
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
endpoint with zero per-module auth code. **Anonymous Supabase sessions**
(`is_anonymous`, the visitor identity behind favorites and guest checkout)
get **401** on `routes`: a flow that must serve them goes in `publicRoutes`
(manifest `server.publicRoutes`), which skips the session requirement
(`ctx.user` is the anonymous user or null) but stays rate-limited per user
or IP. Callers that prove themselves — signature-verified webhooks (Stripe,
Slack) and cron routes (`isCronRequest`) — are public routes too.

Route keys are exact (`"GET /ping"`, index `"GET /"`) or **wildcards**: a key
ending in `/*` (`"GET /files/*"`) matches every deeper path under that prefix,
never the bare prefix, with the rest of the path in `ctx.params["*"]`. An
exact key wins, then the longest matching prefix (`matchModRoute` in
`@acme/mod-kit/server`). A path that matches under another method gets 405.

**Rate limits.** Every module call spends one shared budget per user (per IP
for anonymous public calls), 60 a minute, in memory per server instance. A
route can set its own with `withRateLimit(handler, …)` from
`@acme/mod-kit/server`, which gives it a separate budget:
`{ limit, windowMs?, key? }`, where `key` is `"user"` (default), `"ip"` or a
function of the request (say, a hash of an API key the handler checks).
`withRateLimit(handler, false)` turns the dispatcher's limit off; use it only
for callers the handler verifies before doing any work, like a signed webhook
(the Stripe adapter's `POST /webhook` does).

**Embeddable pages.** A web route with `area: "embed"` mounts at
`/embed/<slug>/…` in the bare `(frontend)/(embed)` group: no site header or
footer and no app shell, so it fits an iframe on another site. Inside the
frame, third-party cookies are blocked, so the layout provides its own
Supabase client with a localStorage session (sign in inside the frame with an
email code; module hooks already send it as a bearer token). `proxy.ts`
answers these paths with `Content-Security-Policy: frame-ancestors 'self'
<origins>`, where the origins are the module's rows in
`public.kit_embed_origins`. With no rows, only the app itself can frame the
page. A module sets its list from its own /admin settings with
`kit_set_embed_origins(slug, origins[])` (service role only; plain `https://`
origins, or `http://localhost` for development). The proxy caches the list
for a minute. Serve any loader script (e.g. `embed.js`) from a public route.

**MCP tools.** With `server.mcp: true`, `./server` also exports
`mcp: ModMcpExtension` (tools built with `defineMcpTool`, optional Payload
collections and an instructions sentence). The remote MCP server at `/mcp`
adds them while the module is enabled; tool names must start with
`<slug>_`. Tools get a service-role client and must check their own staff
rule. See docs/MCP.md → Module tools and collections.

**Host services (`ctx.host`)** are on both route contexts:

- `ctx.host.github` reaches the repository connected through the Meet Dream
  AI GitHub App (/admin → Updates) with its short-lived site token, which
  the module never sees. `status()` returns `{ connected, repo }` or a
  reason. `api(path, init)` calls `/repos/<repo><path>`, limited to `""`
  (GET), `/issues…` and `/labels…`; anything else is a 403 and never
  reaches GitHub. `searchIssues(query)` runs a GitHub issue search scoped to
  that repo. With GitHub unconnected, calls answer 503
  `github_not_connected`, so modules must keep working without it.

**Extending another module.** A module can be built to be extended by
adapter modules, the way `chat` takes channel adapters (or the paid
`dream:feedback` module takes issue trackers): the core exports a typed
contract plus a route factory from a server-only entry (e.g.
`@acme/mod-feedback/integrations`), adapters declare `requires: ["<core>"]`,
mount the factory's routes, register themselves in the core's table from a
migration (e.g. `mod_feedback_register_provider(...)`), and contribute a
settings tab with `defineAdapterSettings({ target })`.

**Anonymous-user data.** A module that lets anonymous users own rows
registers two SQL functions from a migration:
`select public.kit_register_anon_data('<slug>', 'public.mod_<slug>_merge_anon', 'public.mod_<slug>_anon_has_data');`.
`merge_anon(_from uuid, _to uuid)` moves the rows when the visitor signs in
to an existing account (`lib/auth/merge-anon.ts`, before the anonymous user
is deleted). `anon_has_data(_user uuid) → boolean` keeps the hourly cleanup
of idle anonymous users from deleting someone whose rows still count.
Undo it in `drop.sql` with `kit_unregister_anon_data('<slug>')`. The
`pg_trgm` and `vector` extensions are enabled in `extensions` for module
search and similarity; embedding models come from `DEFAULT_EMBEDDING_MODEL`.

**Menus are CMS-driven** (`kit-modules` + `nav-items` collections,
**Modules** admin group): manifest nav entries are _defaults_, seeded by the
boot reconcile (`lib/mod/reconcile-nav.ts`); staff rename/drag-reorder/re-icon/
toggle in `/admin` and the web sidebar follows without a redeploy. A web
entry can list `children` (kit ≥ 2.5): they become a collapsible submenu
under it, each child its own nav item staff can rename, reorder, move or
turn off. The parent row then only toggles the submenu, so keep the module's
home reachable from its own tabs. Native nav stays flat. The
native app has its own order on the same rows — **Navigation → iOS and
Android App** sets the tab bar (3 or 4 tabs, plus a Search / More list of every item) and
can hide rows on native (deep link only); the app loads it at launch and
caches it offline (docs/CMS.md → `nav-items`). Native nav `href`s must be
screens the module ships: a module's static native routes are rendered
inside the tab slots from the generated `modNativeScreens` map, and its
`mount: "index"` screen is served at `/home`. Disabling a module in
`kit-modules` hides its menu items,
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
  - **Array row labels:** modules can't add Payload import-map entries, so
    the kit pins one generic row label. Set
    `admin: { components: { RowLabel: ROW_LABEL_COMPONENT } }` on an array
    field (`ROW_LABEL_COMPONENT` from `@acme/mod-kit/payload`, kit ≥ 2.6)
    and its rows read "Backlog · backlog" (the row's `label`, `name` or
    `title`, then its `key`, plus an "archived" pill when `archived` is
    set) instead of "Row 01".
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
**Staff only** or **Non-staff only** (`nav-items` `audience`; manifest nav
entries may default it with `audience: "staff"` or `"members"`, the latter
on kit ≥ 2.5). Staff only hides the entry, on web and native, from users
without `profiles.is_staff`; Non-staff only hides it from staff (a client
portal's own pages, when staff reach the portal through other screens). For a module-wide rule, set
`access: { check: "mod_<slug>_<fn>" }`: a no-arg SQL function returning
boolean for the current user. Then:

- its menu entries are dropped (server-side on web, in `useNativeNav()` on
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

**Host services** (kit ≥ 2.6): host code may not import modules, so a module
that the app itself must call sets `server.services: true` and exports
`services` (plain async functions) from `./server`. The generated
`modServices[slug]` exposes them; the host wraps them in a typed helper that
degrades when the module is absent. Billing's are the example
(`apps/nextjs/src/lib/mod/billing.ts`: entitlement, account deletion, anon
merge, new-user tags).

**Adapters** (kit ≥ 2.6): a module that plugs into another module's extension
point — a chat channel, a billing payment provider. Name it
`<target>-adapter-<x>`, `requires` the target, and:

- `adapter: { for: "<target>", server?: true, web?: "<export>", native?: "<export>" }`
  — contributions the TARGET calls out to. `./server` exports `adapter`
  (the target's server contract); the generated registries register a lazy
  loader per adapter, so the target reads them with
  `getModAdapters<T>(target)` from `@acme/mod-kit/server` (loaded on first use —
  the Payload CLI never evaluates adapter server code). `adapter.web` /
  `adapter.native` name an export of `./web` / `./native`, read with
  `useModAdapters<T>(target)` from `@acme/mod-kit/react` (the host mounts
  `ModAdaptersProvider`, minus runtime-disabled modules). The target defines the
  contract types; it never imports its adapters.
- Adapters that only call INTO the target need no `adapter` field: chat's
  channel adapters call `handleChannelMessage()` from their webhook
  (`modules/chat/CHANNELS.md`). Billing's providers do both — billing calls out
  for checkout/portal/catalog sync, and they write through billing's core
  services (docs/BILLING.md).
- **Settings tab:** `cms.settingsTabFor: "<target>"` and export `settings =
defineAdapterSettings({ slug, target, name, fields, key? })` — a tab on the
  target's settings (Modules → target), stored under `adapter_<key>`. Adapter
  tabs are **staff-only** even when the target's settings are `publicRead`
  (`publicRead: true` opts in). Give a long slug a short `key`: Payload builds
  column/enum names from target + group + field and Postgres cuts identifiers
  at 63 characters. The target's settings must have a top-level `tabs` field
  (the compose throws otherwise).
- **Collection tabs:** `cms.hasCollectionTabs: true` and export
  `collectionTabs` built with `defineAdapterCollectionTab({ slug, target,
collection, label, fields })` — an unnamed tab on one of the target's
  collections (Stripe's ids on billing's Plans/Coupons). Unnamed, so adding or
  removing the adapter never moves columns; the collection needs a top-level
  `tabs` field.
- **Admin panel:** `admin.settingsComponent: true` on an adapter renders its
  `./admin` `AdminSettings` on the TARGET's page (e.g. the Stripe connector panel
  on Modules → Billing).

**Connections ("Connect with …")** (kit ≥ 2.6): the host registers a connector
broker with `@acme/mod-kit/server`; a module calls `getConnectorBroker()` →
`startConnect(target, returnTo)`, `status(target)`, `forward(target, path, init)`,
`setWebhookTarget(target, url)` and `disconnect(target)` to use a connection that
meetdream.com holds for this site (Stripe for billing: Meet Dream is the Stripe
Connect platform and makes the site's Stripe calls for it). The site license key
never reaches the module, and no provider secret is stored in the app. `null` when
no broker is registered (tests, CLIs) — degrade to "not connected" and keep
env keys as the override. Protocol: `apps/nextjs/src/lib/mod/connectors-core.ts`,
docs/STRIPE.md §8.

**GitHub issue sync** (`getConnectorBroker()?.githubSync`, kit ≥ 2.6): for
modules that sync issues with repositories beyond the site's own update
repository (the Projects GitHub adapter).

- `startGrant(returnTo, forwardPath)` sends the site's owner to meetdream.com.
  They sign in with GitHub and tick the repositories they can write to in the
  Meet Dream AI App's installations; the browser comes back to
  `returnTo?github=sync-connected`.
- `access()` lists the granted repositories, plus the secret that forwarded
  webhooks are signed with.
- `token(repo)` returns a one-hour token for one granted repository: issues
  write, pull requests read, and org Projects, issue types and issue fields
  when the App has them. It never includes code access. The broker caches it
  until 5 minutes before it expires.
- `revoke(repo)` drops a grant.
- meetdream.com forwards the App's webhooks for granted repositories to
  `forwardPath`, a route in the module's `publicRoutes`. Each carries
  `X-GitHub-Event`, `X-GitHub-Delivery` and
  `X-Dream-Signature: sha256=<HMAC-SHA256 of the raw body, keyed with the
forwarding secret>`. Verify the signature with a constant-time compare
  before trusting the body. Failed deliveries are retried with backoff for
  about 10 attempts.
- Like `githubSync` itself (it's optional), every method degrades:
  `no_key` / `not_connected` mean "show Connect".

**Slots** (kit ≥ 2.6): module UI the HOST renders. Declare
`slots: { web: { "<name>": "<ExportOf./web>" } }`; the host places
`<ModSlot name="<name>" fallback={…} {...props} />` (`@acme/mod-kit/react`)
where it may appear and gets the module's component, or `fallback` when the
module is absent or runtime-disabled. One module per slot name (collisions
fail `mod sync`). Billing's `premium-content` wraps premium post bodies in its
paywall (`components/content/post-detail.tsx`).

**Host components** (kit ≥ 2.6): the inverse — core UI a module may embed.
The host registers them by name (`HostComponentsProvider`,
`components/mod-widgets-provider.tsx`; today `"auth-flow"`, the sign-in/sign-up
flow); a module renders `<HostComponent name="auth-flow" {...props}
fallback={…} />` (or reads `useHostComponent<P>(name)`), types the props it
passes, and must handle a host that doesn't provide it.

**Host services** (kit ≥ 2.6): the server side of the same idea, for a
module's RSC pages (`./web-server`), which can't import host code.
`getHostServices()` from `@acme/mod-kit/server` returns the viewer's RLS
session client (`getSessionClient`), the auth settings and the branding, or
`null` (tests, CLIs) — degrade. The host registers them in
`apps/nextjs/src/lib/mod/host-services.ts`. Billing's `/checkout` uses them.
An rsc route can also set `metadata: "<export>"` so its stub re-exports a
`Metadata` from `./web-server` (title, robots).

**Notifications are produced, not delivered, by your module.** Register your
categories in a migration (`mod_notifications_register_category`), emit with
`notify()` (TypeScript) or `mod_notifications_emit(...)` (SQL triggers and
definer functions), and put per-channel renderings (email subject/body/
reply-to, push overrides) in `payload`. The notifications module delivers on
the channels it supports today (in-app, Expo push) and picks up email and web
push when those ship, with no producer change. See
`modules/notifications/README.md` → Producer contract.

**Widgets**: declare `widgets: { web, native }` (export names). The host wires
its generated widget registry through `@acme/mod-kit/react`'s
`ModWidgetsProvider`; the dashboard module renders `useModWidgets()`.

## Lifecycle

```bash
pnpm mod create <slug>            # working scaffold (table+RLS, hooks, screens,
                                  #   widget, settings, ping route, tests)
pnpm mod add <url[#vX.Y.Z]|.zip>  # vendor + validate + snapshot + lock + sync
pnpm mod add dream:<slug>[@x.y.z] # from the Dream registry (below); a bare
                                  #   `pnpm mod add <slug>` means the same
pnpm mod update <slug> [--to vX.Y.Z] [--from <url|dream:<slug>>] [--continue]
pnpm mod remove <slug> [--keep-data]
pnpm mod list | status [--json] [--check]
pnpm mod eject <slug> --repo <url> [--resume <dir>]
                                  # publish: pushes the module's tracked and
                                  #   non-ignored files (never node_modules/ or
                                  #   .cache/) + a .gitignore; on a failed push
                                  #   it keeps the repo and prints --resume <dir>
pnpm mod payload-migrate <slug> <desc>
pnpm mod sync                     # after ANY change under modules/
```

Locally, `add`, `update` and `remove` then **apply** the change to your running
stack: `supabase migration up --local` (only the new migrations; your data stays),
`pnpm db:gen-types` and `pnpm cms:gen-types`, so the module is ready to preview.
Payload's dev push creates its collections when the dev server next boots. The
apply step is skipped with `--no-apply`, in CI / GitHub Actions (module-ops.yml
regenerates types on its runner), after a conflicted update, and when the local
Supabase isn't running (it prints the catch-up command).

**Migrations are expand/contract.** Updates go live one at a time and can be
reverted, but migrations only run forward, so every migration (kit or module)
must keep working with the previous release's code: add tables and columns
first, and drop, rename, retype or make columns NOT NULL only in a later
release. A migration that does contract must say so with a
`-- dream:contract <why>` comment; automatic merging sends those to review.
`tooling/mod/src/migration-safety.test.ts` enforces it on every migration
(files shipped before the rule are grandfathered), and `pnpm mod remove`
marks its teardown migration.

**Payload snapshots after parallel branches.** `payload-migrate` (like
`pnpm cms:migrate:create`) diffs the Payload config against the **newest
`.json` snapshot** in `apps/nextjs/src/payload/migrations/`, not against the
database. When two branches each add a Payload migration, the later snapshot
only knows its own branch's change. After the merge, the next migration then
re-emits SQL the other branch already shipped. Don't commit that SQL a second
time: it fails a fresh database with "already exists". Instead, generate a
`sync_snapshot_*` core migration, check that its SQL is exactly what an
existing migration ships, and empty its `up`/`down` so it carries only the
merged snapshot (see `20261127_174251_sync_snapshot_after_billing_adapters`).

Updates are a three-way merge (base = `refs/mod-base/<slug>` pinned in the
lock, ours = your possibly-modified copy, theirs = upstream) — local edits
survive clean updates; conflicts get standard markers + `--continue`.
Each update chains the new pristine base onto the previous one (old bases
stay reachable, and `git push origin 'refs/mod-base/*:refs/mod-base/*'` is a
fast-forward). `update` needs **git 2.40+** (`git merge-tree --merge-base`);
on older git — including Apple's bundled 2.39 — it stops before changing
anything (macOS: `brew install git`).

### Where modules come from (registry-first)

**The Dream registry is the default origin for every module it lists**, free
or paid. When the registry's catalog has a module (matched by slug, or by
the GitHub repo URL you passed) and this kit can take one of its releases:

- `pnpm mod add <github-url>` installs it **from the registry**;
- `pnpm mod update <slug>` of a module added from GitHub updates **from the
  registry** and moves its lock origin there (`{ type: "registry", …, repo }`
  — the GitHub repo is kept as the fallback);
- `pnpm mod status --check` (and so the daily auto-update) checks the
  registry instead of `git ls-remote`, so a **private module repo needs no
  token access**.

If the registry can't serve it — not signed in (`DREAM_TOKEN` on a laptop;
in `module-ops.yml` the run signs in by itself), the plan doesn't include it,
a network error — the CLI warns and **falls back to the GitHub repo** (the
one you installed from, or the catalog's public repo for free modules).
Modules the registry doesn't list, zips and local modules are unaffected.

`--from` forces an origin for one update and records it in the lock, e.g.
`pnpm mod update crm --from dream:crm`, or `--from <github-url>` to move a
module back to GitHub (the next update goes registry-first again). `--from`
never falls back. In `module-ops.yml`,
put the origin in the `source` input of an `update` run.

**Dependencies install together.** `pnpm mod add <source>…` takes several
sources, and any module a source `requires` that isn't installed is fetched
from the Dream catalog and installed in the same run, first
(`tooling/mod/src/install-set.ts`): `pnpm mod add dream:projects-adapter-github`
on a site without Projects installs both. Nothing is copied when a dependency
can't be fetched (not in the plan, no release for this kit), and the error
names it. From /admin it is one pull request; its marker lists the extra
modules (`also`) and its title says "(with projects)". If another update
merges first and the install PR stops merging cleanly, the merge job starts
the same install again from the latest code and closes the stale PR
(`refreshable` in `ops/merge.ts`; registry installs only).

**Install order across dependent modules.** `requires` names a slug, not a
version, so a module that uses tables a dependency added in a later release
(e.g. client-portal → CRM Cases, `crm` ≥ 1.2.0) fails validation with
"… the installed crm@1.1.1 doesn't have it; update crm …". Update the
dependency first, then add/update the dependent module.
`remove` refuses while another installed module `requires` the target,
generates the drop migrations (Supabase + a best-effort cms scaffold), and
tombstones the lock (pinned migration versions are never reused).

## Admin panel + automatic updates

Four places in `/admin`, all admin-only:

- **Updates available**, a bar above every admin page while the starter
  kit or an installed module is behind its newest release (`header`
  component `payload/components/updates/UpdatesAlert.tsx`, data from
  `GET /api/modules/outdated`, rules in `lib/mod/outdated-core.ts`). It
  lists each one (`2.5.0 → 2.6.0`, with its PR when one is open) and offers
  **Update** (one item) or **Update all**, which sends one `module-ops.yml`
  dispatch per item without an open PR, the kit first. As with Update on
  the Modules screen, the click approves the module PRs; the kit PR follows
  **Merge updates automatically**. The kit counts as behind when GitHub's
  latest `dream-starter-kit` release (cached for an hour) is newer than
  `KIT_VERSION`, which is the release `kit-update` would merge. Modules count
  when installed from GitHub, or from the Dream registry while the license
  covers them, and the catalog's `latest` is newer. Bundled and pinned
  modules, paused slugs and skipped versions are left out. A module whose
  newest release needs a newer kit (`kitCompat`) shows "after the kit
  update" and waits for the kit PR. Dismissing hides the bar until a newer
  version appears.
- **Updates** (`/admin/updates`, in the sidebar): the starter kit and module
  updates in one list, two switches, the GitHub connection and the license.
- **Modules** (`/admin/collections/kit-modules`): installed modules, their
  settings, **Install module** (the Dream catalog), **Update** and
  **Remove module…**.
- A **Finish setup** row on the dashboard while GitHub isn't connected.

### Connect GitHub (once)

Updates and installs happen as **pull requests on your repository**, opened by
the **Meet Dream AI** GitHub App. The owner connects it once: on the
founder's `/cms-setup/connect-code` step after the first sign-in, or with
**Connect GitHub** in Updates. GitHub asks which repository; pick only this
app's repository. Nothing is stored in the repository or in env:

- The app's server asks meetdream.com for a **one-hour token** for that one
  repository, using the site's own license key (`lib/mod/updates.ts`). It
  can start `module-ops.yml` and read pull requests and runs, but can't push
  code.
- `.github/workflows/module-ops.yml` signs in with its **GitHub Actions OIDC
  token** (`id-token: write`; `.github/actions/dream-session`). meetdream.com
  checks it comes from this repository's own `module-ops.yml` on a branch,
  never a fork or a pull request, and answers with a one-hour token plus the
  owner's settings.
- Removing the app on GitHub ends access at once; Updates then shows
  **Connect GitHub** again.

Until GitHub is connected, Modules is read-only (catalog cards show the
`pnpm mod add dream:<slug>` command), paid modules are hidden, and every
`module-ops.yml` job ends with a notice. On localhost the site never
registers with meetdream.com, so none of this appears; develop with the CLI.

### Finish connecting your services

After the update settings, the founder's `/cms-setup/services` step (and
`GET /api/health/setup`, staff-only) checks what this deployment still needs
from its host and database (`lib/setup/services-core.ts`):

| Check                    | Done when                                                                                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Your site's address      | the app resolves a public URL (`NEXT_PUBLIC_SITE_URL` or Vercel's production URL)                                                                                                                                                |
| Sign-in links and emails | Meet Dream configured Supabase Auth for the site (below)                                                                                                                                                                         |
| File uploads             | S3 keys are set, or Supabase Storage works with the service key                                                                                                                                                                  |
| Scheduled jobs           | Supabase Cron is set up and reaching the app: the jobs exist, the app stored its URL + cron secret in Vault on boot, and the latest call succeeded (`kit_scheduler_status()`). No `CRON_SECRET` needed — it's derived when unset |

**Connect Supabase** fixes the sign-in row: Supabase asks the owner to allow
Meet Dream's OAuth app, then meetdream.com sets the project's auth site URL,
adds this site and the Expo deep link to its redirect URLs, and applies the
kit's email templates (meet-dream `docs/PAID-MODULES.md` → First install). The
token is used once and not kept. The step is skipped when everything is done,
and on localhost.

The app accepts the Vercel Supabase integration's variable names as its own:
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the anon key and
`SUPABASE_SECRET_KEY` for the service-role key.

### What happens automatically

| Switch (Updates)                | Default | What it does                                                                                                                                            |
| ------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Automatic updates**           | on      | The daily run (06:23 UTC) opens a PR for each outdated module and for a new kit release                                                                 |
| **Merge updates automatically** | on      | A PR merges itself once every check passes, including `integration` (Supabase, RLS, Playwright) and commit statuses such as Vercel's preview deployment |

The founder picks one of three presets on `/cms-setup/app-updates`: install
automatically (both on), review each update (merge off), or I'll update it
myself (both off). **Install** or **Update** clicked in `/admin` is an
approval: that PR merges once its checks pass whatever the switch says, and
so does **Merge now** on a PR in Updates.

The `merge` job (`pnpm mod ops merge`, `tooling/mod/src/ops/merge.ts` →
`decideMerge`) runs after every CI run on an update branch and daily. It
merges **one PR per run**, oldest first: kit PRs with a **merge commit**,
module PRs **squashed**. It **never** merges, and labels `dream-review` with
a comment saying why:

- merge conflicts (`dream-update-conflicts`) or a removal (`dream-remove`);
- no checks ran, or a check failed;
- a major version, a migration that drops or changes existing data
  (expand/contract, see Conventions in CLAUDE.md) or a change under
  `.github/workflows/`;
- code whose source wasn't verified (a kit release's build attestation, a
  registry download's sha256);
- a paused module or a skipped version (**Skip this version** in Updates);
- while Meet Dream holds merging, fleet-wide or for that release.

It also waits for a kit release's **72-hour soak** (Meet Dream's own canary
sites get it first) and for a review your branch protection requires: the app
is never given a bypass. After a merge it watches the production deployment
GitHub records for the merge commit, then asks the site's own
`/api/health/db` (the URL comes from Meet Dream): a deploy that builds but
fails at boot, say on a migration, counts as failed too. **A failed deploy
pauses automatic merging** for the site (Updates shows why, with **Resume**)
and is reported to Meet Dream, along with every merge, failure and conflict.
A green update that waits for your review is reported as `ready`, and failing
checks that were already failing on your default branch as
`checks_failed_base_red`, so Meet Dream's per-release hold only counts
failures the update caused.

Every op runs the same CLI a developer would and enforces **path
confinement**: an op may only write `modules/<slug>/**` plus known sync
outputs; the apps' `package.json` only for `"@acme/mod-<slug>":
"workspace:*"` lines. The op starts a local Supabase on the runner, so
`db:gen-types` includes the module's tables. Installs started from `/admin`
may only use Dream catalog sources (`dream:<slug>`); installing from a GitHub
URL or a ZIP is CLI-only, for module authors.

**Kit updates (free).** The daily run also checks the Dream Starter Kit
(`kit-update` job): when the kit has published a newer release (a `vX.Y.Z`
tag whose build attestation verifies; never `main`, never a pre-release), it
merges it into one `dream/kit-update-<date>` branch, or refreshes the open
one. Conflicts in generated files (lockfile, types, migration bundles,
`*.generated.*`) take the release's side, and everything is regenerated, so
a clean kit PR can merge with no local work. Real conflicts are committed as
markers for a person. It is skipped in the kit repository itself.

**Cost.** An update PR runs your full CI: about 25 minutes of GitHub Actions
time (estimate), which fits a free private repository's 2,000 minutes a month.

PRs opened before this release (branches `mod/*` and `sync/upstream-*`) are
still listed and never merge themselves.

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
     **System → Site License** global, which shows only its prefix: the full
     key never leaves the server (rotate it from meetdream.com).
2. **Daily.** The `dream-site-report` Payload job reports in (Supabase Cron
   runs the Jobs Queue; `/api/cms/dream-site/report` does the same on demand,
   guarded by the cron secret). Without the scheduler, a staff visit to
   `/admin` does it at most once a day. Each report sends the kit version and any new
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

The app signs in to meetdream.com with the site key. `module-ops.yml` signs
in with its GitHub Actions OIDC token instead, which meetdream.com maps to
this site's key, so no key is copied anywhere.

**Privacy and opt-out.** The founder is told on `/sign-up` (the first account's
sign-up only) and again on `/cms-setup`, right before the seed that triggers
registration (`SiteLicenseNotice`, which lists each item below). Registration
sends only:

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
pnpm mod add dream:feedback    # Canny-style feedback, roadmap and changelog
pnpm mod add dream:crm@1.2.0   # a specific version
pnpm mod update crm            # same refs/mod-base three-way merge as GitHub
pnpm mod status --check        # update + license state per module
```

**Setup**

1. Connect GitHub (Updates): paid modules install through pull requests.
2. Put your meetdream.com plan on this site (meetdream.com → **/a/modules →
   Your sites → Use my plan on this site**). The site's free key then unlocks
   the plan's modules; nothing to paste.
3. On a laptop or in a cloud session, set **`DREAM_TOKEN`** to your license
   key from meetdream.com → Account → Modules to run `pnpm mod add
dream:<slug>` yourself. Never set it in Vercel or GitHub.
4. Optional: `DREAM_REGISTRY_URL` points at a different registry; the
   Modules catalog is `${DREAM_REGISTRY_URL}/catalog?schema=2`.

**How it works.** `mod add dream:<slug>` sends
`POST {registry}/download` (`{ slug, version?, kitVersion, repo }` — the repo
identity comes from `GITHUB_REPOSITORY` or the git origin, so
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
served. Keys and tokens are never committed or logged; in `module-ops.yml`
there is no stored secret at all.

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
