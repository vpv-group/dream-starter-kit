import type { CollectionConfig } from "payload";

import { anyone, isAdmin } from "@acme/mod-kit/payload";

import { slugField } from "../fields/slug";
import {
  retirePlanWithProviders,
  syncPlanWithProviders,
} from "../hooks/sync-with-providers";

/**
 * Billing plans — the source of truth for the product catalog. Authored here
 * in Payload (the `cms` schema) and pushed to every installed payment
 * provider on save (../hooks/sync-with-providers.ts → each adapter's
 * `syncPlan`; e.g. billing-adapter-stripe creates the Stripe product/price
 * and adds a read-only "Stripe" tab with the ids). Providers mirror the
 * resulting catalog back into mod_billing_products/prices for RLS clients.
 * Deleting a plan retires it at each provider (`deletePlan`; Stripe archives
 * the product + price): no new purchases, existing subscriptions continue.
 *
 * Pricing is NOT editorial, so there is no draft/publish workflow — `active`
 * gates visibility instead. Read is public (the pricing page is anonymous);
 * writes are admin-only.
 */
export const Plans: CollectionConfig = {
  slug: "mod-billing-plans",
  // Slug stays namespaced (`mod-billing-*`) per the module framework's
  // collision guard; `labels` is the supported way to keep the admin UI clean
  // (nav cards, titles, breadcrumbs read "Billing Plans", not "Mod Billing…").
  labels: { singular: "Billing Plan", plural: "Billing Plans" },
  admin: {
    useAsTitle: "name",
    group: "Commerce",
    defaultColumns: [
      "name",
      "pricingType",
      "unitAmount",
      "active",
      "syncStatus",
    ],
    description:
      "Plans sync to your payment providers automatically on save (Stripe " +
      "prices are immutable, so changing the amount creates a new price and " +
      "archives the old one).",
  },
  access: {
    read: anyone,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [syncPlanWithProviders],
    afterDelete: [retirePlanWithProviders],
  },
  fields: [
    {
      name: "entitlement",
      type: "select",
      defaultValue: "premium",
      options: [
        { label: "Members", value: "members" },
        { label: "Premium", value: "premium" },
      ],
      admin: {
        position: "sidebar",
        description: "Content accessLevel this plan unlocks.",
      },
    },
    // --- Provider sync state (read-only; written by the afterChange sync) ---
    {
      name: "skipSync",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description: "Don't push this plan to the payment providers on save.",
      },
    },
    {
      name: "syncStatus",
      type: "select",
      defaultValue: "unsynced",
      options: [
        { label: "Not synced", value: "unsynced" },
        { label: "Synced", value: "synced" },
        { label: "Error", value: "error" },
      ],
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "syncError",
      type: "textarea",
      admin: {
        position: "sidebar",
        readOnly: true,
        condition: (data) => data.syncStatus === "error",
      },
    },
    {
      name: "lastSyncedAt",
      type: "date",
      admin: {
        position: "sidebar",
        readOnly: true,
        date: { pickerAppearance: "dayAndTime" },
      },
    },
    // Unnamed tabs keep every field at the document root (no column moves);
    // payment-provider adapters append their own tab (e.g. Stripe's ids).
    {
      type: "tabs",
      tabs: [
        {
          label: "Plan",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "name",
                  type: "text",
                  required: true,
                  admin: { width: "60%" },
                },
                {
                  name: "active",
                  type: "checkbox",
                  defaultValue: true,
                  admin: { width: "40%" },
                },
              ],
            },
            slugField("name"),
            { name: "description", type: "textarea" },
            {
              type: "row",
              fields: [
                {
                  name: "pricingType",
                  type: "select",
                  required: true,
                  defaultValue: "recurring",
                  options: [
                    { label: "Recurring (subscription)", value: "recurring" },
                    { label: "One-time (lifetime)", value: "one_time" },
                  ],
                  admin: { width: "50%" },
                },
                {
                  name: "interval",
                  type: "select",
                  defaultValue: "month",
                  options: [
                    { label: "Daily", value: "day" },
                    { label: "Weekly", value: "week" },
                    { label: "Monthly", value: "month" },
                    { label: "Yearly", value: "year" },
                  ],
                  admin: {
                    width: "25%",
                    // Only meaningful for recurring plans.
                    condition: (data) => data.pricingType === "recurring",
                  },
                },
                {
                  name: "intervalCount",
                  type: "number",
                  min: 1,
                  defaultValue: 1,
                  admin: {
                    width: "25%",
                    description: "Bill every N intervals, e.g. every 3 months.",
                    condition: (data) => data.pricingType === "recurring",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "unitAmount",
                  type: "number",
                  required: true,
                  min: 0,
                  label: "Price (in cents)",
                  admin: {
                    width: "50%",
                    description:
                      "Amount in the smallest currency unit, e.g. 999 = $9.99.",
                  },
                },
                {
                  name: "currency",
                  type: "text",
                  required: true,
                  defaultValue: "usd",
                  admin: { width: "25%", description: "ISO code, e.g. usd." },
                },
                {
                  name: "trialDays",
                  type: "number",
                  min: 0,
                  label: "Free trial (days)",
                  admin: {
                    width: "25%",
                    description: "0 / empty = no trial.",
                    condition: (data) => data.pricingType === "recurring",
                  },
                },
              ],
            },
            {
              name: "introOffer",
              type: "group",
              label: "Introductory offer",
              admin: {
                description:
                  "Discount the first billing period only (e.g. $1 for the first month, " +
                  "then the standard price recurs). Implemented as a Stripe coupon with " +
                  "duration=once, applied automatically at checkout.",
                condition: (data) => data.pricingType === "recurring",
              },
              fields: [
                { name: "enabled", type: "checkbox", defaultValue: false },
                {
                  name: "introAmount",
                  type: "number",
                  min: 0,
                  label: "Intro price (in cents)",
                  admin: {
                    description: "Intro-period price, e.g. 100 = $1.00.",
                    condition: (_data, sibling) => Boolean(sibling.enabled),
                  },
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "introInterval",
                      type: "select",
                      defaultValue: "month",
                      options: [
                        { label: "Months", value: "month" },
                        { label: "Years", value: "year" },
                      ],
                      admin: {
                        condition: (_data, sibling) => Boolean(sibling.enabled),
                      },
                    },
                    {
                      name: "introPeriods",
                      type: "number",
                      min: 1,
                      defaultValue: 1,
                      admin: {
                        description:
                          "How many intro periods the discount lasts (1 = first " +
                          "invoice only; years count as 12 months each).",
                        condition: (_data, sibling) => Boolean(sibling.enabled),
                      },
                    },
                  ],
                },
              ],
            },
            {
              name: "features",
              type: "array",
              label: "Feature bullets",
              admin: { description: "Shown on the public pricing card." },
              fields: [
                { name: "text", type: "text", required: true },
                { name: "included", type: "checkbox", defaultValue: true },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "badge",
                  type: "text",
                  admin: {
                    width: "40%",
                    description: 'e.g. "Save 17%" or "Best value".',
                  },
                },
                {
                  name: "highlighted",
                  type: "checkbox",
                  label: "Highlight this plan",
                  defaultValue: false,
                  admin: { width: "30%" },
                },
                {
                  name: "displayOrder",
                  type: "number",
                  defaultValue: 0,
                  admin: { width: "30%" },
                },
              ],
            },
          ],
        },
        {
          label: "Subscribers",
          fields: [
            {
              name: "subscriptions",
              type: "join",
              collection: "mod-billing-subscriptions",
              on: "plan",
            },
            // Coupons restricted to this plan (inverse of Coupons.appliesTo). Coupons
            // that apply to ALL plans (empty appliesTo) won't appear here — the Coupons
            // collection stays in the nav for those.
            {
              name: "coupons",
              type: "join",
              collection: "mod-billing-coupons",
              on: "appliesTo",
              admin: {
                defaultColumns: ["name", "code", "active"],
                description: "Coupons restricted to this plan.",
              },
            },
          ],
        },
      ],
    },
  ],
};
