# CLAUDE.md — working agreement for this repo

Guidance for Claude Code (and humans) extending the **Dream Starter Kit**.
Read this first, then `docs/ARCHITECTURE.md` and `docs/ERD.md` — those two are the
**source of truth**. If anything here conflicts with them, they win.
(`docs/CMS.md` is the per-collection CMS reference — keep it in sync when you
touch Payload collections; `docs/MODULES.md` is the module framework
reference; `docs/MCP.md` is the remote MCP server reference;
`docs/WORKSPACES.md` is the account model / B2B workspaces reference;
`docs/DESIGN-SYSTEM.md` is how app and module screens are built — follow it
for any signed-in UI, and write components from it rather than copying
third-party template code.)

## What this is

A clone-and-ship starter: one Turborepo monorepo that ships a **Next.js web app**
and an **Expo (iOS + Android) app** sharing **one Supabase backend**. A founder
clones it and extends it (with you) into a real product. So: keep it
**runnable end-to-end**, **clean**, and **well-documented**. Correctness and
clarity beat cleverness.

## Stack (and where each lives)

| Concern                               | Choice                                                                            | Location                                  |
| ------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------- |
| Monorepo                              | Turborepo + pnpm (forked from create-t3-turbo)                                    | root                                      |
| Web                                   | Next.js (App Router), shadcn/ui, Tailwind                                         | `apps/nextjs`                             |
| Mobile                                | Expo + Expo Router, react-native-reusables, NativeWind                            | `apps/expo`                               |
| Backend                               | Supabase: Postgres + Auth + Storage + Edge Functions                              | `supabase/`                               |
| Content / CMS                         | Payload CMS v3 (web/server only) — own `cms` schema, `/admin`, REST at `/cms-api` | `apps/nextjs/src/payload`, `packages/cms` |
| Data layer (client + generated types) | `@supabase/supabase-js` typed client, session provider                            | `packages/api`                            |
| Shared features                       | cross-platform validators, react-query hooks, logic                               | `packages/app`                            |
| Shared UI tokens / primitives         |                                                                                   | `packages/ui`                             |
| Env + constants                       | zod env schema, `DEFAULT_AI_MODEL`, etc.                                          | `packages/config`                         |
| Payments                              | Stripe (web only) + webhook edge function                                         | `apps/nextjs`, `supabase/functions`       |
| AI                                    | Vercel AI SDK v7 via the AI Gateway (Claude default)                              | server routes / edge fn                   |
| Build/ship                            | EAS (mobile), Vercel (web), Expo Push                                             | `eas.json`, Vercel                        |

> Package scope is `@acme/*` (inherited from the template). It's renameable —
> see the README. Don't rename mid-build.

## Reference docs (read before changing that layer)

Official docs for everything the kit uses. Before you change a layer, check its
docs here instead of relying on memory: these products change faster than
training data. Where a vendor offers a native feature on its free plan, prefer
it to hand-rolled code (see **Vendor features** under Conventions).

**Monorepo / language**

- Turborepo — https://turborepo.dev/docs
- pnpm — workspaces https://pnpm.io/workspaces · catalogs https://pnpm.io/catalogs
- TypeScript — https://www.typescriptlang.org/docs/
- Zod — https://zod.dev

**Web**

- Next.js — https://nextjs.org/docs
  - caching: `revalidateTag` https://nextjs.org/docs/app/api-reference/functions/revalidateTag
    (Next 16 takes a second `profile` argument) · `unstable_cache`
    https://nextjs.org/docs/app/api-reference/functions/unstable_cache
  - `after()` https://nextjs.org/docs/app/api-reference/functions/after ·
    route handlers https://nextjs.org/docs/app/api-reference/file-conventions/route
- React — https://react.dev
- Tailwind CSS v4 — https://tailwindcss.com/docs
- TanStack Query — https://tanstack.com/query/latest/docs
- React Hook Form — https://react-hook-form.com/docs
- Icons — Lucide https://lucide.dev · Tabler https://tabler.io/icons

**shadcn/ui** — the web design system: the `components.json` setups in
`packages/ui` and `apps/nextjs`, the `dashboard-01` app shell, the `login-05`
auth flow, the sidebar, the tokens in `tooling/tailwind/theme.css`, and the
Payload admin (via Payload's Tailwind + shadcn guide). `docs/DESIGN-SYSTEM.md`
stays the kit's own rulebook; these are the upstream reference for primitives.
Write components from the docs — never copy third-party template code.

- Docs — https://ui.shadcn.com/docs
- Installation (Next.js) — https://ui.shadcn.com/docs/installation/next
- Monorepo — https://ui.shadcn.com/docs/monorepo
- `components.json` — https://ui.shadcn.com/docs/components-json
- CLI — https://ui.shadcn.com/docs/cli
- Tailwind v4 — https://ui.shadcn.com/docs/tailwind-v4
- Theming / CSS variables — https://ui.shadcn.com/docs/theming
- Dark mode (Next.js) — https://ui.shadcn.com/docs/dark-mode/next
- Components — https://ui.shadcn.com/docs/components · Sidebar
  https://ui.shadcn.com/docs/components/sidebar
- Blocks (`dashboard-01`, `login-05`) — https://ui.shadcn.com/blocks
- Registry — https://ui.shadcn.com/docs/registry

**Mobile**

- Expo — https://docs.expo.dev/
- Expo Router — https://docs.expo.dev/router/introduction/
- EAS Build — https://docs.expo.dev/build/introduction/
- Expo push — https://docs.expo.dev/push-notifications/overview/ · sending,
  tickets and receipts https://docs.expo.dev/push-notifications/sending-notifications/
- Expo + Supabase — https://docs.expo.dev/guides/using-supabase/
- React Native — https://reactnative.dev/docs/getting-started
- NativeWind — https://www.nativewind.dev/
- react-native-reusables — https://reactnativereusables.com/

**Supabase**

- Docs — https://supabase.com/docs · CLI https://supabase.com/docs/reference/cli/introduction
- supabase-js — https://supabase.com/docs/reference/javascript/introduction
- SSR for Next.js — https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Row Level Security — https://supabase.com/docs/guides/database/postgres/row-level-security
- RLS performance — https://supabase.com/kb/troubleshooting/rls-performance-and-best-practices-Z5Jjwv
- Auth — https://supabase.com/docs/guides/auth · anonymous sign-ins
  https://supabase.com/docs/guides/auth/auth-anonymous
- Storage — https://supabase.com/docs/guides/storage
- Cron (pg_cron) — https://supabase.com/docs/guides/cron
- Queues (pgmq) — https://supabase.com/docs/guides/queues
- Vault — https://supabase.com/docs/guides/database/vault
- pg_net — https://supabase.com/docs/guides/database/extensions/pg_net
- Database advisors (`supabase db advisors`) — https://supabase.com/docs/guides/observability/advisors
- Connecting / pooling — https://supabase.com/docs/guides/database/connecting-to-postgres
- Edge Functions (for modules) — https://supabase.com/docs/guides/functions
- Pricing / free-plan limits — https://supabase.com/pricing
- Postgres best-practice rules for agents — https://github.com/supabase-community/supabase-plugin

**Payload CMS**

- Docs — https://payloadcms.com/docs
- Postgres adapter — https://payloadcms.com/docs/database/postgres
- Migrations — https://payloadcms.com/docs/database/migrations
- Transactions — https://payloadcms.com/docs/database/transactions
- Indexes — https://payloadcms.com/docs/database/indexes
- Access control — https://payloadcms.com/docs/access-control/overview
- Hooks — https://payloadcms.com/docs/hooks/overview
- Local API — https://payloadcms.com/docs/local-api/overview
- Queries (depth, select, populate) — https://payloadcms.com/docs/queries/overview
- Versions & drafts — https://payloadcms.com/docs/versions/overview
- Trash — https://payloadcms.com/docs/trash/overview
- Jobs Queue — https://payloadcms.com/docs/jobs-queue/overview
- Custom views — https://payloadcms.com/docs/custom-components/custom-views
- Rich text (Lexical) — https://payloadcms.com/docs/rich-text/overview
- Storage adapters — https://payloadcms.com/docs/upload/storage-adapters
- Plugins — form builder https://payloadcms.com/docs/plugins/form-builder ·
  SEO https://payloadcms.com/docs/plugins/seo · nested docs
  https://payloadcms.com/docs/plugins/nested-docs
- Performance — https://payloadcms.com/docs/performance/overview
- Drizzle (Payload's ORM, behind `payload.db.drizzle`) — https://orm.drizzle.team/docs/overview

**Payments / AI / auth / MCP**

- Stripe — https://docs.stripe.com · webhooks https://docs.stripe.com/webhooks ·
  Checkout https://docs.stripe.com/payments/checkout · Billing
  https://docs.stripe.com/billing · customer portal
  https://docs.stripe.com/customer-management · testing https://docs.stripe.com/testing
- AI SDK — https://ai-sdk.dev/docs · Vercel AI Gateway https://vercel.com/docs/ai-gateway
- Cloudflare Turnstile — https://developers.cloudflare.com/turnstile/
- MCP — spec https://modelcontextprotocol.io/specification · TypeScript SDK
  https://github.com/modelcontextprotocol/typescript-sdk

**Hosting / tooling**

- Vercel — https://vercel.com/docs · function limits
  https://vercel.com/docs/functions/limitations · pricing https://vercel.com/pricing
- Vitest — https://vitest.dev
- Playwright — https://playwright.dev/docs/intro
- ESLint — https://eslint.org/docs/latest · Prettier https://prettier.io/docs
- Mailpit — https://mailpit.axllent.org/docs/
- Nodemailer — https://nodemailer.com
- Claude Code — https://code.claude.com/docs

## The golden rules (do not violate)

1. **RLS on every app table.** Authorization for `public` lives in Postgres, not app
   code. Every table in the `public` schema has an owner (`user_id`/`owner_id`, or
   reachable via `memberships`) and policies scoped to `(select auth.uid())`. See
   `docs/ERD.md`. **The one allowed exception is Payload CMS**, which owns the
   separate `cms` schema and enforces its own **role-based access rules** — content
   AND member-engagement data (profiles, comments, enrollments, the
   `subscriptions` mirror) live there governed by Payload access control, contained
   via a dedicated least-privilege, server-only `payload_cms` role (no access to
   `public`/`auth`; provisioned automatically at server boot in production by
   `apps/nextjs/src/lib/db/bootstrap.ts`, locally by `00_cms_role.sql`). Note the
   CMS API bridge is **staff-only today** — members reach
   their CMS-side data through your own server routes until the member-auth
   follow-up ships. Security-critical per-user state that RLS clients consume
   directly (auth, chat, reminders, billing entitlements in `public.subscriptions`)
   stays in `public` under RLS. **Favorites are RLS, not CMS:** saves across all
   content collections live in `public.content_favorites` (`(user_id, collection,
item_id)`, own-row RLS) so they work for **anonymous** users — it is the ONE
   table anon sessions may write (see the anonymous-identity note below).
   **Anonymous-account-first identity:** a logged-out visitor gets a real
   `auth.uid()` (a Supabase anonymous user, minted on first action — e.g.
   favoriting) so checkout always ties to an account; it converts to permanent
   once an email is known (see `docs/TURNSTILE.md`, `lib/auth/merge-anon.ts`).
   Anonymous sign-in is guarded by Cloudflare Turnstile; anon users are never
   staff and a RESTRICTIVE policy blocks them from the cost-bearing AI chat tables.
2. **Service role key is server-only.** It bypasses RLS. It appears ONLY in
   Supabase edge functions / server code (e.g. the Stripe webhook). Never in
   `apps/expo` or web client code.
3. **Secrets via the zod env schema.** No hardcoded keys. Add new vars to
   `.env.example` AND `packages/config/env`, split correctly:
   - `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` = public (compiled into the client). Only
     anon/publishable values.
   - everything else = server-only.
     The app must fail loudly if a required var is missing.
4. **Stripe is web-only.** No StoreKit / Play Billing / IAP. Mobile unlocks
   premium by reading the `subscriptions` table (RLS read-own). This can matter
   for App Store and Google Play review; see `docs/STRIPE.md` → App Store and
   Google Play payment rules. An In-App Purchase module is a team decision, not
   something to add on your own.
5. **AI model id is centralized & swappable.** Use `DEFAULT_AI_MODEL` from
   `packages/config`; don't hardcode slugs elsewhere. Resolve available models
   at runtime where practical.
6. **AI routes are authed, rate-limited, token-capped.** Never expose the
   gateway to anonymous traffic.
7. **Cross-platform code lives in `packages/`; `apps/*` are thin entry points.**

## Commands

```bash
pnpm install            # install workspace
pnpm dev                # run all apps (turbo watch)
pnpm dev:next           # web only
pnpm typecheck          # tsc across the workspace  <- run before commit
pnpm lint               # eslint across the workspace <- run before commit
pnpm format:fix         # prettier write

# Local stack (one bootstrap for laptops, cloud sessions and CI — tooling/setup)
npx create-dream-app my-app  # new app from the newest kit release, history
                        #   kept + `upstream` remote, then dev:setup
                        #   (tooling/create-dream-app, published to npm)
pnpm dev:setup          # Supabase + .env + db reset (first run) + dev admin
                        #   (admin@dream.test, password in .dream/dev-admin.json)
                        #   (first /admin visit seeds the CMS). --reset,
                        #   --no-dev-admin, --browsers,
                        #   --profile local|cloud|ci. (`pnpm setup` is pnpm's own.)

# Supabase (local dev)
supabase start          # boot local Postgres/Auth/Storage (Docker)
supabase db reset       # re-apply migrations + seed.sql
supabase status         # show local URLs + keys
pnpm db:gen-migrations  # re-inline supabase/migrations into the web bundle for the
                        #   runtime DB bootstrap — run after adding a migration and
                        #   commit the JSON (drift fails `pnpm test`)

# Modules (see docs/MODULES.md)
pnpm mod sync           # regenerate registries/stubs/migrations from modules/*
pnpm mod create <slug>  # scaffold a new module (then: install, db:reset, gen-types)
pnpm mod add|update|remove|status  # lifecycle (vendored + lock + snapshot refs);
                        #   add/update/remove then apply locally (migration up +
                        #   gen-types) unless --no-apply or in CI

# Tests
pnpm test               # vitest (unit/integration) — no backend needed
pnpm test:e2e           # Playwright (web E2E). Needs the local stack (pnpm dev:setup);
                        #   outside CI it resets the DB first (the founder flow needs
                        #   zero users; E2E_REUSE_DB=1 skips). Boots `next dev` itself.
                        #   See tooling/web-e2e/README.md.
pnpm test:rls           # RLS isolation regression + query-plan checks (plans.test.ts).
                        #   Needs `supabase start` + .env with
                        #   NEXT_PUBLIC_SUPABASE_URL/ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.
pnpm db:advisors        # Supabase Security + Performance Advisor lints on the local DB
                        #   (fails on warnings) — run before committing a migration
pnpm license:check      # fail on strong copyleft (GPL/AGPL/SSPL) in the prod tree
```

CI (`.github/workflows/ci.yml`) runs all of these on every PR: lint · format ·
typecheck · unit · license, plus an `integration` job that boots Supabase and runs
`test:rls` + Playwright.

## Cloud sessions (Claude Code on the web)

Cloud session containers start bare: no Docker daemon, no Supabase CLI, no `.env`.
The **SessionStart hook** (`.claude/hooks/session-start.sh`, registered in
`.claude/settings.json`, cloud-only via `$CLAUDE_CODE_REMOTE`) runs `pnpm install`
then `pnpm dev:setup --profile cloud` — the same bootstrap laptops and CI use
(`tooling/setup`). It starts `dockerd`, installs the Supabase CLI (the version CI
pins in `.github/workflows/ci.yml`), boots Supabase, writes `.env` from
`.env.example` with the local keys + a generated `PAYLOAD_SECRET`, runs
`pnpm db:reset`, creates the **dev admin** (`admin@dream.test`, password in
`.dream/dev-admin.json`; its first `/admin` visit seeds the CMS), and installs **Playwright's
Chromium** (cached in `$PLAYWRIGHT_BROWSERS_PATH`). Every step is idempotent, so
resumed sessions are fast. Don't re-do these steps by hand — if the stack seems
down, just rerun the hook (or `pnpm dev:setup --profile cloud`).

**Cloud environment Setup script (optional speed-up).** The hook above lives in the
repo, so forks and clones get the full bootstrap with no extra setup. The
environment's _Setup script_ is different: it's a per-environment setting on
claude.ai (environment settings → Setup script), not a repo file, so whoever creates
an environment pastes it in themselves. It runs before Claude Code starts and its
result is cached, so pointing it at `scripts/cloud-setup.sh` (`pnpm install` plus
one best-effort `pnpm dev:setup --profile cloud --no-dev-admin`) means new sessions
start with dependencies, the pinned Supabase CLI, the Supabase Docker images and
Chromium already in place. It leaves nothing live in the snapshot (stack stopped,
no `.env`); the hook still builds the stack and database per session. The snippet
doesn't depend on the repo's name:

```bash
#!/bin/bash
# Finds the repo's setup script whatever the repo/fork is named.
for f in "$PWD/scripts/cloud-setup.sh" /home/user/*/scripts/cloud-setup.sh; do
  [ -f "$f" ] && exec bash "$f"
done
echo "scripts/cloud-setup.sh not found; the SessionStart hook will install everything instead"
```

Cloud-session quirks:

- **`supabase start` must exclude edge-runtime** (`-x edge-runtime`): that container
  sets rlimits the sandboxed nested-container runtime forbids. The kit ships no
  edge functions (billing, account deletion and reminders run in the Next.js app),
  so only a module's own edge functions are affected.
- **Unset optional env vars must be absent, not `""`** — empty strings fail the zod
  schema's `min(1)` checks. `pnpm dev:setup` comments them out when writing `.env`.
- **`pnpm db:reset` heals a stale gateway** (`scripts/db-reset.sh`): after the reset
  recreates the auth container, Kong can keep proxying to its old address, so auth
  answers 502 (`AuthRetryableFetchError` in tests) and Payload migrations were
  skipped. The script restarts Kong when auth isn't healthy, waits for it, then runs
  `cms:migrate`; a failing SQL migration still exits non-zero. If auth ever 502s
  after a manual `supabase db reset`, run `docker restart supabase_kong_dream-starter-kit`.
- The hook does **not** start the dev server. Use the `web` configuration in
  `.claude/launch.json` (the cloud preview browser) or `pnpm dev:next`.
- Local URLs: app :3000 · Supabase API :54321 · Studio :54323 · Mailpit :54324
  (sign-up confirmation emails land in Mailpit).

### Testing in cloud sessions (full suite works)

The hook leaves the stack + `.env` exactly the way the test suites expect, so run
the **full** test matrix, same commands as local:

- `pnpm test` — vitest unit/integration (no backend needed).
- `pnpm test:rls` — RLS isolation (Supabase is already up; `.env` already has the
  anon + service-role keys).
- `pnpm test:e2e` — Playwright web E2E. Chromium is pre-installed by the hook;
  Playwright boots `next dev` itself (or reuses one already running on :3000).
  Auth flows pull confirmation links/codes from Mailpit (see
  `tooling/web-e2e/README.md`). The founder/first-user flow needs a **fresh DB**, so
  `pnpm test:e2e` runs `pnpm db:reset` first outside CI (this removes the dev admin;
  rerun `pnpm dev:setup` afterwards to get it back).
- Out of scope in cloud sessions: a module's own edge functions and `expo` device
  builds.

**Visual testing:** the desktop Preview pane is local/SSH-only — in cloud sessions
it is greyed out and there is no embedded browser. Verify UI changes by driving the
app with the pre-installed Playwright Chromium instead: write a throwaway script
(import `chromium` from `@playwright/test`, run it from `tooling/web-e2e/` so the
package resolves), navigate, `page.screenshot(...)`, and **send the screenshots to
the user** so they can see each step. Clean up throwaway scripts before committing.

## How to add a feature: build a module

Features are **modules** (docs/MODULES.md is the working reference;
docs/MODULES-PLAN.md the design). A module is a vendored workspace
package at `modules/<slug>/` that owns its tables (`mod_<slug>_*`, RLS
required), validators + hooks (client barrel, shared web + native), screens
(`./web`, `./native` — RSC pages in `./web-server`), API routes (`./server`,
served authed + rate-limited at `/api/mod/<slug>/…`), Payload
collections/settings (`./payload`), edge functions, and tests. The in-repo
reference is **`modules/reminders`**; the five first-party modules
(dashboard, notifications, reminders, chat, billing) are all built this way.

```bash
pnpm mod create <slug>   # working scaffold: table+RLS, hooks, both screens,
                         #   widget, settings screen, authed ping route, tests
pnpm mod sync            # after ANY change under modules/ — regenerates
                         #   registries/stubs/migrations; drift fails pnpm test
pnpm mod add|update|remove|status|eject|payload-migrate   # lifecycle (§docs)
```

Rules that keep modules modular:

- **The host consumes modules only through generated files** — never import
  `@acme/mod-*` from host code outside the generated registries (the two
  documented exceptions, the header bells, carry delete-on-removal comments).
- **Bundle safety:** the client barrel (`.`) and `./native` are the only
  entries Metro may see; `./web` must stay client-safe (widgets are imported
  from it); server-only code lives behind `import "server-only"` /
  `./payload` / `./web-server`. ESLint + the CI `expo export` smoke check
  enforce this.
- **Migrations:** local sequence numbers (`001_initial.sql`) inside the
  module; `mod sync` pins versions and materializes copies — never edit a
  synced migration, add a new one. Ship a `drop.sql` for clean removal.
- **Nav is CMS-driven:** manifest `nav` entries are defaults seeded into the
  `nav-items` collection ("Navigation" in /admin); staff own the menu
  afterwards. The web sidebar and the native tab bar are ordered separately
  (Navigation → Web App / iOS and Android App; the native side is the
  `native-navigation` global, loaded at launch by `useNativeNav` and cached
  offline — docs/CMS.md). The web app's phone/tablet bottom tab bar
  (`components/glass-tab-bar.tsx`, below `lg`) renders that same native menu.
- **Cross-module access** is declared: `requires: [...]` + `database.dml`
  whitelists; services are plain typed package exports (`notify()`,
  `usePremium()`).
- After schema/CMS changes: `pnpm db:reset && pnpm db:gen-types`
  (+ `pnpm cms:gen-types`), commit the regenerated files.

## How to add a Payload content type

For **content and member engagement** (anything that isn't security-critical
RLS-client state), add a **Payload collection**, not a Supabase table. The CMS ships
a full registry across six admin groups — **Content** (posts, videos incl. vertical
shorts, audio/podcast episodes, photos, series/courses + lessons, locations, events,
categories/tags), **Community** (space-groups → community-spaces → community-posts,
one threaded `comments` system, a `reports` moderation queue), **People** (users,
feed-tokens, enrollments, reviews), **Commerce**
(plans/coupons/subscriptions), **Marketing** (pages, onboarding, banners,
notifications, forms) and **System** (the `legal` documents collection —
rendered under /legal with a TOC sidebar — alongside the settings globals). Collections live in the `cms` schema and are governed by
**Payload's role-based access-control, not RLS** (`payload/access/index.ts`:
`isAdmin`/`isStaff`/`publishedOrStaff`/`ownsOrStaff`…; owner-scoped collections force
the owner on create via `payload/hooks/assign-owner.ts`).

1. **Collection.** Add a config in `apps/nextjs/src/payload/collections/` (copy
   `Posts.ts` for editorial content, `Enrollments.ts` for owner-scoped member data).
   Set fields, `slug`, `admin.group`, and `access` (e.g. `publishedOrStaff` reads).
   Reusable field helpers live in `payload/fields/` (slug, link, accessLevel,
   commentsEnabled, destination).
2. **Register it** in `apps/nextjs/src/payload.config.ts` (`collections: [...]`).
3. **Types.** `pnpm cms:gen-types` regenerates Payload's types into `packages/cms`
   (`@acme/cms`) — never hand-edit. Then `pnpm cms:migrate:create` to generate a migration
   under `apps/nextjs/src/payload/migrations` (generated — never hand-edit) and **commit
   it**. Locally, dev-push (or `pnpm db:reset`, which now runs `cms:migrate`) applies it;
   in production Payload runs committed migrations automatically on first boot via the
   adapter's `prodMigrations`, so no manual `cms:migrate` deploy step is needed.
4. **Web page.** Add a public RSC route under `apps/nextjs/src/app/(frontend)/(public)/`
   that fetches via Payload's **Local API** (`getPayload(...).find(...)`), for SEO.
5. **Mobile.** Add a REST hook in `packages/app` (copy `use-content.ts`'s
   `usePosts`/`useEvents`), typed by `@acme/cms`, and a native screen under
   `apps/expo/src/app/(app)/content/`.
6. **No RLS, no rls-tests.** Content is access-controlled by Payload — do **not**
   add it to `docs/ERD.md` or `tooling/rls-tests`. (Add a Playwright `content.spec.ts`
   case if it's a critical public flow.)
7. **Seed it.** Add a demo row for the new collection to `seedCmsContent()` in
   `apps/nextjs/src/payload/seed.ts` (as a new ordered step) so the CMS stays "fully
   functional" out of the box. That seed runs three ways: the `pnpm cms:seed` CLI;
   automatically right after the **founder's account is created** — sign-up routes the
   first/staff user through `/welcome` (`app/welcome/route.ts`) to `/cms-setup`, which
   streams `/api/cms/seed` behind a shadcn progress bar, then enters `/admin`; and, as a
   fallback, the first time a staff user opens an unseeded `/admin` — a `beforeDashboard`
   gate (`payload/components/SeedGate.tsx`) redirects them to the same `/cms-setup` flow.
   All paths share one idempotent endpoint. Keep steps scalar-only (no binary fixtures).

**CMS auth is SSO from Supabase — there is no second login.** Payload's local strategy
is disabled; `apps/nextjs/src/payload/auth/supabase-strategy.ts` authenticates each CMS
request from the Supabase session and provisions a `cms.users` row (linked by
`supabaseUserId`). Users carry **`roles[]`** (`admin`/`editor`/`author`/`member`,
WordPress-style): every app signup is mirrored in as a `member`
(`ensureCmsUser` in `lib/cms/mirror-user.ts`); staff get admin/editor and may enter
`/admin`. **The mirror is wired at every point a session can first appear, because
`cms.users` must list ALL users, not just staff** (the SSO bridge only ever
JIT-provisions staff): the server auth navigations `/welcome` + `/auth/callback`;
the `/confirm-email` client page (the anon→permanent buyer conversion returns to its
origin page, never touching `/welcome`); the **paywall guest-checkout** flow, which
signs the buyer in client-side via a one-time `loginToken` and unlocks inline —
`paywall-modal.tsx` + `/confirm-email` POST `/api/cms/mirror-self` (mirrors the
current session user) so those buyers aren't stranded out of the table; and a
universal best-effort backstop in the `(app)` shell layout (any member reaching the
app is mirrored regardless of entry path). All paths are idempotent. The catch-up
tool for accounts created before any of this — or when a mirror call was missed —
is **`pnpm cms:backfill-users`** (idempotent; lists Supabase users and mirrors each).
Mirror failures are logged (`[mirror-user]`), never silently swallowed. The
mirror also keeps `cms.users.email` equal to the Supabase login email, and
**account editing is two-way**: members change email (secure change — confirm
on both addresses), password (reauthentication nonce when the session is >24h)
and profile/phone on `/profile` (web + native, `@acme/app` hooks); admins edit
the same in `/admin` → Users, written through to Supabase by
`payload/hooks/sync-user-to-supabase.ts` + the `/api/cms/user-password` panel
(see `docs/AUTH.md` → Account settings). Access is
**default-deny**: only users with `profiles.is_staff = true` get in — **the bridge
authenticates staff only for now**; member-scoped collections carry correct
owner-scoped access rules, but opening `/cms-api` to member sessions is a documented
follow-up. **`is_staff` follows the CMS roles** — admin/editor/author ⇒ `true`,
member only ⇒ `false` — written through on every admin save of a user
(`sync-user-to-supabase.ts`); there is no separate "grant staff" step, and an admin
can't drop their own `admin` role. The first signup is auto-flagged (and
JIT-provisioned `admin`); further users are **invited from `/admin` → Users →
Create New** — a collection hook (`payload/hooks/invite-user.ts`) emails a Supabase
invite and sets `is_staff` from the chosen roles via the service-role client
(`lib/supabase/admin.ts`, server-only — the pattern golden rule #2 allows); the
invitee sets a password on `/accept-invite`. Users are
soft-deleted (`trash: true`): the bridge rejects trashed rows and the mirror won't
resurrect them — restore from the admin Trash view. The bridge itself runs in the
Next.js server — it reads `profiles` via the user's own RLS session and writes
`cms.users` via the Local API — so it never uses the `payload_cms` DB role or the
service-role key (golden rules #1–2 hold). `/admin` is gated in `proxy.ts`.

**Sign-up requires email confirmation** (`enable_confirmations = true` locally, matching
hosted Supabase): the form routes to `/check-email`, which offers the emailed link
(→ `/confirm-email`, which verifies the `token_hash` and forwards to `/welcome`) or
manual entry of the emailed 6-digit code (`verifyOtp`). Both kit email templates
(`supabase/templates/`) link via `token_hash` pages — never GoTrue's redirect-style
links, whose one-time tokens break for re-sent emails (no PKCE state) and get burned
by prefetchers/navigation restarts. E2E specs pull link + code from Mailpit — see
`tooling/web-e2e/README.md`.

**Which auth methods the front end offers is staff-configurable** via the
`authentication-settings` Payload global (**System → Authentication**): an
orderable method list (password · magic link · email OTP · Google · Apple · SAML
SSO — drag to reorder, toggle on/off; first enabled = primary), plus sign-up
access rules, min password length, captcha toggle, copy, and SSO routing. It's a
**UI + client-logic** layer (it gates which buttons/forms render and the client
rules) — **Supabase still controls what each method actually does**, so enabling a
provider here also requires it enabled in Supabase. The shared shape/helpers live
in `@acme/app` (`auth-settings.ts`); the web login-05 UI is `AuthFlow`
(`components/auth/auth-flow.tsx`), read server-side via `getAuthSettings()` and on
mobile via `GET /api/auth/config` (`useAuthConfig`). Full guide:
[docs/AUTH.md](https://github.com/vpv-group/dream-starter-kit/blob/main/docs/AUTH.md).

## Payments (Payload → Stripe catalog, one Stripe webhook → public)

The billing catalog is **authored in Payload**, not the Stripe dashboard. `Plans`,
`Coupons` and the read-only `Subscriptions` mirror live under the **Commerce** admin nav
group (`apps/nextjs/src/payload/collections/`), and `PricingSettings` (a global) curates
the public `/pricing` page (which ≤3 plans to feature + a Free tier). The default three
example plans (Monthly/Annual/Lifetime) + a welcome coupon are seeded by `seedCmsContent()`.

- **Payload → Stripe is automatic**: saving a plan/coupon runs an `afterChange` hook
  (`payload/hooks/sync-plan-to-stripe.ts` / `sync-coupon-to-stripe.ts` →
  `lib/stripe/sync.ts`). It creates/updates the Stripe product and **creates a new price +
  archives the old one** whenever the amount/interval changes (Stripe prices are
  **immutable** — never mutate, always recreate). Coupons follow the same
  recreate-on-change rule. A per-doc `skipSync` checkbox opts out; failures land on
  `syncStatus`/`syncError` instead of failing the save; the seed skips the hook
  (`context.skipStripeSync`), so seeded plans stay `unsynced` until first saved.
- **Stripe → app is ONE webhook** — the billing module's public route
  `POST /api/mod/billing/stripe/webhook` (`modules/billing/src/server/stripe/webhook.ts`).
  It writes `public.mod_billing_*`, the **source of truth** web and mobile read under
  RLS, then projects `customer.subscription.*` into the read-only CMS `subscriptions`
  collection for /admin (`modules/billing/src/payload/webhooks.ts`). Every Stripe event
  id is recorded (`mod_billing_webhook_events`), so a redelivery isn't applied twice.
  Subscription writes go through `mod_billing_apply_subscription()`, which ignores an
  event older than the one already applied: Stripe doesn't guarantee delivery order.
  **No dashboard step:** an hourly scheduled check (`GET /api/mod/billing/cron/connect`)
  registers the endpoint through the Stripe API once `STRIPE_SECRET_KEY` is set and the
  site has a public https URL. It keeps the signing secret in Supabase Vault;
  `STRIPE_WEBHOOK_SECRET` overrides it, e.g. for `stripe listen` locally. The old edge
  function and `@payloadcms/plugin-stripe` endpoint are gone, and
  `STRIPE_WEBHOOKS_ENDPOINT_SECRET` is deprecated.
- **Intro offers** ("$1 first month, then $19") = a coupon auto-applied at checkout
  (`once` for one intro period, `repeating` for several; years × 12 → Stripe
  `duration_in_months`). **Repeating** coupons take N months _or_ N years the same way.
- **Checkout is plan-driven** (`/api/stripe/checkout` takes a Payload `planId`) and supports
  **guest checkout**: an anonymous buyer pays first, then the webhook matches their email to an
  existing account or creates one + emails a Supabase invite (`/accept-invite` → `/a`).
  Stripe stays **web-only** (golden rule #4); mobile shows a read-only `/pricing` and links out.
- Self-serve billing lives at `/billing` (current plan, change/cancel via the Stripe portal, past
  invoices). Free→paid upgrade CTA is on `/a` (the app home).
- E2E: `tooling/web-e2e/src/subscription.spec.ts` covers the webhook mirror with
  self-signed events and (when a test-mode `STRIPE_SECRET_KEY` is set) real Checkout
  subscription creation — authenticated + guest — with Stripe's 4242 test card.

**User tags** (`public.tags` / `public.user_tags`, RLS read-own) tag each user by plan name (the
webhook auto-tags on active subscription; "Free" at signup) and are staff-manageable from the
Payload **Users** page — which now mirrors **all** Supabase users (see `lib/cms/mirror-user.ts`;
`profiles.is_staff` still gates admin login). Tags show on the app `/profile` (web + native).

## Remote MCP server (`@acme/mcp`)

The web app hosts a **remote MCP server** so a workspace admin can connect an MCP client
(Claude, ChatGPT, Cursor, …) and manage CMS content + push notifications in natural
language. It's **core, not a module** — MCP clients discover auth at domain-root paths
(`/.well-known/oauth-*`) and connect to `/mcp`, which modules (mounted under
`/api/mod/<slug>`) can't serve. All logic lives in the server-only package **`packages/mcp`
(`@acme/mcp`)**; thin Next.js route handlers wire it in and **inject** Payload + the
service-role client, so the package stays framework-agnostic and unit-testable (and never
enters the Expo bundle). It's **gated by `MCP_JWT_SECRET`** (`isMcpConfigured`/`isMcpEnabled`,

- an `MCP_ENABLED` kill switch) — the whole surface 404s until set.

* **Auth = OAuth 2.1 browser login** (MCP authorization spec). The app is its own OAuth 2.1
  authorization server: `/.well-known/oauth-protected-resource` + `/.well-known/oauth-authorization-server`
  discovery, dynamic client registration (`/oauth/register`), and PKCE (S256-only)
  `/oauth/authorize` + `/oauth/token`. **`/oauth/authorize` reuses the existing Supabase
  `/sign-in`** (redirects anonymous users there with itself as `redirectTo`) and gates on
  `profiles.is_staff` — signing in IS the consent, there's no second login UI. Access tokens
  are stateless **HS256 JWTs** (verified with `MCP_JWT_SECRET`, no DB hit); refresh tokens are
  opaque, hashed, and **rotate with reuse detection**. OAuth state lives in three **server-only,
  deny-all-RLS** `public.mcp_oauth_*` tables (see `docs/ERD.md`). `proxy.ts` bypasses session
  refresh for the bearer/DCR endpoints (`/mcp`, `/.well-known/oauth-`, `/oauth/register`,
  `/oauth/token`); `/oauth/authorize` flows through normally so it can read the session.
* **Transport:** the MCP SDK's **Web-standard Streamable HTTP transport, stateless**
  (`@modelcontextprotocol/sdk` — no `mcp-handler`), so a Next.js `Request` maps straight to a
  `Response` with no session store. `/mcp` verifies the bearer token, resolves the staff
  `cms.users` row, and runs **every tool through the Payload Local API as that user with
  `overrideAccess: false`** — so role-based access control is enforced exactly as in `/admin`.
  A missing/invalid token returns `401` with the `WWW-Authenticate` header that kicks off the
  client's OAuth flow (mandatory — don't drop it).
* **Tools:** `list_collections`, `search_content`, `read_content`, `create_content`,
  `update_content`, `delete_content` over an **allowlist** of editorial/community/marketing
  collections (`tools/registry.ts` — auth/PII collections excluded); `notify_create` /
  `notify_schedule` / `notify_list` / `notify_cancel`; and ChatGPT-compatible **`search` +
  `fetch`** (ids are `collection:id`). To expose another collection, add it to
  `MCP_COLLECTIONS`.
* **Notification delivery:** `notify_schedule` writes a `scheduled` Payload `notification`; the
  **dispatch worker** (`/api/cms/notifications/dispatch`, cron-secret-guarded, Supabase Cron —
  `kit-notifications-dispatch`) sends it. See `docs/CMS.md` → `notifications`.
* **Don't hardcode the origin** — absolute URLs (issuer/resource/metadata) come from
  `getSiteUrl()`. Tests: pure logic (pkce/tokens/oauth flow), an in-memory MCP client↔server
  tool test against a fake Payload, and the dispatch worker all run under `pnpm test` (no
  backend); the OAuth dance + a live MCP `tools/call` are Playwright/e2e against `next dev`.

## Theming (shadcn, one source of truth)

The **front end** is driven by one editable shadcn theme; the Payload `/admin` panel
uses its own **fixed** palette (Tailwind v4, OKLCH tokens). Layers:

1. **Static defaults (no-flash):** all design tokens live in **`tooling/tailwind/theme.css`**
   (`@acme/tailwind-config/theme`) — `:root` + `@variant dark`, plus the `@theme inline`
   map. This is the _only_ place tokens are defined. **Do not** redefine `:root`/`.dark`
   tokens in `apps/nextjs/src/app/styles.css` (it only holds imports, variants, base layer).
2. **Front-end runtime override (site-wide, editable):** the **`theme-settings` Payload global**
   (`payload/globals/ThemeSettings.ts`, staff-editable in `/admin`) is the authoritative
   **front-end** theme. `lib/theme/serialize.ts#themeToCss` turns it into a `<style>` that
   overrides the defaults (doubled `:root:root` selector wins regardless of `<head>` order),
   targeting `.dark` (front end). It's injected server-side by `<ThemeStyle />` (front-end
   layout `<head>`). Defaults live in `lib/theme/defaults.ts` and **must mirror `theme.css`**.
3. **Admin fixed theme:** the `/admin` panel is pinned to a hardcoded palette in
   **`lib/theme/admin-theme.ts`** (`ADMIN_THEME_CSS`), injected by `ThemeStyleProvider`
   (registered as Payload `admin.components.providers`). It is intentionally independent of
   the `theme-settings` global, so editing the front-end theme never changes the admin chrome.
   The dark block targets `[data-theme="dark"]` (the selector the admin toggles). To restyle
   the admin, edit the token values in that file.

The shared **app shell** (shadcn `dashboard-01`) wraps every authenticated page in
`app/(frontend)/(app)/layout.tsx` (sidebar + header); pages return content only.

**To add/change a color token:** edit `theme.css` (default) **and** `lib/theme/defaults.ts`
(`COLOR_TOKENS`, which also generates the global's fields + serializer output) — never in
`styles.css`. Fonts are a curated `next/font` set chosen at runtime via the global
(`FONT_*_OPTIONS`); their CSS vars are set on `<html>`.

**Payload admin** follows Payload's official Tailwind+shadcn guide: `(payload)/custom.css`
pulls in Tailwind **utilities without preflight** (so shadcn components work in admin
without breaking Payload's reset) and maps the shadcn tokens onto Payload's own
`--theme-*`/`--font-body` chrome variables. Token values come from `ThemeStyleProvider`
(the fixed `admin-theme.ts` palette, not the editable global).

**Editing the theme.** `theme-settings` is a **standard, versioned Payload global** — no
custom view. It lives in the **Admin** nav group under **Site Settings** and is edited with
Payload's native **Edit / API** tabs plus a **Versions** tab. Versioning is **drafts → publish**
(`versions: { drafts: true }`): the front end renders the **published** theme, so a draft save
does not change the live site until you **Publish** (the admin chrome is unaffected either way —
it uses the fixed `admin-theme.ts` palette). Fields are grouped in tabs
(Branding · Light · Dark · Typography · Other); branding uploads (app icon/logos) use standard
Media upload fields. Read access is `publishedOrStaff` (anonymous visitors get the published
theme; staff see drafts); update + `readVersions` are staff-only. Pure color math lives in
`lib/theme/color.ts` (consumed by `serialize.ts`). **Branding** (app name, favicon, sidebar logo)
is read server-side by `getBranding()` (lib/payload.ts) and surfaced via `BrandingProvider`.
Serif fonts (Instrument Serif, the default, plus Merriweather/Lora) are loaded on `<html>` alongside
the sans/mono set. The default theme is the Dream brand; see `docs/BRAND.md` for its tokens,
fonts, logo files and how to swap in your own brand.

## Conventions

- **TypeScript everywhere**, `strict`. No `any` without a reason.
- **Payload hooks/validates: always pass `req`** to nested Local API calls
  (`req.payload.find({ ..., req })`). A req-less call runs outside the
  operation's transaction and checks out a second pool connection — with the
  small serverless pool that can deadlock saves (300s 504s on Vercel).
- **Commits:** Conventional Commits, one per phase/feature
  (`feat(backend): ...`, `fix(auth): ...`).
- **Keep it buildable.** typecheck + lint must pass at every checkpoint.
- **Env changes** always touch both `.env.example` and the zod schema.
- **Migrations are append-only and idempotent-friendly.** Never edit a shipped
  migration; add a new one. They are also **expand/contract**: keep each one
  compatible with the previous release's code (add first; drop, rename, retype
  or set NOT NULL in a later release, marked `-- dream:contract <why>`).
  `tooling/mod/src/migration-safety.test.ts` enforces it.
- **Kit releases are tags.** Bump the root `package.json` version, merge, tag
  `vX.Y.Z` (or `vX.Y.Z-rc.N`); `.github/workflows/release.yml` runs the full CI
  with a production-build E2E, attests the source archive and publishes the
  release. Apps' `kit-update` PRs only ever merge published releases.
- **Don't track create-t3-turbo upstream** (see `docs/ARCHITECTURE.md` → Keeping
  dependencies current): snapshot + cherry-pick only. The forked SHA is in `NOTICE`.
- **Vendor features (free plan first, minimal setup).** This is an open-source
  starter, so every default must work on each vendor's **free plan** and need no
  manual dashboard setup beyond pasting API keys.
  - Prefer a vendor's native feature over hand-rolled code when it is available
    on the free plan. Examples: Supabase Cron, Queues and Vault; Payload's Jobs
    Queue, indexes and versions; Next's tagged data cache.
  - Anything that needs a paid plan must be optional and degrade gracefully.
  - If a feature needs a secret or an endpoint, have the kit provision it
    (derive it, store it in Vault, register it through the vendor API) rather
    than adding a manual step.
  - **One exception: compliance (SOC 2 / HIPAA) needs paid tiers.** That means
    BAAs, the Supabase HIPAA add-on, PITR, and providers that will sign a BAA. A
    compliance module validates those requirements itself; the kit's free-first
    defaults stay as they are.

## Staying current with the kit (upstream sync)

When this repo is a **fork/clone of the kit** and you're asked to "sync with
upstream", "pull in kit updates", or "merge upstream", run the tested routine
(full guide: `docs/UPDATING.md`). The whole flow depends on **sharing git history**
with the kit, so the cardinal rule is: keep the merge commits, never squash them.

- **Remote.** The named remote is `upstream`
  (`git remote add upstream https://github.com/vpv-group/dream-starter-kit.git`);
  add it if missing, then `git fetch upstream`.
- **Detect the starting situation:** `git merge-base <yourmain> upstream/main`.
  Resolves → shared history (GitHub "Fork"), merge normally. Empty/non-zero →
  unrelated history ("Use this template", or re-init'd/squashed-snapshot repos);
  fix it **once** with `git merge upstream/main --allow-unrelated-histories`
  (nearly conflict-free where the tree already matches upstream — identical files
  merge cleanly against the empty base), resolve, commit. After that one merge,
  `upstream/main` is a real ancestor and every later update is a plain three-way merge.
- **The routine (every update):** `git fetch upstream` → branch off main
  (`git checkout -b sync/upstream-YYYY-MM-DD`) → `git merge upstream/main` → resolve →
  `pnpm install && pnpm typecheck && pnpm lint && pnpm test` → open a PR into main.
- **NEVER squash a sync PR** — land it with a merge commit or rebase/fast-forward.
  Squashing flattens the merge commit that records `upstream/main` as an ancestor,
  re-breaking the relationship and forcing `--allow-unrelated-histories` next time.
- **Conflict hotspots:** generated files (`packages/cms/src/payload-types.ts` →
  `pnpm cms:gen-types`; Supabase types → `pnpm db:gen-types`) — take either side
  then **regenerate**, don't hand-merge (both `gen-types` scripts run
  `prettier --write` on their output, so a regenerate is already
  `pnpm format`-clean — no manual formatting step). Migrations are append-only — keep **both** sides'
  files, then `pnpm db:reset` (+ `pnpm db:gen-migrations` if the bundle JSON drifts).
  Env: reconcile both `.env.example` and the zod schema. `pnpm-lock.yaml`: re-run
  `pnpm install`, don't hand-merge.
- **Intentional divergence** (branding, your CI, README): pin with `.gitattributes`
  (`path/** merge=ours`) + `git config merge.ours.driver true` (per-clone, not
  committed). `merge=ours` doesn't cover modify/delete — re-delete those.
- **Automatic kit-update PRs:** once GitHub is connected in /admin → Updates
  (the Meet Dream AI GitHub App; the workflow signs in with its Actions OIDC
  token, no stored secret), the `kit-update` job in `module-ops.yml` does
  this routine daily, merging the kit's newest published release tag
  (attestation verified), never `main`, into one `dream/kit-update-*` PR.
  Generated-file conflicts are resolved by regenerating; real ones are
  committed as markers and labeled `dream-update-conflicts`. The `merge` job
  (`pnpm mod ops merge` → `decideMerge`) merges clean, green, soaked PRs with
  a merge commit when **Merge updates automatically** is on (the default).
  Resolve conflicted ones exactly like a manual sync (merge commit).
- **Free site license** (`lib/dream/site*.ts`, the `dream-site` global,
  `/.well-known/dream-site.json`, cron `/api/cms/dream-site/report`):
  - After the first seed, the deployment registers its domain and
    admin/staff emails with meetdream.com for a free license key, then
    reports in daily.
  - It is disclosed on the founder's `/sign-up` and on `/cms-setup`;
    `DREAM_TELEMETRY=off` opts out.
  - The app's license key is the site key (admins see its prefix only);
    `module-ops.yml` signs in with its Actions OIDC token instead.
  - See `docs/MODULES.md` → Site license.
- **Single urgent fix without a full sync:** `git fetch upstream` then
  `git cherry-pick <sha>` (patch-based — works across unrelated histories).
- **Post-merge:** `pnpm install`, `pnpm db:reset`, regenerate types, then the gates
  (`pnpm typecheck && pnpm lint && pnpm test`, plus `pnpm test:rls` if schema/RLS
  changed). Commit `docs:`/`chore:`, branch off main, PR with what & why.

## Status

The kit is **feature-complete and ready to clone** — and is now a **module
host** (docs/MODULES.md): auth, the CMS registry, theming, the app shell, and
the **remote MCP server** (`@acme/mcp`, docs/MCP.md) are core; dashboard,
notifications, reminders, chat and billing ship as
pre-installed modules under `modules/` with the full lifecycle
(create/add/update/remove, CMS-driven menus, per-module settings screens,
the /admin Modules screen + module-ops workflow). The test/CI suite is
green end to end. Known follow-ups: opening the CMS API bridge to member
sessions; publishing the five first-party modules to their own repos +
the official catalog repo (`pnpm mod eject`); per-module RLS test
relocation (the central suite still covers all tables). Extend the kit with
`pnpm mod create`, keep every checkpoint green
(`pnpm typecheck && pnpm lint && pnpm test`), and update this file when
conventions change.
