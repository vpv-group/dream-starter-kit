<p>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/nextjs/public/brand/dream-starter-kit-logo-reversed.svg">
    <img src="apps/nextjs/public/brand/dream-starter-kit-logo-color.svg" alt="Dream Starter Kit" height="40">
  </picture>
</p>

**Free forever. Open source.**

A clone-and-ship starter: one **Turborepo** monorepo shipping a **Next.js web app**
and an **Expo (iOS + Android) app** that share **one Supabase backend**
(Postgres + Auth + Row-Level Security + Storage + Edge Functions). Stripe billing,
a Vercel-AI-Gateway assistant, Expo push notifications, and a **Payload CMS** content
backend are wired in. Clone it, rename a few things, and extend it into a real product.

[![Deploy](https://vercel.com/button)](https://www.meetdream.com/start?host=vercel)

> Opens meetdream.com/start, which deploys the **web app** to Vercel with a Supabase
> project attached: Vercel's Supabase integration injects the database keys, and the
> app sets up its own schema on first boot. Then sign up on your new site: the first
> account is the admin, and `/cms-setup` walks you through connecting GitHub (for
> automatic updates) and finishing your services. See [Deploy](#deploy). Forks: point
> the button at `https://vercel.com/new/clone?repository-url=<your fork>&root-directory=apps%2Fnextjs`.

> **Not an engineer?** You can still use this. Setup is copy-paste (below), and the
> kit is structured so an AI coding assistant like [Claude Code](https://claude.com/claude-code)
> can extend it feature-by-feature — see [`CLAUDE.md`](./CLAUDE.md) for the recipe it follows.
> Want it built for you instead? [Future.dev](https://future.dev) builds custom software
> and apps.

### What you get out of the box

- **Auth** — email/password, magic link, Google & Apple OAuth (Supabase Auth), with
  protected routes on web + native and account deletion.
- **A real data feature** — `reminders` CRUD on web _and_ native from one set of
  shared react-query hooks, fully protected by Row-Level Security. This is the
  reference pattern you copy for your own per-user tables.
- **A content CMS** — **Payload CMS v3** manages editorial/marketing content
  (`posts`, `videos`, `audio`, `photos`, `series`/courses, `locations`, `events`, plus community, engagement and marketing collections) from
  an admin at **`/admin`**. Public pages render **server-side** for SEO; the mobile app
  reads the same content over REST. Payload runs web-only and owns its own `cms` schema
  outside RLS (see [Architecture → Content](./docs/ARCHITECTURE.md#410-content--payload-cms)).
- **Billing** — Stripe Checkout + customer portal + a signature-verified, idempotent
  webhook. A single **Pro** plan (Monthly **$9.99** / Yearly **$99**). Mobile unlocks
  premium by reading the `subscriptions` table (no IAP — see
  [App Store and Google Play payment rules](./docs/STRIPE.md#app-store-and-google-play-payment-rules)).
- **AI assistant** — Vercel AI SDK v6 → Claude through the AI Gateway, behind an
  authed, rate-limited, token-capped server route; conversations persist.
- **Engagement** — in-app notifications, reminders, and Expo push (with a scheduled
  worker that fires due reminders and delivers scheduled notifications).
- **A remote MCP server** — connect Claude, ChatGPT, Cursor, or any MCP client to
  manage CMS content and push notifications in natural language. OAuth 2.1 browser
  login (reuses your Supabase sign-in, staff-only); every action runs with the admin's
  Payload permissions. Off until `MCP_JWT_SECRET` is set — see
  [`docs/MCP.md`](./docs/MCP.md).
- **Quality gates** — typecheck, lint, Vitest, an RLS isolation regression, Playwright
  e2e, and a copyleft license check — all run in CI.

## Source of truth

- **[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)** — stack, structure, security model, and dependency policy.
- **[`docs/ERD.md`](./docs/ERD.md)** — data model + the canonical RLS pattern every table follows.
- **[`docs/CMS.md`](./docs/CMS.md)** — the Payload CMS reference: every collection, global, field & access rule.
- **[`docs/BRAND.md`](./docs/BRAND.md)** — the Dream brand the kit ships with: logo, colour, type, voice, and how to swap in your own.
- **[`docs/DESIGN-SYSTEM.md`](./docs/DESIGN-SYSTEM.md)** — how signed-in app screens and module pages are built: layout, framed cards, list views, record pages, boards, status tones.
- **[`docs/MCP.md`](./docs/MCP.md)** — the remote MCP server: enabling it, connecting clients, OAuth, tools & security.
- **[`docs/UPDATING.md`](./docs/UPDATING.md)** — how to pull upstream kit updates into your fork without losing your changes.
- **[`CLAUDE.md`](./CLAUDE.md)** — working agreement, the golden security rules, and the "how to add a feature" recipe.

If anything here disagrees with those, **they win.**

## Stack

| Layer         | Choice                                                                    |
| ------------- | ------------------------------------------------------------------------- |
| Monorepo      | Turborepo + pnpm (forked from create-t3-turbo)                            |
| Web           | Next.js (App Router) · shadcn/ui · Tailwind · Payload admin at `/admin`   |
| Mobile        | Expo + Expo Router · react-native-reusables · NativeWind                  |
| Backend       | Supabase — Postgres + Auth + RLS + Storage + Edge Functions (Deno)        |
| Content / CMS | Payload CMS v3 (web/server only) — own `cms` schema, REST at `/cms-api`   |
| Data layer    | `@supabase/supabase-js` typed client + react-query hooks (`packages/api`) |
| Payments      | Stripe (web only) + webhook edge function                                 |
| AI            | Vercel AI SDK v6 via the AI Gateway (Claude default)                      |
| MCP           | Remote MCP server (`@acme/mcp`) at `/mcp` — OAuth 2.1, staff-only         |
| Ship          | Vercel (web) · EAS (mobile) · Expo Push                                   |

> The package scope is `@acme/*` (inherited from the template) — renameable; see
> **[Rename the package scope](#rename-the-package-scope)**. Don't rename mid-build.

## Prerequisites

- **Node 22** — `.nvmrc` pins `22.23.4`; run `nvm use`.
- **pnpm 10** — `corepack enable` (or `npm i -g pnpm@10`).
- **Supabase CLI** + **Docker** — for the local Postgres/Auth/Storage stack.
- A few **free-tier accounts** (see next section). Local dev needs only Supabase.

## Accounts you'll need

| Service                              | What it's for                                            | When                         |
| ------------------------------------ | -------------------------------------------------------- | ---------------------------- |
| **[Supabase](https://supabase.com)** | Postgres, Auth, Storage, Edge Functions                  | Local dev (CLI) + production |
| **[Vercel](https://vercel.com)**     | Hosts the web app; injects the **AI Gateway** credential | Web deploy + AI              |
| **[Expo / EAS](https://expo.dev)**   | Mobile builds, submissions, and push delivery            | Mobile builds + push         |
| **[Stripe](https://stripe.com)**     | Subscriptions (web only)                                 | Billing                      |

AI runs through the **Vercel AI Gateway**, so there's no separate AI-provider signup —
on Vercel an OIDC token is injected automatically; locally set `AI_GATEWAY_API_KEY`.

## Get started

The fastest path is one command, which clones the kit's newest release with its
history (so kit updates merge cleanly), sets up the local stack and signs you in
as a dev admin:

```bash
npx create-dream-app my-app
```

Or do it by hand: **fork → run locally → make it yours**, below. (Prefer to host
first? Use the [Deploy button](#dream-starter-kit) above.)

### 1. Fork & clone

Click **Fork** at the top of the GitHub page to create your own copy, then clone it:

```bash
git clone https://github.com/<your-username>/dream-starter-kit.git
cd dream-starter-kit
```

### 2. Install (Node 22 + pnpm 10)

```bash
nvm use            # uses .nvmrc → Node 22.23.4  (or install Node 22)
corepack enable    # provides pnpm 10
pnpm install
```

### 3. Start the local backend (one command)

Requires Docker and the [Supabase CLI](https://supabase.com/docs/guides/cli)
(the version CI pins in `.github/workflows/ci.yml`).

```bash
pnpm dev:setup     # boots local Supabase, writes .env with the local keys and a
                   #   generated PAYLOAD_SECRET, resets the database (first run),
                   #   and creates a dev admin
```

It prints a **dev admin** (`admin@dream.test`; the password is saved in
`.dream/dev-admin.json`, which git ignores). Sign in with it and `/admin` and `/a`
work right away: no sign-up, no confirmation email. Your first visit to `/admin`
seeds the CMS with demo content (a short progress bar). Re-running is safe and keeps
your data; `pnpm dev:setup --reset` starts from an empty database.

> It's the same bootstrap Claude Code cloud sessions (`--profile cloud`, run by the
> SessionStart hook) and CI (`--profile ci`) use, so the three never drift.
> (It's `dev:setup`, not `setup`: `pnpm setup` is a built-in pnpm command.)

Use `pnpm db:reset` rather than bare `supabase db reset`: the former also runs
`pnpm cms:migrate`, which re-creates Payload's `cms` tables. **The CMS shares your
Supabase login — there's no separate Payload account.** Confirmation emails (link + a
6-digit code) land in **Mailpit** at http://127.0.0.1:54324. On an empty database the
**first** signup becomes the owner (staff) and is routed through the CMS seed. To add
more editors later, invite them from **`/admin` → Users → Create New**. The
`pnpm cms:seed` CLI is still available for headless setup.

### 4. Run it

```bash
pnpm dev:next      # web only  →  http://localhost:3000
pnpm dev           # web + mobile together (turbo watch)
```

The CMS admin is at **http://localhost:3000/admin**. Modules install with one
command, ready to preview: `pnpm mod add <slug>` vendors the module, applies its
migrations to your local database and regenerates the types (`--no-apply` skips that).

### 5. Make it yours

Rebrand the identity and swap in your own services — see
[Make it yours](#make-it-yours). Then build features with the recipe in
[`CLAUDE.md`](./CLAUDE.md).

### 6. Ship it

Deploy the web app to Vercel and the mobile app via EAS — see [Deploy](#deploy).

---

Run the gates before every commit:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

## Environment variables

Every variable is validated by a zod schema (`packages/config/env` + each app's
`env.ts`); **the app fails loudly on boot if a required one is missing or malformed.**
`.env.example` is the annotated source — copy it to `.env` and fill it in.

**Security model (non-negotiable):**

- `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` are **compiled into the client bundle** → public.
  Only ever put anon/publishable values there.
- Everything else is **server-only** (Next server code + Supabase edge functions).
- The Supabase **service-role key bypasses RLS** and lives **only** server-side
  (edge functions / server routes) — never in web client or mobile code.

| Variable                                                                                | Public? | Where to get it                                                                                                                          |
| --------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL`                                 | ✅      | `supabase start` output / Dashboard → Project Settings → API                                                                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`                       | ✅      | same                                                                                                                                     |
| `SUPABASE_SERVICE_ROLE_KEY`                                                             | 🔒      | same (server-only; bypasses RLS)                                                                                                         |
| `SUPABASE_DB_URL`                                                                       | 🔒      | local default in `.env.example` / hosted pooler URL                                                                                      |
| `CRON_SECRET`                                                                           | 🔒      | you choose; guards the `reminders-process` function and the notifications dispatch route                                                 |
| `MCP_JWT_SECRET` / `MCP_ENABLED`                                                        | 🔒      | enables the remote MCP server (`openssl rand -base64 32`); `MCP_ENABLED="off"` is a kill switch — see [docs/MCP.md](./docs/MCP.md)       |
| `NEXT_PUBLIC_APP_URL` / `EXPO_PUBLIC_API_URL`                                           | ✅      | your web origin (LAN IP in mobile dev). On Vercel the web origin is auto-detected — see `NEXT_PUBLIC_SITE_URL`                           |
| `NEXT_PUBLIC_SITE_URL`                                                                  | ✅      | optional — pin the public web origin to a custom domain; else auto-detected on Vercel / falls back to `NEXT_PUBLIC_APP_URL`              |
| `AI_GATEWAY_API_KEY`                                                                    | 🔒      | [Vercel AI Gateway](https://vercel.com/ai-gateway) (auto on Vercel)                                                                      |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`                                           | 🔒      | Stripe Dashboard / `stripe listen`                                                                                                       |
| `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY`                                          | 🔒      | Stripe price IDs (`price_…`)                                                                                                             |
| `PAYLOAD_DATABASE_URL`                                                                  | 🔒      | `payload_cms` role connection (`search_path=cms`); local default in `.env.example` — hosted: optional, derived from the service-role key |
| `PAYLOAD_SECRET`                                                                        | 🔒      | Payload admin auth/encryption (`openssl rand -base64 32`) — hosted: optional, derived from the service-role key                          |
| `S3_ENDPOINT` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_BUCKET` | 🔒      | Supabase Storage (S3) for Payload media — the `cms-media` bucket; local defaults in `.env.example`                                       |
| `NEXT_PUBLIC_CMS_URL` / `EXPO_PUBLIC_CMS_URL`                                           | ✅      | Payload REST origin (mobile reads content; web is same-origin)                                                                           |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_*` / `_APPLE_*`                                          | 🔒      | OAuth provider consoles (local dev only; prod uses the Dashboard)                                                                        |
| `EXPO_PUBLIC_EAS_PROJECT_ID` / `EXPO_PUBLIC_AUTH_SCHEME`                                | ✅      | `eas init` / `app.config.ts` `scheme`                                                                                                    |

The AI model id is **not** an env var — it's centralized in `packages/config`
(`DEFAULT_AI_MODEL`) and is swappable.

## Running the mobile app

```bash
pnpm dev                # or: pnpm -F @acme/expo dev
```

- Point `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_API_URL` at your machine's **LAN IP**
  (not `localhost`) so a device can reach the local stack.
- **Push notifications require a dev build** (`eas build --profile development`) on a
  **physical device** — Expo Go can't receive remote push (Android, SDK 53+). The
  emulator/simulator returns no token.

## Repo structure

```
apps/nextjs        # web — Next.js App Router, shadcn/ui (thin entry point)
  src/app/(frontend)/(public)/  # public CMS pages (server-rendered via Payload Local API)
  src/app/(payload)/            # Payload admin (/admin) + REST (/cms-api)
  src/app/(mcp)/                # remote MCP server (/mcp) + OAuth (/oauth/*)
  src/app/.well-known/          # OAuth discovery metadata for MCP clients
  src/payload/                  # Payload collections, access-control, seed
  src/payload.config.ts         # Payload config (collections, db, S3 storage)
apps/expo          # mobile — Expo Router, react-native-reusables (thin entry point)
packages/api       # Supabase data layer: typed client, generated DB types, react-query hooks
packages/app       # cross-platform features: zod validators, hooks (incl. content hooks), pure logic
packages/cms       # Payload content TYPES ONLY (generated; safe to import on mobile)
packages/mcp       # remote MCP server: OAuth 2.1, CMS/notification tools, dispatch worker (server-only)
packages/ui        # shared UI tokens/primitives + theme/toast
packages/config    # zod env schema + constants (DEFAULT_AI_MODEL, PLANS, rate limit)
supabase/          # migrations (schema + RLS), payload/ (cms role+schema), seed.sql, edge functions, config.toml
tooling/           # eslint / prettier / tailwind / tsconfig + rls-tests + web-e2e + CI setup
```

**Cross-platform logic lives in `packages/`; `apps/*` are thin.** New data features
follow the recipe in `CLAUDE.md` (migration + RLS + FK index → types → validator →
hook → web & native UI → tests).

## Make it yours

This repo ships in the **Dream** brand, with placeholder identifiers (bundle id,
scheme, package scope) so it stays a clean template. Forking it for a real app is
mostly swapping identity + secrets — and almost all the secrets are env vars, so the
source-level edits are small.

**Identity (source):**

- [ ] **App name** — `APP_NAME` in `packages/config` (the short brand), plus the web
      titles/OG in `apps/nextjs/src/app/(frontend)/layout.tsx` and
      `(frontend)/opengraph-image.tsx`. (There's no top-level `app/layout.tsx` — the app
      lives in the `(frontend)` route group and Payload's admin in `(payload)`.)
- [ ] **Logo, icons and colours** — the kit ships with the Dream logo, icons and
      design tokens. Swap the files listed in [`docs/BRAND.md`](./docs/BRAND.md#use-your-own-brand)
      (favicons, `public/brand/`, the Expo icons) and set your colours, fonts, name and
      logo in `/admin` → Theme, or change the defaults in `tooling/tailwind/theme.css`.
- [ ] **Bundle id** — `apps/expo/app.config.ts` (`ios.bundleIdentifier` + `android.package`),
      shipped as the placeholder `com.example.dreamstarter`.
- [ ] **Deep-link scheme** — set `EXPO_PUBLIC_AUTH_SCHEME` (default `dreamstarter` in
      `app.config.ts`) and update the matching `…://auth-callback` entry in
      `supabase/config.toml` **and** your Supabase dashboard redirect URLs.
- [ ] **Package scope** — `@acme/*` is workspace-internal (never published) and fine to
      keep; rename only if you want branded imports (see below).

**Config (env — no source changes):**

- [ ] Supabase project + keys, Stripe products/keys + webhook, `AI_GATEWAY_API_KEY`,
      `EXPO_PUBLIC_EAS_PROJECT_ID` (`eas init`), `NEXT_PUBLIC_APP_URL` — see
      [Environment variables](#environment-variables) and [Deploy](#deploy).
- [ ] **License** — keep Apache-2.0 or relicense your fork (Apache lets you build a
      proprietary product on top); update the copyright line in `NOTICE`.

Then add your own product data. There's **no** example domain to rename — instead you
add tables/content for your idea:

### Add your own feature

The kit ships two reference shapes to copy, depending on whose data it is:

- **Per-user app data** (your product's records, protected by RLS) — copy the
  **`reminders`** feature: a migration (table + RLS + FK index), a validator, shared
  react-query hooks, web + native screens, and an RLS test. Full recipe in
  [`CLAUDE.md`](./CLAUDE.md#how-to-add-a-modular-feature).
- **Editorial / marketing content** (the same for every visitor — posts, events,
  pages) — add a **Payload collection** instead of a Supabase table. It's served on
  public pages and to mobile over REST, and is governed by Payload's access-control
  (not RLS). Recipe in
  [`CLAUDE.md` → How to add a Payload content type](./CLAUDE.md#how-to-add-a-payload-content-type).

### Rename the package scope

`@acme/*` is inherited. To rebrand to `@your-scope/*`, do a careful find-and-replace
across `package.json` files, `tsconfig` paths, and imports, then `pnpm install`. Do it
**once, before building features** — not mid-stream.

### Staying up to date with the kit

The kit keeps shipping fixes, new modules, and security hardening after you fork.
Pull them in without losing your changes: add the kit as an `upstream` remote once,
then merge `upstream/main` into a `sync/…` branch and open a PR — **never squash sync
PRs** (it breaks the shared-history relationship and forces a full re-merge next time).
Full tested routine, conflict hotspots, and the `merge=ours` pinning trick for files
you intentionally diverge on: **[`docs/UPDATING.md`](./docs/UPDATING.md)**.
Connect GitHub once in **/admin → Updates** and a daily job opens these kit
update PRs for you, from the kit's newest published release (never its `main`
branch; the release's build attestation is verified first). They are free,
land with a merge commit, and merge themselves once every check passes unless
you turn that off.

**Free site license.** After the first CMS seed, your deployment registers with
meetdream.com: it sends its domain, the admin and editor emails, the kit version
and the repository name, and gets a free license key for lifetime kit updates
and free modules. You're told on the founder's `/sign-up` and again on
`/cms-setup` before anything is sent; set `DREAM_TELEMETRY=off` to opt out. See
[`docs/MODULES.md` → Site license](./docs/MODULES.md#site-license).

## Testing

```bash
pnpm test            # Vitest unit/integration — no backend needed
pnpm test:rls        # RLS isolation regression — needs `supabase start` + .env
pnpm test:e2e        # Playwright e2e — needs `supabase start` + db reset; boots `next dev`
pnpm license:check   # fails on strong copyleft (GPL/AGPL/SSPL) in the prod tree
```

CI (`.github/workflows/ci.yml`) runs lint · format · typecheck · unit · license on
every PR, plus an `integration` job that boots a real Supabase and runs `test:rls` +
Playwright. See [`tooling/web-e2e/README.md`](./tooling/web-e2e/README.md).

## Deploy

### Fastest path — Vercel one-click + the Supabase integration

The [**Supabase integration**](https://vercel.com/marketplace/supabase) on the Vercel
Marketplace provisions a Postgres/Auth/Storage project and **auto-injects** the env the
app needs — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY` and `POSTGRES_*` — so you type no Supabase secrets by hand. (The
app accepts the publishable and secret keys as its anon and service-role keys.)

1. **Deploy** — click [Deploy with Vercel](#dream-starter-kit) at the top. Vercel clones
   the repo and builds with placeholder Supabase config (no env required upfront), so the
   deploy **succeeds** — but the app won't work until you connect Supabase and redeploy
   (next steps).
2. **Add Supabase** — in the new Vercel project open **Storage → Create Database →
   Supabase** (or install from the [Marketplace](https://vercel.com/marketplace/supabase)),
   and create a new project. Vercel writes the Supabase + Postgres env vars into the
   project automatically. That's all the CMS needs too: `PAYLOAD_SECRET` and the
   `payload_cms` connection string are **derived automatically** from the injected
   `SUPABASE_SERVICE_ROLE_KEY` (setting `PAYLOAD_SECRET` / `PAYLOAD_DATABASE_URL`
   yourself always overrides — see
   [Content backend (Payload CMS)](#content-backend-payload-cms), including the
   service-role-key **rotation** caveat). If neither explicit nor derivable,
   `/admin` and the CMS seed answer **503 "CMS not configured"** naming what's
   missing (the rest of the app works).

3. **Apply the schema** — nothing to run. The integration creates an _empty_ database,
   and the app **provisions it itself on first boot**: a runtime bootstrap
   (`apps/nextjs/src/lib/db/bootstrap.ts`) applies `supabase/migrations` over the
   integration-injected `POSTGRES_URL_NON_POOLING` (or `SUPABASE_DB_URL` if you set one),
   recording them in the same ledger the CLI uses. `supabase link && supabase db push`
   remains a supported manual/CI alternative — either order is safe, and
   `DB_BOOTSTRAP=off` disables the runtime path entirely. TLS: hosted connections
   (`sslmode=require`, what the integration injects) are encrypted but **not
   CA-verified** — Supabase's cert chain is rooted in its own CA; set
   `sslmode=verify-full` and supply that CA via `NODE_EXTRA_CA_CERTS` to opt into
   strict verification. Deploy the edge functions —
   see [Backend (Supabase)](#backend-supabase).
4. **Redeploy** — in Vercel, **Deployments → ⋯ → Redeploy** so the build picks up the
   injected env vars. The web app should now be live (the first boot runs the DB
   bootstrap above) — verify at `https://<your-domain>/api/health/db`, which reports
   the bootstrap status (`ok`, with the applied migration versions) and a sanitized
   error if provisioning failed. A brand-new Supabase project can reject the very
   first connection attempts while it finishes provisioning — that's fine: the
   bootstrap retries at boot and again from request paths (and `/welcome` shows an
   auto-refreshing setup page instead of an error), so give it a minute before
   digging into logs.
5. **Finish config** — in the Supabase dashboard set **Authentication → URL
   Configuration**. **This is required** — a fresh Supabase project defaults its Site URL
   to `http://localhost:3000` and the integration doesn't change it, so until you do this
   magic-link / confirmation / OAuth redirects bounce back to `localhost` (you'll land on
   `http://localhost:3000/?code=...`). Set:
   - **Site URL** → `https://<your-domain>`
   - **Redirect URLs** (add each) → `https://<your-domain>/**` · `https://*.vercel.app/**`
     (Vercel preview deploys, optional) · `http://localhost:3000/**` (local dev) ·
     `dreamstarter://auth-callback` (native app). The `/**` matters — it lets the
     `/auth/callback?next=…` query through.

   Then enable any OAuth providers. You do **not** need to set the app's own URL — it's
   auto-detected from Vercel's `NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL` (set
   `NEXT_PUBLIC_SITE_URL` only to pin a custom domain). For billing/AI add `STRIPE_*` +
   `AI_GATEWAY_API_KEY` in Vercel (the AI Gateway credential is auto-injected on Vercel).

   Hosted projects have **email confirmations ON** by default — the kit's sign-up flow
   handles this (`/check-email`, link or manual code), and local dev matches
   (`enable_confirmations = true` in `supabase/config.toml`). Mirror the kit's email
   templates in **Authentication → Emails**:
   - **Confirm signup** ← [`supabase/templates/confirmation.html`](./supabase/templates/confirmation.html)
     — links to `/confirm-email?token_hash=…` (works for original **and re-sent**
     confirmations, from any browser — re-sent links from the default template are
     broken by design, since re-sends carry no PKCE state) and shows the
     `{{ .Token }}` code the manual-code option on `/check-email` needs.
   - **Invite user** ← [`supabase/templates/invite.html`](./supabase/templates/invite.html)
     — links straight to `/accept-invite?token_hash=…` so the one-time invite token is
     verified explicitly by the page instead of being consumed by following a redirect;
     the default link-style token gets burned by mail-scanner prefetch or a browser
     navigation restart. (`/accept-invite` is covered by the `/**` Redirect URL wildcard
     above — no extra entry needed.) The same template sends **workspace invites**
     (Teams / Both account models): it switches to "{inviter} invited you to
     {workspace}" copy from the invite's metadata and carries `redirect_to` so the
     invitee lands in that workspace. Re-paste it whenever the file changes.
   - **Change Email Address** ← [`supabase/templates/email_change.html`](./supabase/templates/email_change.html)
     — sent to **both** the old and new address when a member changes their email on
     `/profile` (keep **Secure email change** on); links to
     `/confirm-email?token_hash=…&type=email_change`. Also used by the paywall's
     anonymous → permanent account conversion.
   - **Reauthentication** ← [`supabase/templates/reauthentication.html`](./supabase/templates/reauthentication.html)
     — the 6-digit code a member enters to change their password when their session is
     older than 24h. Turn on **Authentication → Providers → Email → Secure password
     change** to match local (`secure_password_change = true`). See
     [docs/AUTH.md → Account settings](./docs/AUTH.md).
   - **Security notifications → Password changed** ← [`supabase/templates/password_changed_notification.html`](./supabase/templates/password_changed_notification.html)
     — turn it on (local: `[auth.email.notification.password_changed]`); it tells a
     member their password was just changed.

   Also consider custom SMTP (**Authentication → Emails → SMTP**): Supabase's built-in
   sender is heavily rate-limited (~2 emails/hour) and meant for testing only — set it
   up before relying on workspace invites, which each send an email. Set the same
   provider's credentials as the app's `SMTP_*` env (`.env.example` → "Outgoing
   email") for the emails the app sends itself (phone-changed and admin
   password-reset notices).

   > **Signed up before configuring the URLs?** The first confirmation link will have
   > redirected to `localhost` (or expired on a retry) — the account is fine. The
   > `is_staff` founder flag is granted at **sign-up**, not at confirmation, and the
   > link's first click usually confirmed the email anyway (only the redirect broke).
   > Just **sign in**: you'll be routed through `/welcome` into `/cms-setup` (the CMS
   > seeds on the founder's first entry) and on to `/admin`. If the email really is
   > still unconfirmed, signing in re-sends a fresh confirmation and lands on
   > `/check-email`, and `/profile` shows a **Verify email** button — signing up again
   > with the same address also re-sends.

6. **Set up the CMS** — add the `PAYLOAD_*` + `S3_*` env in Vercel and redeploy; the
   same first-boot bootstrap creates the `cms` schema + `payload_cms` role (with the
   password you put in `PAYLOAD_DATABASE_URL`) and Payload applies its own committed
   migrations. Then log into `/admin` — see
   [Content backend (Payload CMS)](#content-backend-payload-cms).

### Backend (Supabase)

The SQL schema needs **no manual step** — the deployed app applies
`supabase/migrations` itself on first boot (see Deploy step 3). Pushing by hand still
works and stays in sync (both write the Supabase CLI's
`supabase_migrations.schema_migrations` ledger); edge functions and their secrets are
the part that's still deployed from the CLI:

```bash
supabase link --project-ref <your-ref>
supabase db push                          # optional — the app already did this on boot
supabase functions deploy billing-stripe-webhook  # + delete-account, reminders-process

# Module installs + automatic updates need no setup here: connect GitHub once
# in /admin → Updates (see docs/MODULES.md).
supabase secrets set STRIPE_SECRET_KEY=… STRIPE_WEBHOOK_SECRET=… CRON_SECRET=…
```

Enable OAuth providers and set redirect URLs in the Supabase Dashboard (Auth →
Providers / URL Configuration). Schedule `reminders-process` (pg_cron / a scheduler)
with the `CRON_SECRET` in the `Authorization` header.

### Content backend (Payload CMS)

Payload runs inside the deployed web app. Its `cms` schema + login role aren't captured
by `supabase db push` (`CREATE ROLE` isn't diffed) — instead the **runtime bootstrap
creates them on first boot**, taking the password from `PAYLOAD_DATABASE_URL`:

1. **Env** — nothing required: when `PAYLOAD_SECRET` / `PAYLOAD_DATABASE_URL` are
   unset, both are **derived deterministically from `SUPABASE_SERVICE_ROLE_KEY`**
   (HMAC; see `apps/nextjs/src/lib/cms/derived-credentials.ts`) and the bootstrap
   creates the `payload_cms` role with the derived password on first boot. Setting
   them explicitly always wins: `PAYLOAD_SECRET` (`openssl rand -base64 32`) and/or
   `PAYLOAD_DATABASE_URL` — the `payload_cms` role's connection string with a
   **real password you choose** (the bootstrap creates the role with it —
   create-only, it never alters an existing role's password, and it refuses the
   local dev password in production). Use the **direct/session** Postgres
   connection (port 5432), not the transaction pooler, and keep the
   `?options=-c%20search_path%3Dcms` suffix (see `.env.example`).

   > **Rotation caveat:** rotating `SUPABASE_SERVICE_ROLE_KEY` changes the derived
   > values. After a rotation, either set the explicit vars, or update the
   > `payload_cms` role's password to the newly-derived one (SQL editor). Also set
   > the `S3_*` vars (point them at your Supabase Storage S3 endpoint; the
   > **public-read `cms-media`** bucket itself ships as a migration). For mobile,
   > set `EXPO_PUBLIC_CMS_URL` to your web origin.

   > Prefer to provision by hand (or rotate the password later)? Run
   > [`supabase/payload/00_cms_role.sql`](./supabase/payload/00_cms_role.sql) in the
   > Supabase dashboard **SQL editor** — it remains the manual fallback.

2. **Migrate** — nothing to run. Production has dev-push OFF, so Payload's tables come
   from committed migrations (`apps/nextjs/src/payload/migrations`), which Payload applies
   **automatically on first boot** via the adapter's `prodMigrations` — idempotent, tracked
   in the `cms.payload_migrations` ledger. An initial migration ships with the kit, so a
   fresh deploy self-provisions the `cms` schema on the first request. After you change a
   collection, regenerate with `pnpm cms:migrate:create` and **commit** the new file; the
   next deploy applies it. (`pnpm cms:migrate` still works for applying against any DB by
   hand, but isn't needed in the deploy flow.)
3. **Log in** — sign up through the app first (confirm via the email Supabase sends);
   the **first** signup is auto-flagged staff. Then open `https://<your-domain>/admin`
   while signed in — the CMS shares your Supabase login (no separate Payload account),
   provisions your CMS user, and triggers the demo-content seed (with a progress bar)
   before landing in the admin, so the CMS is populated out of the box; edit or replace
   that content for real prod. Grant more editors from **`/admin` → Users → Create
   New** — they receive a Supabase invite email and set a password on `/accept-invite`
   (needs `SUPABASE_SERVICE_ROLE_KEY` set in Vercel; inviting an email that already has
   an account just promotes it to staff, without sending an email).

> If the Payload admin fails to build/run under Next 16's default Turbopack, build
> the web app with Webpack (`next build --webpack`).

### Web (Vercel) — manual alternative

Prefer to wire env yourself instead of using the integration above? Import the repo, set
the root directory to `apps/nextjs`, and add the Supabase env vars
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
plus any `STRIPE_*` / `AI_GATEWAY_API_KEY` (the AI Gateway credential is injected
automatically on Vercel). Add a Stripe webhook endpoint pointing at the deployed
`billing-stripe-webhook` function and copy its signing secret into Supabase secrets.

### Mobile (EAS)

Before your first store submission you need two developer accounts:

- an **Apple Developer Program** membership, for the App Store and TestFlight;
- a **Google Play Console** developer account, for Google Play.

To publish under a company name rather than your own, both ask for the company's
**D-U-N-S number**, and the company's legal name has to match on every form. The
account holder verifies their identity with Apple and Google and pays the fees to
them directly. If your app sells paid content, read
[App Store and Google Play payment rules](./docs/STRIPE.md#app-store-and-google-play-payment-rules)
before you submit.

```bash
eas build --profile development   # dev client (push, debugging)
eas build --profile preview       # internal distribution / simulator
eas build --profile production    # store builds (auto-increments versions)
eas submit --profile production
```

Profiles are in [`apps/expo/eas.json`](./apps/expo/eas.json) (pinned to Node 22.23.4 /
pnpm 10.19.0). Set `EXPO_PUBLIC_*` values as EAS env/secrets.

## Billing setup (Stripe)

1. Create one **Pro** product with two recurring prices — **$9.99/mo** and **$99/yr** —
   and put their IDs in `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY`. Amounts assume
   USD; to bill in another currency create the prices in that currency (Stripe price
   IDs are immutable, so set the amount/interval correctly the first time). The display
   strings live in `packages/config` (`PLANS`).
2. Local webhook: `stripe listen --forward-to localhost:54321/functions/v1/billing-stripe-webhook`
   and copy the `whsec_…` into `STRIPE_WEBHOOK_SECRET`.
3. The webhook is signature-verified and idempotent; it syncs the catalog +
   subscription state into Supabase. Mobile reads `subscriptions` (RLS read-own).

## Dependencies

Versions are pinned in the pnpm **catalog** (`pnpm-workspace.yaml`) so web and
mobile never drift. The notable direct dependencies and why they're here:

**Monorepo & tooling**

- **turbo** (Turborepo) — runs and caches tasks (build/lint/test) across the workspace.
- **pnpm** — the package manager; its catalog is the single source of truth for versions.
- **typescript** — the language; `strict` everywhere.
- **eslint** + **typescript-eslint** (+ React / a11y / import / turbo plugins) — linting.
- **prettier** (+ import-sort & tailwind plugins) — formatting.
- **dotenv-cli** — loads `.env` for scripts and tests.

**Web app (`apps/nextjs`)**

- **next** — the React web framework (App Router; `^16` for Payload v3).
- **react** / **react-dom** — the UI runtime.
- **@supabase/ssr** — Supabase auth/session in Next server code + middleware (cookie-based).
- **@supabase/supabase-js** — the Supabase client (DB, Auth, Storage).
- **@tanstack/react-query** — data fetching, caching, and mutations for the shared hooks.
- **@t3-oss/env-nextjs** — validated, typed environment variables at build/runtime.
- **react-hook-form** + **@hookform/resolvers** — forms, bound to zod validators.
- **zod** — schema validation (env, form input, API payloads).
- **radix-ui** — accessible UI primitives that shadcn/ui builds on.
- **class-variance-authority**, **tailwind-merge** — component variants + class merging.
- **lucide-react**, **@tabler/icons-react** — icon sets used by the UI.
- **sonner** — toast notifications. **vaul** — the paywall drawer. **next-themes** — dark/light mode.
- **tw-animate-css** — Tailwind animation utilities. **jiti** — runtime TS for config loading.

**Mobile app (`apps/expo`)**

- **expo** + **expo-router** — the mobile framework and file-based routing.
- **react-native** — the mobile runtime.
- **nativewind** + **react-native-css** — Tailwind-style styling on native.
- **@react-native-async-storage/async-storage** — persists the auth session.
- **expo-secure-store** — secure key/value storage.
- **expo-web-browser** + **expo-linking** — the OAuth deep-link flow.
- **expo-notifications** + **expo-device** — push registration + device checks.
- **expo-constants**, **expo-status-bar**, **expo-system-ui**, **expo-splash-screen**, **expo-dev-client** — Expo essentials.
- **react-native-gesture-handler**, **react-native-reanimated**, **react-native-screens**, **react-native-safe-area-context**, **react-native-worklets** — navigation + animation deps.
- **@legendapp/list** — a performant list component. **react-native-url-polyfill** — `URL` polyfill needed by supabase-js.

**Backend, payments & AI**

- **@supabase/supabase-js** — also used by edge functions and the RLS tests.
- **stripe** — the Stripe server SDK (Checkout, customer portal, webhook).
- **ai** — the Vercel AI SDK; sends model calls through the AI Gateway.

**Content (Payload CMS — web/server only)**

- **payload** — the headless CMS (admin UI, collections, access-control, REST/Local API).
- **@payloadcms/next** — mounts Payload's admin + REST inside the Next.js app.
- **@payloadcms/db-postgres** — the Postgres adapter (targets the dedicated `cms` schema).
- **@payloadcms/storage-s3** — stores uploads in the Supabase Storage `cms-media` bucket.
- **@payloadcms/richtext-lexical**, **@payloadcms/plugin-seo** — rich-text editor + SEO fields.
- **sharp** — image processing for uploads (pulls a transitive **LGPL** `sharp-libvips`,
  which `license:check` allows as weak copyleft).

**Shared internal packages** (`@acme/*`) — `api` (data layer), `app` (validators/hooks/logic),
`cms` (generated Payload content types), `ui` (tokens/theme), `config` (env schema + constants).
Not published; imported by the apps.

**Testing & quality**

- **vitest** — unit/integration tests. **@playwright/test** — web end-to-end tests.
- **@tailwindcss/postcss**, **postcss**, **tailwindcss** — the styling build.

Run `pnpm licenses list --prod` for the full resolved tree and license of every
transitive package.

## Contributing

Contributions are welcome. The repo is a Turborepo monorepo; work happens on a
branch and lands via pull request.

**Before you open a PR**, run the gates on **Node 22** (`nvm use`) and make sure
they're green:

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test     # always
pnpm -F @acme/nextjs build                   # if you touched the web app
pnpm license:check                           # if you added/updated dependencies
pnpm test:rls                                # if you changed schema or RLS  (needs supabase start)
```

Also, when relevant:

- **Env vars:** update **both** `.env.example` and the zod schema in `packages/config`.
- **Database:** add a **new** migration (never edit a shipped one), reseed, and
  run `pnpm db:gen-types`. Add an FK index for any column used in an RLS policy.
- **Features:** follow the recipe in [`CLAUDE.md`](./CLAUDE.md) and keep cross-platform
  logic in `packages/`.
- **Docs:** update the README / `docs/ARCHITECTURE.md` / `docs/ERD.md` if behavior or structure changed.

**Opening the pull request**

1. Branch off `main`: `git checkout -b feat/<short-name>` (or `fix/…`, `docs/…`).
2. Commit using [Conventional Commits](https://www.conventionalcommits.org/) (e.g.
   `feat(reminders): add weekly cadence`).
3. Push and open the PR (`gh pr create` or the GitHub UI). In the description, cover
   **what** changed and **why**, how you tested it, screenshots for UI changes, and
   `Closes #<issue>` to link an issue.
4. Make sure CI is green — every PR runs lint, format, typecheck, unit, license, and
   the Supabase integration job (`test:rls` + Playwright).

## Reporting issues

Use **GitHub Issues** for bugs and feature requests:

1. **Search first** — someone may have already reported it.
2. **Open a new issue** and include: what you expected vs. what happened, exact
   **steps to reproduce**, your environment (OS, `node -v`, `pnpm -v`, web or mobile,
   local or deployed), and any relevant logs/screenshots. Note whether it's web,
   mobile, or backend.

**Security vulnerabilities:** please do **not** open a public issue. Use GitHub's
**private vulnerability reporting** (the repo's _Security → Report a vulnerability_
tab) or email the maintainers, and allow time for a fix before public disclosure.

## License

**Apache License 2.0** — see [`LICENSE`](./LICENSE). Copyright © 2026 VPV Group, LLC.

This repository incorporates third-party open-source software; required attributions
(the **MIT** create-t3-turbo base with its pinned upstream commit SHA, and the
**Apache-2.0** Vercel AI SDK) are in [`NOTICE`](./NOTICE). `pnpm license:check` runs in
CI and fails on strong copyleft (GPL/AGPL/SSPL); it allows permissive licenses plus
weak, file-level copyleft (LGPL/MPL) that is safe to depend on.
