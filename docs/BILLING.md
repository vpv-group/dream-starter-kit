# BILLING.md — billing core and payment providers

Billing is split in two, so the kit can sell on the web today and inside the iOS
and Android apps later without changing anything that reads "is this person
premium?":

- **`billing`** (`modules/billing`, the core) — provider‑neutral. It owns the plan
  catalog, the purchase ledger, entitlements, billing tags, the CMS subscriptions
  list, `/pricing`, `/billing`, `/checkout` and the paywall — including
  **workspace (company) plans** and the **staff support view** (§10).
- **Payment providers** — adapter modules that plug into billing
  (`adapter: { for: "billing" }`). **`billing-adapter-stripe`** ships preinstalled
  (web checkout; setup in [`docs/STRIPE.md`](STRIPE.md)). An in‑app purchase
  provider such as RevenueCat plugs in the same way (§7).

Billing never imports its providers; it finds them through the module adapter
registry (`getModAdapters("billing")` on the server, `useModAdapters("billing")` in
the browser — docs/MODULES.md → Adapters). Providers write billing state only
through billing's core services. Remove the Stripe adapter and `/pricing`,
`/billing` and premium gating keep working; checkout says purchases aren't
available.

---

## 1. Why a core + adapters (and not a "Stripe module")

- **One user, several stores.** Someone may subscribe on the web and buy again on
  their iPhone. Entitlements must come from one ledger with a `provider` column, not
  from each provider's own tables.
- **Nothing that reads entitlements changes** when a provider is added or removed:
  `usePremium` (web + native), the server `getViewerEntitlement`, Payload's
  `premiumFieldAccess`, the paywall and the pricing page.
- **Removable.** An app that sells only in‑app removes the Stripe adapter — and the
  `stripe` / `@stripe/*` packages go with it.
- **It extends a pattern the kit already had** (`chat` + `chat-adapter-slack`): an
  adapter `requires` its target and adds a settings tab. Billing additionally needs to
  call _out_ to its providers (checkout, portal, catalog sync), which is what the
  adapter registry adds.

---

## 2. The data model (public schema, RLS)

| Table / view                     | What it holds                                                                                                                                                                                                                                 | Who reads it                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `mod_billing_subscriptions`      | Every purchase: subscriptions **and** one‑time (lifetime) purchases. `provider`, `kind`, `plan_id`, `entitlement`, `store`, `environment`, status, period end; `org_id` when a workspace owns it, `granted_by`/`note` for staff grants (§10). | Read‑own + your workspaces'                |
| `mod_billing_entitlements`       | View: the active (`active`/`trialing`) rows, `security_invoker` so the caller's RLS applies. Staff grants past their end date drop out.                                                                                                       | Read‑own + your workspaces' (`usePremium`) |
| `mod_billing_org_customer_links` | One customer id per (workspace, provider), so a company is billed as itself.                                                                                                                                                                  | Workspace owners/admins                    |
| `mod_billing_customer_links`     | One customer id per (user, provider), plus a billing email that differs from the login.                                                                                                                                                       | Read‑own                                   |
| `mod_billing_products/prices`    | The provider catalog as the provider reports it (`provider` on each row).                                                                                                                                                                     | Everyone (pricing)                         |
| `mod_billing_webhook_events`     | Claimed provider events (idempotency), per provider; purged after 30 days.                                                                                                                                                                    | Server only                                |
| `mod_billing_managed_tags`       | Which `public.tags` billing keeps in sync (§4).                                                                                                                                                                                               | Server only                                |
| `mod_billing_customers`          | Billing 1.x's Stripe‑only customer map. Still written for Stripe; dropped in a later contract release.                                                                                                                                        | Read‑own                                   |

Only the service role writes, through billing's core services (the SQL functions
refuse signed‑in and anonymous callers). Ids are the provider's own and must be unique
across providers (Stripe's `sub_…`/`cs_…` are; other providers prefix theirs, e.g.
`rc:…`). Writes carry the provider's event time, so an older event can never roll a
purchase back.

**Entitlement** is `premium` unless the plan says otherwise (Plans →
**entitlement**: members/premium). Premium content checks the view for an active
`premium` row — whatever sold it.

---

## 3. Catalog

Plans and coupons are authored in Payload (**Commerce → Billing Plans / Coupons**).
Saving one runs billing's catalog hook, which hands it to every installed provider
that syncs a catalog (`syncPlan` / `syncCoupon`): Stripe creates the product and
price. Each provider adds its own **tab** to the plan/coupon (`defineAdapterCollectionTab`)
for its ids — Stripe's tab shows the Stripe product/price/coupon ids. The tabs are
unnamed, so their columns don't move when a provider is added or removed. A per‑doc
**skipSync** opts out; failures land on **Sync status / Sync error** instead of
failing the save.

Store products (App Store / Play) are created in the stores' consoles, not pushed
from the kit; an in‑app provider maps them to plans in its tab instead (§7).

---

## 4. Billing tags

Billing keeps tags on every member in step with their purchases, using the kit's
existing user tags (`public.tags` / `user_tags`: shown on `/profile` and the admin
Users page, and usable as **notification audiences**).

| Group         | Values                                                              | Default name             |
| ------------- | ------------------------------------------------------------------- | ------------------------ |
| Plan          | The active plan(s), from the provider's product name                | `{plan}`                 |
| Status        | Free, Trialing, Active, Canceling, Past due, Churned                | `{status}`               |
| Billing cycle | Monthly, Annual, Quarterly, Weekly, Daily, Lifetime, Every N months | `Billing cycle: {cycle}` |
| Store         | Web, App Store, Play Store, Promotional                             | `Store: {store}`         |

- **Free** = never paid; **Churned** = paid before, nothing active now; **Canceling**
  = active but set to end at period end; **Past due** = a payment failed. A paid plan
  beats a trial, and a renewing one beats one that's canceling.
- Plan and status names are bare, so they match the tags billing 1.x wrote (plan names
  and "Free") and existing notification audiences keep working. The cycle and store
  groups are prefixed because the seeded plans are called Monthly / Annual / Lifetime.
- **Only billing's own tags change.** `mod_billing_managed_tags` records which tags
  billing created (or adopted from 1.x); reconciling never touches staff tags. A staff
  tag that happens to share a billing tag's name is left alone and logged.
- **When:** after every purchase change a provider records, when an account is created
  or merged, by a daily sweep (`GET /api/mod/billing/cron/tags`, for trials and periods
  that run out without a webhook), and on demand.
- **Settings:** Modules → Billing → **Tags** — switch groups on/off, rename them
  (`{plan}`/`{status}`/`{cycle}`/`{store}` placeholders), and **re‑sync every member**.
  Renaming creates new tags and unlinks the old ones without deleting them, because
  notification audiences store tag names — update those audiences.

Code: `modules/billing/src/server/core/tags.ts` (pure rules + the reconcile).

---

## 5. Contracts a payment provider implements

All types live in billing: server ones in `@acme/mod-billing/server`, web ones in
`@acme/mod-billing` (client‑safe).

### 5.1 Server — `BillingProvider` (`./server` export `adapter`)

```ts
interface BillingProvider {
  id: string; // stored as `provider` on ledger rows, e.g. "stripe"
  label: string;
  platforms: ("web" | "ios" | "android")[];
  isConfigured(): Promise<boolean>;
  createCheckout?(i: { plan; user; orgId?; origin }): Promise<{ url: string }>; // hosted checkout
  // subject = { userId } (personal) or { orgId } (a workspace, §10)
  createPortalSession?(i: { subject; origin }): Promise<{ url } | null>;
  listInvoices?(i: { subject }): Promise<BillingInvoice[]>;
  customerLink?(i: { subject }): Promise<{ customerId; dashboardUrl } | null>; // staff view
  syncPlan?(args): Promise<unknown>; // Payload afterChange args
  syncCoupon?(args): Promise<unknown>;
  onAccountDelete?(i: { userId }): Promise<void>; // cancel before deletion
  status?(): Promise<ProviderStatus>;
  legacyRoutes?: ModPublicRouteTable; // billing 1.x paths billing still forwards
}
```

Billing's routes dispatch to providers: `POST /api/mod/billing/checkout`
`{planId, provider?}` uses the first configured **web** provider (or the one asked
for); `/portal` uses the provider the user pays through; `/invoices` merges every
provider's. A provider serves its own webhook and provider‑specific routes under its
own path (`/api/mod/<adapter-slug>/…`).

### 5.2 Core services a provider calls (`@acme/mod-billing/server`)

| Service                                                           | Use                                                                        |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `claimWebhookEvent` / `finishWebhookEvent`                        | Idempotency: claim before side effects, then done or released              |
| `recordSubscription` (`applySubscription` + tags)                 | Write a purchase (`NormalizedSubscription`) with the provider's event time |
| `linkCustomer`, `findCustomerUser`, `findUserCustomer`            | The (user, provider) → customer id link                                    |
| `linkOrgCustomer`, `findCustomerSubject`, `findSubjectCustomer`   | The same for workspaces; resolve a customer id to a user **or** workspace  |
| `isWorkspaceAdmin`, `workspaceOwnerId`                            | May this session buy for a workspace; who the purchase is attributed to    |
| `setBillingEmail`                                                 | Keep a differing checkout email                                            |
| `upsertProduct`, `upsertPrice`                                    | Mirror the provider's catalog                                              |
| `resolveOrInviteGuest`, `convertOrMergeAnon`                      | Guest buyers and anonymous accounts                                        |
| `projectSubscriptionToCms`                                        | The read‑only CMS subscriptions list (only for the newest event)           |
| `syncBillingTags`, `siteUrl`, `createAdminClient`, `BillingError` | Tags, origins, the service‑role client, status‑coded errors                |

### 5.3 Web — `BillingWebProvider` (`./web` export named in `adapter.web`)

```ts
interface BillingWebProvider {
  id: string;
  label: string;
  PaymentForm: ComponentType<PaymentFormProps>; // variant "paywall" | "checkout"
  completeGuestPurchase?(i): Promise<{ loginToken?: string }>; // guest paid with no session
  switchPlan?(i): Promise<void>; // 1-click upgrade after a purchase
  preconnect?: string[];
  prefetch?(): void;
}
```

Billing's paywall modal and `/checkout` (§5.6) are provider‑neutral: they render
the installed provider's `PaymentForm` (Stripe's mounts Elements lazily, so its SDK
isn't in every page's bundle), handle account conversion and the success/upsell
screens, and call `completeGuestPurchase` / `switchPlan`.

### 5.4 Native

The Expo registry exposes `adapter.native` the same way (`modClientAdapters`, read
with `useModAdapters("billing")`). No native provider ships yet; it's where an in‑app
purchase provider's `purchase(plan)` goes (§7).

### 5.5 Host services (what the app calls)

Billing exposes `services` (manifest `server.services`) that the host reaches through
the generated `modServices.billing` (`apps/nextjs/src/lib/mod/billing.ts`):
`getViewerEntitlement`, `onAccountDelete`, `onUserMerge`, `onUserCreated`,
`hasBillingRecord`, `getPremiumPlan`. Without billing installed they're absent and
the host degrades (nobody is premium, nothing to cancel, no tags).

### 5.6 Paywall and checkout (billing's own UI)

The paywall and the two-step checkout are billing's, provider-neutral, and render
the installed provider's `PaymentForm` (§5.3):

- **Paywall** (`src/web/paywall/`): `PaywallProvider`, `PremiumGate` (blurred
  body + dock), the modal, wallet button and copy (`src/paywall-copy.ts`). The host
  shows it through the **`premium-content` slot** — `post-detail.tsx` renders
  `<ModSlot name="premium-content" initialPlan={…} fallback={body}>`, with the plan
  from the `getPremiumPlan` service. Without billing the slot renders the teaser;
  Payload's `premiumFieldAccess` has withheld the premium body server-side either
  way.
- **Checkout** (`/checkout`, `/checkout/return`, rsc pages in `src/web-server/`):
  plan summary, testimonial (billing settings → featured review), and the account
  step, which embeds the host's sign-in flow through the **`auth-flow` host
  component** (a "Sign in to continue" link when the host has none). The pages read
  the viewer's session, auth settings and app name through **host services**
  (docs/MODULES.md).
- Captcha: the paywall mints anonymous sessions with the Turnstile token from
  `useCaptcha()` (`@acme/app`), which the host's `CaptchaProvider` fills.

---

## 6. Writing a payment provider adapter

1. `pnpm mod create billing-adapter-<x>`, then trim it to what a provider needs (most
   have no tables, screens or nav of their own).
2. Manifest:

   ```ts
   requires: ["billing"],
   adapter: { for: "billing", server: true, web: "webProvider" /* and/or native */ },
   server: { publicRoutes: true },     // your webhook
   cms: { settingsTabFor: "billing", hasCollectionTabs: true },
   admin: { settingsComponent: true }, // optional status panel on Modules → Billing
   ```

3. `./server`: `import "server-only"`; export `adapter` (§5.1) and `publicRoutes`
   with a signature‑verified `POST /webhook` that maps events to
   `NormalizedSubscription` and calls `claimWebhookEvent` → `recordSubscription` →
   `finishWebhookEvent`.
4. `./payload`: `settings` via `defineAdapterSettings({ target: "billing", key: "<x>", … })`
   (a short `key` keeps Postgres names under 63 characters; adapter tabs are
   staff‑only), and `collectionTabs` via `defineAdapterCollectionTab` for your ids on
   Plans/Coupons.
5. Secrets: env vars (golden rule #3), or a "Connect with …" connection through the
   connector broker (`getConnectorBroker()`), like Stripe's.
6. `pnpm mod sync`, `pnpm mod payload-migrate`, tests (`modules/billing-adapter-stripe/tests`
   is the reference).

---

## 7. Design note — in‑app purchases with RevenueCat (future)

Not built yet. This is how it fits; golden rule #4 (web‑only Stripe, no in‑app
purchase) stays until the team decides to ship it.

- **Module:** `billing-adapter-revenuecat` — `adapter: { for: "billing", server: true,
native: "nativeProvider" }`, `platforms: { web: false, native: true }`.
- **Identity:** configure the RevenueCat SDK with `appUserID` = the Supabase user id,
  so webhooks name the account directly (anonymous users get one too —
  anonymous‑account‑first identity).
- **Webhook:** `POST /api/mod/billing-adapter-revenuecat/webhook`, verified with the
  RevenueCat webhook authorization header (env secret). Map events to
  `NormalizedSubscription`: `provider: "revenuecat"`, `id: "rc:<original_transaction_id>"`,
  `store: "app_store" | "play_store" | "promotional"`, `environment: "sandbox" |
"live"`, `kind` from the product type, status from the event (`INITIAL_PURCHASE` /
  `RENEWAL` → active, `BILLING_ISSUE` → past_due, `CANCELLATION` → active with
  `cancelAtPeriodEnd`, `EXPIRATION` → canceled), the event timestamp as `eventAt`.
  Billing tags then show `Store: App Store` etc. automatically.
- **Plans:** a "RevenueCat" collection tab on Plans with the store product ids / the
  RevenueCat entitlement id, so a store purchase maps to a Payload plan (`planId`,
  `entitlement`). Products are created in App Store Connect / Play Console; no catalog
  push.
- **Native purchase:** `nativeProvider.purchase(plan)` (react‑native‑purchases) behind
  `useModAdapters("billing")` in billing's native pricing screen; restore purchases
  from the billing screen. Web checkout keeps using Stripe; a user may hold both.
- **Policy:** with in‑app purchases the native apps may sell digital content, which is
  what Apple guideline 3.1 / Google Play's payments policy expect. Update golden rule
  #4 and the store rules below when this ships.

---

## 8. App Store and Google Play payment rules

Today the kit sells on the **web** with Stripe, and the iPhone and Android apps unlock
paid content by reading what was bought there. They never take a payment (no In‑App
Purchase, no Play Billing). That keeps one billing system, but it can affect store
review:

- Apple's App Review Guidelines (section 3.1) generally require **In‑App Purchase**
  for digital content or features unlocked inside an iOS app. The rules for linking
  out to a web checkout differ by country and change over time.
- Google Play has a similar payments policy for digital goods.

If your mobile app unlocks paid content, read the current Apple and Google guidelines
for the countries you publish in before you submit. An in‑app purchase provider (§7)
is the way to sell inside the apps; adding one is a team decision.

---

## 9. Upgrading from billing 1.x

Billing 2.0 needs kit ≥ 2.6. Everything moves over by itself:

- The 2.0 migration adds the provider columns, the customer links (backfilled from
  `mod_billing_customers`), the entitlements view and the managed‑tags table, and
  adopts existing "Free" and plan‑name tags. It's expand‑only.
- **billing-adapter-stripe 1.2:** a one‑time plan bought **on‑site** (the
  Payment Element) is recorded from `payment_intent.succeeded`. Before 1.2 only
  hosted Checkout recorded one‑time purchases, so on‑site Lifetime buyers paid but
  weren't entitled. The PaymentIntent carries `purchase: one_time_on_site`, so
  subscription invoices and hosted Checkout payments aren't recorded twice. With
  your own Stripe keys, the hourly check adds the event to the endpoint; through
  Meet Dream, meetdream.com's Connect endpoint must subscribe to it.
- Stripe moves into `billing-adapter-stripe`. Its webhook path changes; billing
  forwards the old path for one release, and the adapter's hourly check registers the
  new endpoint and disables the old one (docs/STRIPE.md §5.3).
- Plans/Coupons gain tabs; the Stripe ids move to the **Stripe** tab (same columns).
- Your env keys keep working (they take priority over a Meet Dream connection).
- If a kit update brings billing 2.0 without the Stripe adapter (e.g. you removed it
  before), checkout answers "Billing not configured" until you
  `pnpm mod add billing-adapter-stripe`. Modules → Billing says so to staff: a
  **No payment provider installed** notice (or **No payment provider is
  connected yet** while one isn't set up), from
  `GET /api/mod/billing/admin/providers`.

---

## 10. Workspace billing and staff support

**A workspace (company) can own a plan.** A purchase row with `org_id` set belongs
to that workspace: RLS lets every member read it, so `usePremium` and premium gating
work for the whole team, not just the buyer. Someone who leaves the workspace loses
it. Billing tags are computed from a person's own purchases **and** those of every
workspace they're in.

- **Buying for a workspace.** Owners and admins pick the workspace in the
  **Billing account for** switcher on `/billing`; its **Upgrade** goes to
  `/pricing?workspace=<id>` → `/checkout?plan=…&workspace=<id>`. The checkout page
  checks the role (`getWorkspaceContext`), `POST /checkout` and the Stripe
  `express-intent` route check it again (`is_org_admin`). Stripe bills a customer
  created for the workspace (its name, `metadata.org_id`), linked in
  `mod_billing_org_customer_links`; subscriptions carry `metadata.org_id`, so the
  webhook writes `org_id` and attributes the row to the buyer (or the workspace
  owner).
- **Managing it.** `POST /portal {orgId}` and `GET /invoices?org=<id>` work for the
  workspace's owners/admins. Plain members see the plan but not the billing.
- Per‑seat quantity and `plans.billingUnit` aren't built yet (docs/WORKSPACES.md →
  What's next).

**Staff support view.** Staff (`profiles.is_staff`) get **Find an account… (staff)**
in the same switcher: search any person (email, name) or workspace (name, slug) and
open its billing at `/billing?account=user:<id>` / `org:<id>`. It follows the header's
**staff workspace view** (docs/WORKSPACES.md): with the header scoped to a
company, `/billing` opens that company, and opening a company here scopes the
header to it. It never changes the
staff member's own active workspace, and it's **read‑only** for money:

| Staff can                                                                   | Staff can't (do it in the provider's dashboard — linked from the view) |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| See the current plan, every purchase and grant, invoices, provider customer | Change, cancel or refund a paid subscription                           |
| **Grant** a plan at no charge, optionally until a date, with a note         | Charge the customer                                                    |
| **Extend** or **revoke** a grant                                            |                                                                        |

A grant is an ordinary ledger row (`provider = 'manual'`, `store = 'promotional'`,
id `manual:<uuid>`, `granted_by`, `note`), so entitlements, tags and the CMS list
treat it like any purchase; the member sees it as **Complimentary until …**. It
stops counting at its end date (the entitlements view checks it), and the daily
`/cron/tags` sweep marks it canceled and updates tags.

The staff routes (`/api/mod/billing/admin/search|account|grant|revoke`) check
`is_staff` on every call, read through the service role (staff aren't members of
the accounts they support) and write every view and change to the audit log
(`billing.support_view`, `billing.grant_added|grant_changed|grant_revoked`).
