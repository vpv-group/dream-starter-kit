import type { CollectionConfig } from "payload";

import { ownsOrStaff } from "@acme/mod-kit/payload";

/**
 * Read-only CMS copy of purchases from every payment provider, keyed by
 * (provider, providerSubscriptionId) and written EXCLUSIVELY by the provider
 * adapters' webhooks through `projectSubscriptionToCms` (../project.ts) — all
 * client/admin writes are disabled, every field is read-only in the UI.
 * Members read their own rows.
 *
 * public.mod_billing_subscriptions is the source of truth (RLS clients and
 * entitlement checks read it); this is the admin's view of it.
 */
export const Subscriptions: CollectionConfig = {
  slug: "mod-billing-subscriptions",
  // Namespaced slug + clean admin label (see Plans.ts).
  labels: { singular: "Billing Subscription", plural: "Billing Subscriptions" },
  admin: {
    group: "Commerce",
    defaultColumns: ["user", "plan", "status", "currentPeriodEnd"],
    description:
      "Read-only copy written by the payment providers' webhooks. Manage " +
      "billing in the provider; author the catalog under Plans.",
    // Read-only mirror; surfaced inline on each Plan (the `subscriptions` join).
    // Every row has a plan, so hide the standalone list to keep Plans the
    // single Commerce entry point. A member's subscriptions also show on Users.
    hidden: true,
  },
  disableDuplicate: true,
  access: {
    read: ownsOrStaff(),
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      index: true,
      admin: { readOnly: true },
    },
    {
      name: "plan",
      type: "relationship",
      relationTo: "mod-billing-plans",
      index: true,
      admin: { readOnly: true },
    },
    {
      name: "coupon",
      type: "relationship",
      relationTo: "mod-billing-coupons",
      admin: { readOnly: true },
    },
    {
      name: "status",
      type: "select",
      required: true,
      index: true,
      options: [
        { label: "Trialing", value: "trialing" },
        { label: "Active", value: "active" },
        { label: "Past due", value: "past_due" },
        { label: "Canceled", value: "canceled" },
        { label: "Churned", value: "churned" },
        { label: "Paused", value: "paused" },
      ],
      admin: { readOnly: true },
    },
    { name: "startedAt", type: "date", admin: { readOnly: true } },
    { name: "trialEndsAt", type: "date", admin: { readOnly: true } },
    { name: "currentPeriodStart", type: "date", admin: { readOnly: true } },
    { name: "currentPeriodEnd", type: "date", admin: { readOnly: true } },
    {
      name: "cancelAtPeriodEnd",
      type: "checkbox",
      defaultValue: false,
      admin: { readOnly: true },
    },
    { name: "canceledAt", type: "date", admin: { readOnly: true } },
    { name: "lastPaymentAt", type: "date", admin: { readOnly: true } },
    {
      name: "lastPaymentAmount",
      type: "number",
      admin: { readOnly: true, description: "Cents." },
    },
    {
      name: "provider",
      type: "text",
      index: true,
      defaultValue: "stripe",
      admin: { readOnly: true, description: "Who sold it, e.g. stripe." },
    },
    {
      name: "providerSubscriptionId",
      type: "text",
      index: true,
      admin: { readOnly: true },
    },
    {
      name: "providerCustomerId",
      type: "text",
      index: true,
      admin: { readOnly: true },
    },
    {
      // Billing 1.x key (Stripe only); providerSubscriptionId replaces it.
      name: "stripeSubscriptionID",
      type: "text",
      unique: true,
      index: true,
      admin: { readOnly: true, hidden: true },
    },
    {
      name: "stripeCustomerID",
      type: "text",
      index: true,
      admin: { readOnly: true, hidden: true },
    },
  ],
};
