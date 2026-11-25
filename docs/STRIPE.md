# STRIPE.md — making Stripe billing work in the Dream Starter Kit

Everything you need to turn on payments. It's written so a **non‑technical founder**
can follow it top to bottom, with a precise reference (exact key permissions, exact
env vars) for engineers further down.

If anything here conflicts with `docs/ARCHITECTURE.md`/`docs/ERD.md`, those win.
Related reading: `CLAUDE.md` → _Payments (Payload ⇄ Stripe)_, `README.md` env table.

---

## 1. How billing works here (read this first — it saves you steps)

The kit is **plan‑driven from the CMS**, not from the Stripe dashboard:

- You **author plans and coupons in Payload** (`/admin` → **Commerce → Plans /
  Coupons**). Saving a plan automatically creates/updates the matching **Product +
  Price** in Stripe. **You never create products or prices in the Stripe dashboard
  by hand.** (Prices are immutable in Stripe, so when you change an amount the kit
  creates a new price and archives the old one for you.)
- A customer pays through a **Stripe Checkout** page (hosted by Stripe — the kit
  redirects to it). Self‑serve changes/cancellations happen in the **Stripe Customer
  Portal**, also hosted by Stripe.
- Stripe tells your app what happened through **two webhooks** (see §4). One mirrors
  products/prices/subscriptions into the database for the apps to read; the other
  mirrors subscriptions into the CMS.

So the whole job is really just three things:

1. Put your **Stripe secret key** into the env (§3).
2. Set up the **two webhooks** and put their signing secrets into the env (§4).
3. **Seed the CMS and save a plan** so it pushes to Stripe (§5).

Everything is **test mode** first (no real money). You flip to live mode at the end.

### App Store and Google Play payment rules

The kit sells on the **web** with Stripe, and the iPhone and Android apps unlock paid
content by reading what was bought there. They never take a payment themselves (no
In-App Purchase, no Play Billing). That keeps one billing system, but it can affect
store review:

- Apple's App Review Guidelines (section 3.1) generally require **In-App Purchase**
  for digital content or features unlocked inside an iOS app. The rules for linking
  out to a web checkout differ by country and change over time.
- Google Play has a similar payments policy for digital goods.

If your mobile app unlocks paid content, read the current Apple and Google guidelines
for the countries you publish in before you submit. An In-App Purchase module is not
part of the kit yet.

### What each environment variable is for

| Variable                                       | Secrecy        | What it is                                                                                                                                              | Where it's used                        |
| ---------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `STRIPE_SECRET_KEY`                            | 🔒 server‑only | Your Stripe API key (`sk_test_…` / `rk_test_…` / `sk_live_…`). Lets the kit create products, prices, checkout sessions, etc.                            | Next.js server routes + the webhook    |
| `STRIPE_WEBHOOK_SECRET`                        | 🔒 server‑only | **Optional.** Signing secret of the one webhook endpoint. Leave unset in production (the app registers the endpoint and keeps the secret in Vault); set it locally from `stripe listen`. | billing webhook route                  |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`           | public         | Client‑safe key (`pk_test_…`). **Required for the embedded paywall + two‑step `/checkout`** (Stripe Elements / Express Checkout — Apple/Google Pay + card). Only the hosted redirect‑to‑Checkout flow works without it.                     | client                      |
| `SITE_URL`                                     | server‑only    | Your site origin, used to build the guest‑checkout invite redirect. Defaults to `NEXT_PUBLIC_APP_URL`/localhost.                                        | billing webhook route                  |
| `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` | 🔒             | **Legacy / unused** by the plan‑driven flow. Leave blank.                                                                                               | —                                      |

> The kit fails loudly if a required var is missing. Optional vars must be **absent
> or blank** — never set to `""` in a way the schema rejects (the cloud session hook
> comments them out for you).

---

## 2. Before you start — what you need

- A **Stripe account** (free): <https://dashboard.stripe.com/register>. You can do
  the entire test‑mode setup before you've finished business verification.
- Make sure you are in **Test mode** while setting up: the toggle is the **"Test
  mode"** switch at the top‑right of the Stripe dashboard. Test keys start with
  `sk_test_` / `pk_test_`; live keys start with `sk_live_` / `pk_live_`.
- Know **where your env lives**:
  - **Local dev:** the `.env` file at the repo root (copy from `.env.example`).
  - **Production (Vercel):** Project → **Settings → Environment Variables**.
    That's the only place: billing runs in the Next.js app (no edge functions).

---

## 3. The Stripe **secret key** — exact permissions + step by step

### 3.1 Which permissions do you need?

You have two options.

**Option A — Standard secret key (simplest).**
Stripe's default secret key (`sk_test_…` / `sk_live_…`) has **full access**. It works
out of the box and is the recommended starting point for most founders. Skip to §3.2.

**Option B — Restricted key (most secure, recommended for production).**
A restricted key (`rk_live_…`) grants only the permissions you choose. The kit uses a
specific, small set of Stripe resources, so you can lock the key down to exactly
these. Set **everything not listed below to _None_**:

| Stripe resource (in the "Create restricted key" screen) | Permission | Why the kit needs it                                        |
| ------------------------------------------------------- | ---------- | ----------------------------------------------------------- |
| **Products**                                            | **Write**  | Create/update a product when you save a plan                |
| **Prices**                                              | **Write**  | Create new prices / archive old ones (prices are immutable) |
| **Coupons**                                             | **Write**  | Create/update/delete intro‑offer & marketing coupons        |
| **Promotion codes**                                     | **Write**  | Create customer‑facing promo codes (e.g. `LAUNCH20`)        |
| **Customers**                                           | **Write**  | Find or create the Stripe customer at checkout              |
| **Checkout Sessions**                                   | **Write**  | Create the hosted checkout page; read its line items        |
| **Customer portal**                                     | **Write**  | Open the self‑serve billing portal (`/billing`)             |
| **Subscriptions**                                       | **Write**  | Create subscriptions (embedded `/express-intent`) + switch plan (1‑click annual `/upgrade-annual`); read in webhooks |
| **PaymentIntents**                                      | **Write**  | Embedded paywall / two‑step checkout card + wallet payments (`/express-intent`) |
| **SetupIntents**                                        | **Write**  | Collect a payment method for trial / $0‑now subscriptions (`/express-intent`) |
| **Charges**                                             | **Read**   | Capture the buyer's wallet identity from the first charge (edge‑function webhook) |
| **Invoices**                                            | **Read**   | List a customer's past invoices on `/billing`               |
| _Everything else_                                       | **None**   | Not used                                                    |

> Signature‑verifying incoming webhooks does **not** require any key permission — it
> only uses the webhook **signing secret** (§4), not the API key.

### 3.2 Generate the secret key (step by step)

1. Go to the Stripe Dashboard and confirm **Test mode** is **on** (top‑right toggle).
2. Open **Developers → API keys** (direct link:
   <https://dashboard.stripe.com/test/apikeys>).
3. **Option A (standard key):** under **Standard keys**, find **Secret key** and
   click **Reveal test key**. Copy the value — it begins with `sk_test_`.
   **Option B (restricted key):** click **Create restricted key**, give it a name
   (e.g. `dream-kit-server`), set the permissions from the table in §3.1 (all others
   **None**), click **Create key**, then **Reveal** and copy it — it begins with
   `rk_test_`.
4. Treat this value like a password. **Never** paste it into client code, commit it,
   or share it. It is server‑only (golden rule #2).

### 3.3 Put it in the env

**Local dev** — edit `.env` at the repo root:

```bash
STRIPE_SECRET_KEY="sk_test_...."   # or rk_test_....
```

Restart `pnpm dev:next` so it picks up the change.

**Production (Vercel)** — Project → **Settings → Environment Variables** → add
`STRIPE_SECRET_KEY` (use your **live** key, `sk_live_…`/`rk_live_…`, when you go
live), scope **Production** (and Preview if you want billing in previews), **Save**,
then **redeploy**.


### 3.4 Rotating / updating the key later

1. Create the new key (or **Roll** the existing one) in **Developers → API keys**.
2. Update the value in **every** place from §3.3 (local `.env`, Vercel, Supabase
   secrets) and redeploy / restart.
3. Once everything is updated and verified, **revoke** the old key in the dashboard.

---

## 4. The webhook — set up automatically

Stripe reaches the app through **one** webhook endpoint, the billing module's
`POST /api/mod/billing/stripe/webhook`. It writes `public.mod_billing_*`, the source
of truth the web and mobile apps read, and projects subscriptions into the read-only
CMS **Commerce → Subscriptions** list. It handles `product.*`, `price.*`,
`checkout.session.completed` and `customer.subscription.*`.

It is safe under retries and reordering:

- Every Stripe event id is recorded, so a redelivered event is acknowledged without
  being applied twice.
- A subscription update older than the one already applied is ignored. Stripe doesn't
  guarantee delivery order.

### 4.1 Production / hosted — nothing to do

Once `STRIPE_SECRET_KEY` is set and the site has a public `https://` URL, an hourly
scheduled check (Supabase Cron → `GET /api/mod/billing/cron/connect`) **registers the
endpoint through the Stripe API**. It stores the endpoint's signing secret in Supabase
Vault, so there is no Stripe dashboard step and no second secret to copy. It runs
within the hour of your first deploy; check **Developers → Webhooks** in Stripe for an
endpoint described "Dream Starter Kit — billing (created automatically)".

Want to manage the endpoint yourself instead? Create it in the dashboard with the events
above and set `STRIPE_WEBHOOK_SECRET` to its `whsec_…`. When that variable is set, the
app never creates or replaces the endpoint.

### 4.2 Local development (Stripe CLI — no public URL needed)

```bash
stripe listen --forward-to localhost:3000/api/mod/billing/stripe/webhook
```

The CLI prints a `whsec_…`; put it in `.env` as `STRIPE_WEBHOOK_SECRET="whsec_…"` and
restart `pnpm dev:next`. (`pnpm dev:setup` already writes a throwaway secret, which
the e2e suite uses with self-signed events.)

### 4.3 Upgrading from the two-webhook setup

Kits before this change used two endpoints:

- `…/functions/v1/billing-stripe-webhook`, a Supabase edge function using
  `STRIPE_WEBHOOK_SECRET`;
- `…/cms-api/stripe/webhooks`, a Payload plugin endpoint using
  `STRIPE_WEBHOOKS_ENDPOINT_SECRET`.

To upgrade:

1. Deploy. The scheduled check registers the new endpoint, unless you set
   `STRIPE_WEBHOOK_SECRET` yourself. In that case, point your endpoint at the new URL.
2. Confirm a delivery succeeds on the new endpoint in **Developers → Webhooks**.
3. Delete the two old endpoints in Stripe, and remove
   `STRIPE_WEBHOOKS_ENDPOINT_SECRET` from your env. It's deprecated and ignored.
4. Optional: `supabase functions delete billing-stripe-webhook delete-account
   reminders-process`. The kit no longer ships edge functions.

---

## 5. Make it functional — the full checklist

Do these in order. Test mode throughout.

1. **Set `STRIPE_SECRET_KEY`** everywhere it's needed (§3.3).
2. **The webhook** sets itself up in production (§4.1); locally run the
   `stripe listen` forwarder (§4.2).
3. **Run the app**, sign up (the **first** signup becomes the founder/admin), and let
   it route you through `/cms-setup`, which **seeds the CMS** (creates the default
   **Example Monthly / Annual / Lifetime** plans + a welcome coupon).
4. **Push the plans to Stripe:** open `/admin` → **Commerce → Plans**, open a plan and
   click **Save**. The `afterChange` hook creates the Stripe product + price. (Seeded
   plans stay `unsynced` until first saved — this is the step that syncs them.) Check
   the plan's **Sync status** field shows success; if it errored, the message is in
   **Sync error**.
5. **Confirm the mirror:** saving + the webhooks should populate the products/prices
   in the DB. The public **`/pricing`** page should now show your plans.
6. **Do a test purchase:** go to `/pricing`, start checkout, and pay with Stripe's
   **test card `4242 4242 4242 4242`**, any future expiry, any CVC, any ZIP. After
   payment you should land back in the app with premium unlocked, and a **subscription**
   row should appear in `/admin → Commerce → Subscriptions`.
7. **Test self‑serve billing:** visit **`/billing`** — you should see the current plan,
   a link to the Stripe **Customer Portal** (change/cancel), and past invoices.

### Going live

1. Finish Stripe **business/account verification** so live mode is enabled.
2. Switch the dashboard to **Live mode** and repeat §3 (live `sk_live_…`/`rk_live_…`).
   The live webhook endpoint registers itself within the hour (§4.1).
3. Update the Vercel env with the **live** key and redeploy.
4. Re‑save each plan in `/admin` so it syncs to your **live** Stripe account.

---

## 6. Troubleshooting

- **`Billing not configured` (503) at checkout** → `STRIPE_SECRET_KEY` is missing in
  that environment. Re‑check §3.3 and redeploy/restart.
- **Plan saves but Sync status shows an error** → the secret key lacks a needed write
  permission (see the §3.1 table) or you're in the wrong mode (test vs live). The
  message is in the plan's **Sync error** field.
- **Paid in test mode but nothing unlocked / no subscription row** → the webhook isn't
  reaching you or the signing secret is wrong. Check the endpoint's **delivery
  attempts** in the Stripe Dashboard (or the CLI terminal). A `400 Signature
verification failed` means `STRIPE_WEBHOOK_SECRET` doesn't match that endpoint — unset
  it to let the app manage the endpoint, or copy the right `whsec_…` and redeploy. If no
  endpoint exists yet, check the site has a public https URL and wait for the hourly
  check (or look at `select * from net._http_response order by created desc` in SQL).
- **CMS subscription row has empty "current period" dates** → the webhook endpoint was
  created on an **old API version**. The CMS mirror reads the period from the
  subscription item (API 2025+). Edit the endpoint's **API version** to your account's
  current version (§4.0) and re‑send / re‑trigger the event.
- **Guest‑checkout invite emails point at the wrong site** → set `SITE_URL` in the
  Supabase function secrets to your production origin.
- **Never** put the secret key or a signing secret in `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*`
  vars or client code — those compile into the browser/app bundle (golden rules #2/#3).
