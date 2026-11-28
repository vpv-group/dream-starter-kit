import { defineModule } from "@acme/mod-kit";

/**
 * Stripe — the billing module's web payment provider (docs/STRIPE.md).
 *
 * - Connect: "Connect with Stripe" on Modules → Billing (OAuth through the
 *   Meet Dream AI app, brokered by meetdream.com — no keys to paste), or your
 *   own STRIPE_SECRET_KEY / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, which win.
 * - Catalog: billing's Plans/Coupons push to Stripe on save (products,
 *   immutable prices recreated on change, coupons + promotion codes); the
 *   Stripe ids show on a "Stripe" tab of each plan/coupon.
 * - Checkout: hosted Checkout and the embedded paywall (Stripe Elements,
 *   Apple/Google Pay), guest checkout, the customer portal and invoices.
 * - One webhook (POST /api/mod/billing-adapter-stripe/webhook), registered
 *   through the Stripe API by an hourly check, its signing secret in Vault;
 *   it writes the purchase ledger only through billing's core services.
 *
 * Web only (golden rule #4): the native apps read entitlements, never pay
 * through Stripe.
 */
export default defineModule({
  slug: "billing-adapter-stripe",
  name: "Stripe",
  version: "1.3.0",
  kitCompat: ">=2.6.0 <3",
  description: "Stripe payments for billing: checkout, portal, webhook.",
  requires: ["billing"],
  platforms: { web: true, native: false },
  adapter: { for: "billing", server: true, web: "webProvider" },
  server: {
    routes: true,
    publicRoutes: true,
  },
  database: {
    tables: [],
  },
  cms: {
    // A "Stripe" tab on Modules → Billing, and on billing's Plans/Coupons.
    settingsTabFor: "billing",
    hasCollectionTabs: true,
  },
  admin: {
    // The connector panel (connection, webhook, catalog) on Billing's page.
    settingsComponent: true,
  },
});
