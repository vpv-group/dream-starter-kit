import { defineAdapterCollectionTab } from "@acme/mod-kit/payload";

/**
 * The Stripe ids on billing's Plans and Coupons — written back by the catalog
 * sync (hooks/), read-only, never hand-edited. Unnamed tabs, so the columns
 * are where billing 1.x created them.
 */
const readOnlyText = (name: string, label: string) => ({
  name,
  label,
  type: "text" as const,
  admin: { readOnly: true },
});

export const collectionTabs = [
  defineAdapterCollectionTab({
    slug: "billing-adapter-stripe",
    target: "billing",
    collection: "mod-billing-plans",
    label: "Stripe",
    description:
      "Created on save: a Stripe product, and a price (prices are " +
      "immutable, so a new amount or interval makes a new price and " +
      "archives the old one).",
    fields: [
      readOnlyText("stripeProductId", "Product"),
      readOnlyText("stripePriceId", "Price"),
      readOnlyText("stripeIntroCouponId", "Intro offer coupon"),
    ],
  }),
  defineAdapterCollectionTab({
    slug: "billing-adapter-stripe",
    target: "billing",
    collection: "mod-billing-coupons",
    label: "Stripe",
    fields: [
      readOnlyText("stripeCouponId", "Coupon"),
      readOnlyText("stripePromotionCodeId", "Promotion code"),
    ],
  }),
];
