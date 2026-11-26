import { defineModule } from "@acme/mod-kit";

/**
 * Billing — the provider-neutral billing core (docs/BILLING.md). It owns what
 * every payment provider shares: the Payload catalog (plans, coupons, the
 * /pricing page), the purchase ledger in mod_billing_* (customer links,
 * subscriptions and one-time purchases, keyed by provider), entitlements
 * (`usePremium`, the mod_billing_entitlements view, the server
 * `getViewerEntitlement` service), billing tags on users, the read-only CMS
 * subscriptions list, `/billing` and webhook-claim idempotency.
 *
 * Payment providers are ADAPTER modules (`adapter.for: "billing"`):
 * billing-adapter-stripe ships preinstalled; an in-app purchase adapter
 * (e.g. RevenueCat) plugs in the same way. Billing calls out to them through
 * `getModAdapters("billing")` / `useModAdapters("billing")` and never imports
 * them; they call in through `@acme/mod-billing/server`'s core services.
 *
 * database.dml: billing tags live in the core tags/user_tags tables.
 */
export default defineModule({
  slug: "billing",
  name: "Billing",
  version: "2.0.0",
  kitCompat: ">=2.6.0 <3",
  description:
    "Plans, purchases and entitlements, with pluggable payment providers.",
  nav: {
    web: [
      { title: "Billing", href: "/billing", icon: "IconCreditCard", order: 50 },
    ],
    native: [
      {
        title: "Pricing",
        href: "/a/billing",
        icon: "IconCreditCard",
        order: 55,
      },
    ],
  },
  routes: {
    web: [
      { path: "", component: "BillingPage", mount: "/billing" },
      {
        path: "",
        component: "PricingPage",
        area: "public",
        mount: "/pricing",
        rsc: true,
      },
    ],
    native: [{ path: "", component: "PricingScreen" }],
  },
  widgets: { web: "BillingWidget", native: "BillingWidget" },
  server: {
    routes: true,
    publicRoutes: true,
    services: true,
  },
  database: {
    tables: [
      "mod_billing_customers",
      "mod_billing_customer_links",
      "mod_billing_webhook_events",
      "mod_billing_products",
      "mod_billing_prices",
      "mod_billing_subscriptions",
      "mod_billing_managed_tags",
    ],
    dml: ["tags", "user_tags"],
  },
  cms: {
    collections: [
      "mod-billing-plans",
      "mod-billing-coupons",
      "mod-billing-subscriptions",
    ],
    hasPlugins: true,
    hasMigrations: true,
    hasSeed: true,
    hasSettings: true,
  },
});
