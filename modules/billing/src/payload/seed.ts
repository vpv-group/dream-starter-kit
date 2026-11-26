import type { ModSeedStep } from "@acme/mod-kit/payload";
import { updateModuleSettings } from "@acme/mod-kit/payload";

import { settings } from "./settings";

/**
 * Demo billing catalog — runs through the host's idempotent CMS seed flow
 * (the whole seed bails if content exists, so steps don't re-check).
 *
 * Plans/coupons are pushed to the installed payment providers at seed time
 * like any save (../hooks/sync-with-providers.ts), marked
 * `context.seeding` so a provider syncs only with credentials it has at hand
 * (Stripe: your own STRIPE_SECRET_KEY) — a configured deploy gets
 * immediately-purchasable seeded plans, and the seed stays offline-safe and
 * scalar-only otherwise (local dev, CI, cloud sessions). Those plans show as
 * `unsynced` until saved in `/admin` or "Sync everything now" (Modules →
 * Billing). Syncs fail soft (record `syncError`, never block the save).
 */
const context = { seeding: true };

export const seed: ModSeedStep[] = [
  {
    label: "Plans & pricing",
    run: async (payload) => {
      const monthly = await payload.create({
        collection: "mod-billing-plans",
        context,
        data: {
          name: "Example Monthly Plan",
          slug: "dream-monthly",
          description: "Full access, billed monthly.",
          pricingType: "recurring",
          interval: "month",
          unitAmount: 999,
          currency: "usd",
          displayOrder: 1,
          features: [
            { text: "Everything in Free" },
            { text: "Unlimited AI chat" },
            { text: "Priority support" },
          ],
        },
      });
      const annual = await payload.create({
        collection: "mod-billing-plans",
        context,
        data: {
          name: "Example Annual Plan",
          slug: "dream-annual",
          description:
            "Full access, billed yearly. Includes a 7-day free trial.",
          pricingType: "recurring",
          interval: "year",
          unitAmount: 9999,
          currency: "usd",
          trialDays: 7,
          badge: "Best value",
          highlighted: true,
          displayOrder: 2,
          features: [
            { text: "Everything in Monthly" },
            { text: "7-day free trial" },
            { text: "2 months free vs monthly" },
          ],
        },
      });
      const lifetime = await payload.create({
        collection: "mod-billing-plans",
        context,
        data: {
          name: "Example Lifetime Plan",
          slug: "dream-lifetime",
          description: "One payment, lifetime access.",
          pricingType: "one_time",
          unitAmount: 39900,
          currency: "usd",
          displayOrder: 3,
          features: [
            { text: "Everything in Annual" },
            { text: "Pay once, own forever" },
            { text: "All future updates" },
          ],
        },
      });
      // Inactive demo of an introductory offer ($1 first month → $19/mo)
      // so the capability is visible out of the box without affecting pricing.
      await payload.create({
        collection: "mod-billing-plans",
        context,
        data: {
          name: "Example intro offer",
          slug: "dream-pro-intro-demo",
          description: "$1 for the first month, then $19/month.",
          pricingType: "recurring",
          interval: "month",
          unitAmount: 1900,
          currency: "usd",
          active: false,
          displayOrder: 99,
          introOffer: { enabled: true, introAmount: 100 },
          features: [{ text: "Example intro pricing" }],
        },
      });

      // Welcome coupon — the signup flow mints a unique, expiring promotion
      // code for this coupon per new free account.
      await payload.create({
        collection: "mod-billing-coupons",
        context,
        data: {
          name: "Welcome offer",
          discountType: "percent_off",
          value: 20,
          duration: "once",
          isWelcomeOffer: true,
        },
      });

      // A standalone, approved demo testimonial featured on the checkout page.
      // Reuses the core `reviews` collection (target is optional, so it isn't
      // tied to a location/event); authored by the first/admin user so it
      // inherits their avatar + display name. Best-effort: if no user exists yet
      // (rare for the seed paths) we skip the testimonial rather than fail.
      const author = await payload.find({ collection: "users", limit: 1 });
      const authorId = author.docs[0]?.id;
      let featuredReviewId: number | undefined;
      if (authorId != null) {
        const review = await payload.create({
          collection: "reviews",
          data: {
            author: authorId,
            rating: 5,
            authorTitle: "Founder, Acme",
            body: "We shipped our web and mobile apps in a weekend. The checkout, auth and admin were already done — we just made it ours.",
            status: "approved",
          },
        });
        featuredReviewId = review.id;
      }

      await updateModuleSettings(payload, settings, {
        heading: "Pricing",
        subheading: "Start free. Upgrade when you're ready.",
        billingToggleDefault: "monthly",
        showFreeTier: true,
        featuredPlans: [monthly.id, annual.id, lifetime.id],
        freeTier: {
          name: "Free",
          description: "Everything you need to get started.",
          ctaLabel: "Get started",
          features: [{ text: "Core features" }, { text: "Community support" }],
        },
        showEnterpriseTier: true,
        enterpriseTier: {
          name: "Enterprise",
          description: "Total access for your whole team, billed your way.",
          ctaLabel: "Contact sales",
          link: { url: "mailto:sales@example.com" },
          features: [
            { text: "Everything in the paid plans" },
            { text: "Centralized team billing & SSO" },
            { text: "Priority onboarding & support" },
          ],
        },
        ...(featuredReviewId != null
          ? { featuredReview: featuredReviewId }
          : {}),
      });
    },
  },
];
