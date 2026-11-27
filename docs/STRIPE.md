# STRIPE.md — taking payments with Stripe

Stripe is billing's **web payment provider**, shipped as the preinstalled
`billing-adapter-stripe` module. This guide turns it on. It's written so a
**non‑technical founder** can follow it top to bottom, with a precise reference
(exact key permissions, exact env vars) for engineers further down.

How billing itself works — plans, the purchase ledger, entitlements, billing tags,
payment providers and the App Store / Google Play rules — is in
[`docs/BILLING.md`](BILLING.md). If anything here conflicts with
`docs/ARCHITECTURE.md`/`docs/ERD.md`, those win.

---

## 1. What Stripe does here

The kit is **plan‑driven from the CMS**, not from the Stripe dashboard:

- You **author plans and coupons in Payload** (`/admin` → **Commerce → Billing
  Plans / Coupons**). Saving one pushes it to Stripe: a **Product + Price** for a
  plan, a **Coupon** (+ promotion code) for a coupon. **You never create products
  or prices in the Stripe dashboard by hand.** Stripe prices are immutable, so
  changing an amount creates a new price and archives the old one. Each plan's
  **Stripe** tab shows the ids.
- Buyers pay **on your site** — the paywall on premium content and the two‑step
  `/checkout` page, with card, Link, Apple Pay and Google Pay (Stripe Elements) — or,
  if you prefer, on **Stripe's hosted Checkout page** (a setting, §4). Guests can pay
  first; their account is created from the payment email.
- Self‑serve changes and cancellations happen in the **Stripe Customer Portal**
  (linked from `/billing`), and past invoices list on `/billing`.
- Stripe reports purchases, renewals and cancellations through **one webhook** that
  the app registers itself (§5). It writes billing's ledger — the source of truth the
  web and mobile apps read — and keeps each member's billing tags in step.

The whole job is:

1. **Connect Stripe** (§2) — one click, or paste your own keys.
2. **Seed the CMS and save a plan** so it pushes to Stripe (§6).

Work in **test mode** first (no real money). Go live at the end.

---

## 2. Connect Stripe

Open `/admin` → **Modules → Billing**. Below the settings tabs is the **Stripe**
panel: connection, webhook and catalog. There are two ways to connect; your own keys
win if both are present.

### 2.1 Connect with Stripe (the default — no keys to copy)

Click **Connect with Stripe** (or **Connect in test mode** while you set up). Stripe
walks you through setting up the account your payments go to (Stripe‑hosted
onboarding), then you come back to the panel showing **Connected**, the account name
and test/live mode. If Stripe still needs details, the panel says **Onboarding** with a
**Finish Stripe onboarding** button; checkout stays off until it's done.

How it works — the model Stripe recommends for platforms (Stripe Connect):

- **Meet Dream is a Stripe Connect platform**, and your business is one of its
  connected accounts, with the full Stripe Dashboard. Payments are **direct
  charges**: they land in your account, and Stripe's fees and disputes are yours as
  for any Stripe account.
- **Your site holds no Stripe secret.** When it needs Stripe (catalog sync,
  checkout, the customer portal, invoices), it sends the request to meetdream.com,
  signed with the site's free license key. Meet Dream makes the call with its
  platform key on **your** account only, and passes Stripe's answer back unchanged.
- **Stripe's events reach your site through Meet Dream.** Stripe sends them to
  Meet Dream's platform endpoint, which delivers them to your site's webhook signed
  with a secret only your site knows (§5.1).
- On‑site checkout loads Stripe.js with Meet Dream's publishable key and your
  account id, served at runtime, so connecting needs no redeploy.

Things to know:

- **Connecting creates a new Stripe account** for the business (Stripe can reuse
  details you've already given it). To use a Stripe account you **already have**,
  use your own keys instead (§2.2).
- **meetdream.com must be reachable** for checkout and the customer portal. If it
  isn't, those pause, and events are delivered once it's back. Sites that can't
  accept that dependency use their own keys.
- Needs the site's free Meet Dream license, which it registers after the first setup
  on a public domain (`/cms-setup`). With `DREAM_TELEMETRY=off` there's no license,
  so use your own keys (§2.2).
- **Disconnect** in the panel stops Meet Dream acting for the site. The Stripe
  account stays yours, with its Dashboard.

### 2.2 Your own API keys (self‑hosting, CI, `stripe listen`)

Set these in the env. They take priority over a Meet Dream connection.

| Variable                             | Secrecy        | What it is                                                                                                                                                                                                          |
| ------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`                  | 🔒 server‑only | Your API key (`sk_test_…` / `rk_test_…` / `sk_live_…`). Lets the kit create products, prices, payments, portal sessions.                                                                                            |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | public         | Client‑safe key (`pk_test_…`). Needed for **on‑site** checkout (Elements, Apple/Google Pay). Without it only the hosted Checkout page works.                                                                        |
| `STRIPE_WEBHOOK_SECRET`              | 🔒 server‑only | **Optional.** Signing secret of a webhook endpoint you manage yourself. Leave unset in production (the app registers its endpoint and keeps the secret in Vault, §5.1). Set it locally from `stripe listen` (§5.2). |

> The kit fails loudly if a required var is missing. Optional vars must be **absent**,
> never `""` (`pnpm dev:setup` comments unset ones out).

**Where env lives:** locally, `.env` at the repo root (restart `pnpm dev:next` after
editing). In production (Vercel): Project → **Settings → Environment Variables**, then
redeploy. Billing runs entirely in the Next.js app (no edge functions).

#### Which key permissions?

**Option A — standard secret key** (`sk_…`, full access): simplest; fine to start.

**Option B — restricted key** (`rk_…`, recommended for production). Set everything
not listed to **None**:

| Stripe resource       | Permission | Why the kit needs it                                                                  |
| --------------------- | ---------- | ------------------------------------------------------------------------------------- |
| **Products**          | **Write**  | Create/update a product when you save a plan                                          |
| **Prices**            | **Write**  | Create new prices / archive old ones (prices are immutable)                           |
| **Coupons**           | **Write**  | Intro‑offer and marketing coupons                                                     |
| **Promotion codes**   | **Write**  | Customer‑facing promo codes (e.g. `LAUNCH20`)                                         |
| **Customers**         | **Write**  | Find or create the Stripe customer at checkout                                        |
| **Checkout Sessions** | **Write**  | Hosted Checkout; read a session's line items                                          |
| **Customer portal**   | **Write**  | Open the self‑serve portal from `/billing`                                            |
| **Subscriptions**     | **Write**  | On‑site checkout (`/express-intent`), 1‑click annual switch, cancel on account delete |
| **PaymentIntents**    | **Write**  | On‑site card + wallet payments                                                        |
| **SetupIntents**      | **Write**  | Collect a payment method for trial / $0‑today subscriptions                           |
| **Charges**           | **Read**   | Capture the buyer's wallet identity from the first charge (webhook)                   |
| **Invoices**          | **Read**   | List past invoices on `/billing`                                                      |
| **Webhook Endpoints** | **Write**  | Register the webhook endpoint (§5.1) and disable old ones (§5.3)                      |

Verifying incoming webhooks needs no key permission — only the signing secret.

To create a key: Stripe Dashboard (Test mode on) → **Developers → API keys** → reveal
the standard secret key, or **Create restricted key** with the table above. Treat it
like a password: server‑only (golden rule #2), never in client code or `NEXT_PUBLIC_*`.

**Rotating:** create the new key (or **Roll** the old one), update every env it's in,
redeploy, verify, then revoke the old key.

---

## 3. The Stripe panel (Modules → Billing)

- **Connection** — Not connected / **Connected** (via Meet Dream) / **Own API keys**,
  the account and test/live mode; **Connect with Stripe**, **Test connection**,
  **Disconnect**.
- **Webhook** — the endpoint URL, whether it's registered, where its signing secret is
  (Vault or `STRIPE_WEBHOOK_SECRET`), the last event received; **Register now**
  instead of waiting for the hourly check.
- **Catalog** — how many plans/coupons are synced, failed or not yet synced;
  **Sync everything now** (useful right after connecting).

All of it goes through admin‑only routes (`/api/mod/billing-adapter-stripe/admin/*`);
no secret reaches the browser.

---

## 4. Stripe settings (Modules → Billing → Stripe tab)

| Setting                             | Default | What it does                                                                                               |
| ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| Take payments with Stripe           | on      | Off: new checkouts and catalog sync stop. The webhook keeps recording changes to existing subscriptions.   |
| Send buyers to Stripe's hosted page | off     | Off: buyers pay on the site (paywall + `/checkout`). On: they're redirected to Stripe Checkout.            |
| Offer Apple Pay / Google Pay        | on      | On‑site checkout. Apple Pay also needs your domain verified in Stripe (Settings → Payment method domains). |
| Promotion code box                  | on      | Hosted Checkout. Hidden when a plan's intro offer applies (Stripe allows one discount).                    |
| Stripe Tax                          | off     | Hosted Checkout: calculate tax automatically (set up Stripe Tax first).                                    |
| Always ask for a billing address    | off     | Hosted Checkout (otherwise only when needed).                                                              |
| Ask for a phone number              | off     | Hosted Checkout.                                                                                           |

The tab is staff‑only, even though billing's "Pricing page" tab is public.

---

## 5. The webhook — set up automatically

Stripe reaches the app at **one** endpoint, `POST /api/mod/billing-adapter-stripe/webhook`.
It handles `product.*`, `price.*`, `checkout.session.completed` and
`customer.subscription.*`, and writes billing's ledger only through billing's core
services (the adapter owns no tables). It is safe under retries, concurrency and
reordering:

- **Every event is claimed before anything runs** (`mod_billing_claim_event`). A
  redelivery of a handled event gets `200 {"duplicate": true}`; one arriving while the
  first is still running gets `409`, so Stripe retries later. Guest invites and tags
  therefore happen once. A failure releases the claim and answers `500`, so Stripe's
  retry applies it. A claim older than five minutes (its instance died) is taken over.
- **Subscriptions are re‑fetched.** For `customer.subscription.*` the handler applies
  what `stripe.subscriptions.retrieve()` returns now, not the payload, so delivery
  order doesn't matter. Without a credential (self‑signed test events) or if the
  retrieve fails, it falls back to the payload.
- **Older events are ignored.** Writes are stamped with the event's `created` time; an
  update older than the one already applied is skipped.
- **The account email stays the customer's email.** A different Checkout/wallet email
  is kept as the billing email on the customer link (and `billing_email` in the
  customer's metadata) instead of overwriting it.

### 5.1 Production — nothing to do

Once Stripe is connected (§2) and the site has a public `https://` URL, an hourly check
(Supabase Cron → `GET /api/mod/billing-adapter-stripe/cron/connect`, or **Register
now** in the panel) sets the webhook up and keeps its signing secret in Supabase Vault:

- **Connected with Stripe (§2.1):** the check tells Meet Dream the site's webhook URL.
  Stripe sends your account's events to Meet Dream's platform endpoint, and Meet Dream
  delivers each one to that URL, signed in Stripe's own `Stripe-Signature` format with
  a secret only your site holds, retrying until your site accepts it. Your Stripe
  account has no webhook endpoint of its own.
- **Your own keys (§2.2):** the check **registers the endpoint through the Stripe API**
  on your account. Look for an endpoint described "Dream Starter Kit — billing
  (created automatically)" under **Developers → Webhooks**.

The endpoint's `api_version` is pinned to the installed Stripe SDK's
(`Stripe.API_VERSION`), so changing your account's default API version can't change
the payloads the code parses. After an SDK upgrade, delete the endpoint; the next
hourly check recreates it on the new version.

To manage the endpoint yourself, create it at that URL with the events above and set
`STRIPE_WEBHOOK_SECRET` to its `whsec_…`; the app then leaves it alone. Either secret's
signature is accepted.

### 5.2 Local development (Stripe CLI)

```bash
stripe listen --forward-to localhost:3000/api/mod/billing-adapter-stripe/webhook
```

Put the printed `whsec_…` in `.env` as `STRIPE_WEBHOOK_SECRET` and restart
`pnpm dev:next`. (`pnpm dev:setup` writes a throwaway secret the e2e suite uses with
self‑signed events.)

### 5.3 Upgrading from billing 1.x (and older)

Billing 1.x served the webhook at `/api/mod/billing/stripe/webhook`. In 2.0 it belongs
to the Stripe adapter:

1. Deploy. Billing keeps forwarding its old path to the adapter for one release, so
   nothing is missed. The adapter's hourly check registers the new endpoint (same Vault
   secret name — nothing to copy).
2. Once the new endpoint is enabled, the same check **disables** (never deletes) this
   install's older endpoints: billing 1.x's path, and the pre‑2.5
   `…/functions/v1/billing-stripe-webhook` and `…/cms-api/stripe/webhooks`. It only
   touches enabled endpoints on this site's or this project's Supabase host; other
   apps on the same Stripe account are left alone. Each is logged and audited as
   `billing.legacy_webhook_disabled`.
3. After the new endpoint shows a successful delivery, delete the disabled ones in
   Stripe. `STRIPE_WEBHOOKS_ENDPOINT_SECRET` is deprecated and ignored.

---

## 6. Make it work — the checklist

1. **Connect Stripe** (§2), in test mode.
2. **The webhook** registers itself in production (§5.1, or **Register now**); locally
   run `stripe listen` (§5.2).
3. **Run the app** and sign up — the **first** signup becomes the founder/admin and goes
   through `/cms-setup`, which **seeds the CMS** (Example Monthly / Annual / Lifetime
   plans + a welcome coupon).
4. **Push the plans to Stripe:** **Sync everything now** in the Stripe panel, or open
   each plan in **Commerce → Billing Plans** and **Save**. Its sidebar **Sync status**
   should say synced (an error shows in **Sync error**); the **Stripe** tab shows the
   product/price ids. (Seeded plans stay `unsynced` until Stripe is connected.)
5. **Check `/pricing`** shows your plans.
6. **Test purchase:** `/pricing` → checkout → test card **`4242 4242 4242 4242`**, any
   future expiry, any CVC/ZIP. You should land back with premium unlocked, a row in
   **Commerce → Billing Plans → (plan) → Subscribers**, and the buyer tagged
   e.g. `Active`, the plan name, `Billing cycle: Monthly`, `Store: Web`.
7. **Self‑serve:** `/billing` shows the plan, a link to the Customer Portal, invoices.

### Going live

1. Finish Stripe **account verification** so live mode is enabled.
2. Connect in live mode (**Connect with Stripe**), or put your live
   `sk_live_…`/`rk_live_…` + `pk_live_…` in the production env and redeploy.
3. **Sync everything now** so the plans exist in your live account. The live webhook
   registers itself within the hour.

---

## 7. Troubleshooting

- **`Billing not configured` (503) at checkout** → Stripe isn't connected in that
  environment, or **Take payments with Stripe** is off. The Stripe panel says which.
- **Plan saves but Sync status shows an error** → the key lacks a write permission
  (§2.2 table) or you're in the other mode (test vs live). The message is in **Sync
  error**.
- **Paid in test mode but nothing unlocked** → the webhook isn't reaching you. Check
  the panel's **Webhook** card (registered? last event?) and the endpoint's delivery
  attempts in Stripe. `400 Signature verification failed` means
  `STRIPE_WEBHOOK_SECRET` doesn't match that endpoint — unset it to let the app manage
  its endpoint. No endpoint yet → the site needs a public https URL; **Register now**
  says why it skipped.
- **On‑site checkout says payments aren't set up** → no publishable key: connect with
  Stripe, or set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` with your own keys.
- **Empty "current period" dates on a CMS subscription** → the endpoint was created on
  an old API version (§5.1): delete it and **Register now**.
- **Guest invites point at the wrong site** → set `NEXT_PUBLIC_SITE_URL` to your
  production origin.
- **Never** put a secret key or signing secret in `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*`
  vars or client code (golden rules #2/#3).

---

## 8. Reference — the Meet Dream connector contract

"Connect with Stripe" is brokered by meetdream.com, like **Connect GitHub** in
/admin → Updates. Meet Dream is a **Stripe Connect platform**, the model Stripe
recommends for software platforms: connected accounts created with Accounts v2
(`merchant` configuration, full Stripe Dashboard), Stripe‑hosted onboarding through
Account Links, **direct charges**, the platform key with a `Stripe-Account` header on
every call, and one platform Connect webhook endpoint. (Stripe calls OAuth "not
recommended for new Connect platforms"; Stripe Apps are for extending the Dashboard.)

The kit side is `apps/nextjs/src/lib/mod/connectors-core.ts` (pure, tested) +
`connector-broker.ts`, exposed to modules as `getConnectorBroker()` in
`@acme/mod-kit/server`; modules never see the site license key. Every call is signed
with the `X-Dream-License-Key` header:

| Call                                                     | Answer                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /connect/stripe/start` `{ returnTo, mode }`        | `{ url }`: Stripe‑hosted onboarding (an Account Link) for the site's connected account, created on first use in test or live `mode`. Meet Dream's return URL sends the browser to `returnTo?stripe=connected` (or `?stripe_error=…`).                                                                                 |
| `POST /sites/connectors/stripe/status`                   | `{ accountId, accountName?, livemode?, publishableKey?, ready, onboardingUrl? }`. `publishableKey` is the platform's, used with `stripeAccount: accountId` in Stripe.js. `ready` is false until Stripe can take charges; then `onboardingUrl` resumes onboarding. `404 {code: "not_connected"}` when never connected. |
| `<METHOD> /sites/connectors/stripe/api/v1/<path>`        | Meet Dream checks the path against the endpoints the adapter uses, adds `Stripe-Account` (and the site's application fee, if any), passes `Idempotency-Key` through, calls Stripe, and returns Stripe's status and body unchanged.                                                                                    |
| `POST /sites/connectors/stripe/webhook-target` `{ url }` | `{ secret }`: the site's webhook URL is stored; events for its account are delivered there signed with `secret` (`Stripe-Signature: t=…,v1=…`), with retries.                                                                                                                                                         |
| `POST /sites/connectors/stripe/disconnect`               | `200` once Meet Dream stops acting for the site. The Stripe account stays the merchant's.                                                                                                                                                                                                                             |

The adapter builds its Stripe client with stripe‑node's `createFetchHttpClient`,
pointed at the forwarding endpoint (`src/stripe/client.ts`), so catalog sync,
checkout, the portal, invoices and the webhook re‑fetch run unchanged on either
source. The site never holds a Stripe secret: the platform key stays on meetdream.com.

**Fees.** The platform can add `application_fee_amount` / `application_fee_percent`
to Checkout Sessions, PaymentIntents and subscriptions while forwarding; the default
is none.

**Outages.** API calls fail while meetdream.com is unreachable (checkout and the
portal show an error and recover by themselves); webhook deliveries are retried. The
status is cached for a minute, so the panel may lag a connection change by that much.
