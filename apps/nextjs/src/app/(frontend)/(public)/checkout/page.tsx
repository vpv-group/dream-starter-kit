import type { Metadata } from "next";
import { redirect } from "next/navigation";

import type { Media, ModBillingPlan, Review } from "@acme/cms";
import { getModuleSettings } from "@acme/mod-kit/payload";

import type { CheckoutTestimonialData } from "~/components/checkout/checkout-testimonial";
import { CheckoutFlow } from "~/components/checkout/checkout-flow";
import { isViewerPremium } from "~/lib/billing-entitlement";
import { getPayloadClient } from "~/lib/cms/payload-client";
import { getAuthSettings, getBranding } from "~/lib/payload";
import { resolveAnnualPlan } from "~/lib/paywall-copy";
import { getWorkspaceContext } from "~/lib/workspaces/server";
import { modSettings } from "~/mod/registry.payload.generated";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false },
};

/** Pull the public URL off a populated media relation (id-only ⇒ undefined). */
function mediaUrl(
  value: Media | number | null | undefined,
): string | undefined {
  return value && typeof value === "object"
    ? (value.url ?? undefined)
    : undefined;
}

/** Build the testimonial card data from a populated, approved review. */
function toTestimonial(review: Review): CheckoutTestimonialData | null {
  if (review.status !== "approved" || !review.body?.trim()) return null;
  const author = typeof review.author === "object" ? review.author : null;
  const authorName =
    [author?.displayName, author?.username]
      .map((s) => s?.trim())
      .find((s) => s) ?? "A happy customer";
  return {
    quote: review.body,
    rating: review.rating,
    authorName,
    authorTitle: review.authorTitle ?? null,
    avatarUrl: author ? mediaUrl(author.avatar) : undefined,
  };
}

/**
 * The Bloomberg-style two-step checkout (Account → Payment). Server-loads the
 * selected plan + the curated checkout testimonial + auth settings, then hands
 * off to the client `CheckoutFlow`. Plans are authored in Payload; the buyer
 * arrives here from the /pricing "Continue" CTA with `?plan=<id>`, plus
 * `&workspace=<orgId>` when buying for a workspace (company billing) from its
 * /billing page — honored only for the workspace's owners/admins.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; step?: string; workspace?: string }>;
}) {
  const { plan: planParam, workspace: workspaceParam } = await searchParams;
  if (!planParam) redirect("/pricing");

  let plan: ModBillingPlan | null = null;
  let annualPlan: ModBillingPlan | null = null;
  let testimonial: CheckoutTestimonialData | null = null;

  try {
    const payload = await getPayloadClient();

    plan = await payload
      .findByID({ collection: "mod-billing-plans", id: planParam, depth: 0 })
      .catch(() => null);

    if (plan && plan.active !== false) {
      // The annual plan offered as a post-purchase 1-click upgrade — only when
      // the purchased plan is a recurring, non-yearly subscription. Offering it
      // after a one-time (Lifetime) or an already-annual purchase produces
      // nonsense pricing and a 409 from /upgrade-annual (there's no monthly sub
      // to switch).
      if (plan.pricingType === "recurring" && plan.interval !== "year") {
        const all = await payload
          .find({
            collection: "mod-billing-plans",
            where: { active: { equals: true } },
            depth: 0,
            limit: 100,
          })
          .catch(() => ({ docs: [] as ModBillingPlan[] }));
        annualPlan = resolveAnnualPlan(
          all.docs,
          plan.id,
        ) as unknown as ModBillingPlan | null;
      }

      // Curated checkout testimonial: read the featured review id from settings,
      // then fetch it populated (author + avatar).
      // Billing may be uninstalled — the generated map then lacks it.
      const billingSettings = Object.hasOwn(modSettings, "billing")
        ? modSettings.billing
        : undefined;
      const billing = billingSettings
        ? await getModuleSettings<{
            featuredReview?: number | { id: number } | null;
          }>(payload, billingSettings)
        : null;
      const featured = billing?.featuredReview;
      const reviewId = typeof featured === "object" ? featured?.id : featured;
      if (reviewId != null) {
        const review = await payload
          .findByID({ collection: "reviews", id: reviewId, depth: 2 })
          .catch(() => null);
        if (review) testimonial = toTestimonial(review);
      }
    }
  } catch {
    // CMS unreachable — fall through to the redirect guard below.
  }

  // Redirect OUTSIDE the try/catch: Next's redirect() throws a control-flow
  // signal that a surrounding catch would otherwise swallow.
  if (!plan || plan.active === false) redirect("/pricing");

  // Buying for a workspace: only its owners/admins (the server checks again).
  let workspace: { id: string; name: string } | null = null;
  if (workspaceParam) {
    const ctx = await getWorkspaceContext();
    const ws = ctx?.workspaces.find(
      (w) =>
        w.id === workspaceParam && (w.role === "owner" || w.role === "admin"),
    );
    if (!ws) redirect("/billing");
    workspace = { id: ws.id, name: ws.name };
  }

  // Don't let an already-subscribed user open a SECOND concurrent subscription
  // (express-intent unconditionally creates one → double billing). Send them to
  // self-serve billing to change/cancel instead. Guests/anon fall through. (A
  // personal plan doesn't stop someone buying for their workspace.)
  if (!workspace && (await isViewerPremium())) redirect("/billing");

  const [authSettings, branding] = await Promise.all([
    getAuthSettings(),
    getBranding(),
  ]);

  return (
    <CheckoutFlow
      planId={plan.id}
      plan={plan}
      annualPlan={annualPlan}
      authSettings={authSettings}
      appName={branding.appName}
      testimonial={testimonial}
      workspace={workspace}
    />
  );
}
