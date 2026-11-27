import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import config from "@payload-config";
import { getPayload } from "payload";

import type { Database } from "@acme/api";
import type { Media, ModBillingPlan, Review } from "@acme/cms";
import { DEFAULT_AUTH_SETTINGS } from "@acme/app";
import { getModuleSettings } from "@acme/mod-kit/payload";
import { getHostServices } from "@acme/mod-kit/server";

import type { CheckoutTestimonialData } from "../web/checkout/checkout-testimonial";
import { settings } from "../payload/settings";
import { resolveAnnualPlan } from "../paywall-copy";
import { entitlementFor } from "../server/core/entitlement";
import { CheckoutFlow } from "../web/checkout/checkout-flow";

export const checkoutMetadata: Metadata = {
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

/** The workspace `orgId`, when the viewer owns or administers it (RLS). */
async function administeredWorkspace(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<{ id: string; name: string } | null> {
  const { data: isAdmin } = await supabase.rpc("is_org_admin", { _org: orgId });
  if (isAdmin !== true) return null;
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle();
  return org ? { id: org.id, name: org.name } : null;
}

/**
 * The Bloomberg-style two-step checkout (Account → Payment). Server-loads the
 * selected plan + the curated checkout testimonial + auth settings, then hands
 * off to the client `CheckoutFlow`. Plans are authored in Payload; the buyer
 * arrives here from the /pricing "Continue" CTA with `?plan=<id>`, plus
 * `&workspace=<orgId>` when buying for a workspace (company billing) from its
 * /billing page — honored only for the workspace's owners/admins.
 */
export async function CheckoutPage({
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
    const payload = await getPayload({ config });

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
      const billing = await getModuleSettings<{
        featuredReview?: number | { id: number } | null;
      }>(payload, settings).catch(() => null);
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

  // The viewer's session and the host's auth/branding (docs/MODULES.md →
  // Host services). Without a host providing them, checkout still renders
  // with the default auth settings.
  const host = getHostServices();
  const supabase = host ? await host.getSessionClient() : null;

  // Buying for a workspace: only its owners/admins (the server checks again).
  let workspace: { id: string; name: string } | null = null;
  if (workspaceParam) {
    const ws = supabase
      ? await administeredWorkspace(supabase, workspaceParam)
      : null;
    if (!ws) redirect("/billing");
    workspace = ws;
  }

  // Don't let an already-subscribed user open a SECOND concurrent subscription
  // (express-intent unconditionally creates one → double billing). Send them to
  // self-serve billing to change/cancel instead. Guests/anon fall through. (A
  // personal plan doesn't stop someone buying for their workspace.)
  if (!workspace && supabase && (await entitlementFor(supabase)).isPremium) {
    redirect("/billing");
  }

  const [authSettings, branding] = await Promise.all([
    host?.getAuthSettings() ?? DEFAULT_AUTH_SETTINGS,
    host?.getBranding() ?? { appName: "" },
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
