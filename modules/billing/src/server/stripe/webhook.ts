import "server-only";

import type { SupabaseClient as BaseSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import type { Database, Json } from "@acme/api";

import {
  mapPrice,
  mapProduct,
  mapSubscription,
  resolveCheckoutCustomer,
  subscriptionCustomerId,
  subscriptionUserIdFromMetadata,
} from "./mapping";

type SupabaseClient = BaseSupabaseClient<Database>;

// Stripe webhook → syncs products / prices / customers / subscriptions into the
// DB using the SERVICE ROLE (clients never write billing rows). The ONE place
// Stripe state enters the app (public.mod_billing_* is the source of truth that
// web, mobile and the CMS read). Signature is verified; every event id is
// recorded so a redelivery is acknowledged without being applied twice, and
// subscription writes go through mod_billing_apply_subscription(), which
// ignores an event older than the one already applied (Stripe doesn't
// guarantee delivery order).
//
// It also drives the "checkout-first" signup flow: when an anonymous visitor
// pays, this matches the checkout email to an existing user (and attaches the
// subscription) or creates the account and emails a Supabase invite. Active
// plans tag the user with the plan name (public.user_tags).
//
// Served at POST /api/mod/billing/stripe/webhook (a module public route — Stripe
// has no Supabase session). Local: `stripe listen --forward-to
// localhost:3000/api/mod/billing/stripe/webhook`.

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Where guest invitees set their password. Must be an allowed Supabase redirect.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

/** Find a user id by email — an indexed lookup on profiles.email. */
async function findUserIdByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc("mod_billing_user_id_by_email", {
    _email: email,
  });
  if (error) throw error;
  // The generated type says string, but the function returns null when no
  // profile has that email.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return data ?? null;
}

/**
 * Apply a subscription row unless a NEWER Stripe event already did. Returns
 * whether it was applied.
 */
async function applySubscription(
  admin: SupabaseClient,
  row: ReturnType<typeof mapSubscription>,
  eventCreated: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc("mod_billing_apply_subscription", {
    _row: row as unknown as Json,
    _event_at: new Date(eventCreated * 1000).toISOString(),
  });
  if (error) throw error;
  return data === true;
}

/**
 * Resolve the buyer to a Supabase user id for a guest checkout: match an
 * existing account by email, else create one and email a Supabase invite (the
 * invitee sets a password on /accept-invite, then lands on /a).
 */
async function resolveOrInviteGuest(
  admin: SupabaseClient,
  email: string,
  displayName: string | null,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/accept-invite`,
    data: displayName ? { display_name: displayName } : undefined,
  });
  if (!error) return data.user.id;
  // Already an app user → link to the existing account (no email sent).
  if (error.code === "email_exists" || /already/i.test(error.message)) {
    return await findUserIdByEmail(admin, email);
  }
  console.error("guest invite failed", error);
  return null;
}

/** Tag the user with their plan name (price → product → name). Idempotent. */
async function ensurePlanTag(
  admin: SupabaseClient,
  userId: string,
  priceId: string | null,
): Promise<void> {
  if (!priceId) return;
  const { data: price } = await admin
    .from("mod_billing_prices")
    .select("product_id")
    .eq("id", priceId)
    .maybeSingle();
  if (!price?.product_id) return;
  const { data: product } = await admin
    .from("mod_billing_products")
    .select("name")
    .eq("id", price.product_id)
    .maybeSingle();
  const name = product?.name;
  if (!name) return;
  const { data: tag } = await admin
    .from("tags")
    .upsert({ name, is_system: true }, { onConflict: "name" })
    .select("id")
    .maybeSingle();
  if (!tag?.id) return;
  await admin
    .from("user_tags")
    .upsert(
      { user_id: userId, tag_id: tag.id },
      { onConflict: "user_id,tag_id" },
    );
}

/**
 * Convert an anonymous buyer (who favorited → got an anon account → checked out)
 * to a permanent account, or merge into the existing account that owns the email.
 * Hosted Checkout redirects away, so the client-side email-confirmation flow
 * can't run here — the completed redirect is strong intent, so we set+confirm the
 * email directly. Returns the effective userId for the rest of the handler.
 */
async function convertOrMergeAnon(
  admin: SupabaseClient,
  anonId: string,
  email: string,
): Promise<string> {
  const { data: got } = await admin.auth.admin.getUserById(anonId);
  if (!got.user?.is_anonymous) return anonId; // already permanent

  const existingId = await findUserIdByEmail(admin, email);
  if (existingId && existingId !== anonId) {
    // Merge billing into the existing account, then delete the anon user.
    await admin
      .from("mod_billing_subscriptions")
      .update({ user_id: existingId })
      .eq("user_id", anonId);
    const { data: realCust } = await admin
      .from("mod_billing_customers")
      .select("user_id")
      .eq("user_id", existingId)
      .maybeSingle();
    if (realCust) {
      await admin.from("mod_billing_customers").delete().eq("user_id", anonId);
    } else {
      await admin
        .from("mod_billing_customers")
        .update({ user_id: existingId })
        .eq("user_id", anonId);
    }
    await admin.auth.admin.deleteUser(anonId);
    return existingId;
  }
  await admin.auth.admin.updateUserById(anonId, { email, email_confirm: true });
  return anonId;
}

/** Name/email/phone/address from Checkout `customer_details` OR a charge's
 *  `billing_details` — structurally the same shape. */
interface BuyerContact {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: Stripe.Address | null;
}

/** Persist the buyer's captured identity to their profile + Stripe customer. */
async function persistBuyerDetails(
  admin: SupabaseClient,
  stripe: Stripe,
  userId: string,
  customerId: string | undefined,
  details: BuyerContact | null,
): Promise<void> {
  if (!details) return;
  const patch: { display_name?: string; phone?: string } = {};
  if (details.name) patch.display_name = details.name;
  if (details.phone) patch.phone = details.phone;
  if (Object.keys(patch).length) {
    await admin.from("profiles").update(patch).eq("id", userId);
  }
  // Stamp the captured identity into auth user_metadata — the carrier the
  // cms.users mirror reads (the billing zip has no profiles column). Mirrors
  // what the /guest-account route writes, so the webhook-only path still syncs
  // name/phone/zip to Payload on the user's next login. GoTrue merges
  // user_metadata, so other keys are preserved. Best-effort.
  const meta: Record<string, unknown> = {};
  if (details.name) meta.display_name = details.name;
  if (details.phone) meta.phone = details.phone;
  if (details.address?.postal_code) {
    meta.billing_postal_code = details.address.postal_code;
  }
  if (details.address) meta.billing_address = details.address;
  if (Object.keys(meta).length) {
    await admin.auth.admin
      .updateUserById(userId, { user_metadata: meta })
      .then(undefined, () => undefined);
  }
  if (customerId) {
    await stripe.customers
      .update(customerId, {
        name: details.name ?? undefined,
        email: details.email ?? undefined,
        phone: details.phone ?? undefined,
        // Stripe's AddressParam doesn't accept nulls; drop empty fields.
        address: details.address
          ? (Object.fromEntries(
              Object.entries(details.address).filter(([, v]) => v != null),
            ) as Stripe.AddressParam)
          : undefined,
      })
      .catch(() => undefined);
  }
}

/**
 * Embedded checkout (express-intent) fires no `checkout.session.completed`, so
 * pull the buyer's identity off the subscription's most recent charge
 * (`billing_details`, captured from the wallet) and persist it the same way.
 */
async function persistFromLatestCharge(
  admin: SupabaseClient,
  stripe: Stripe,
  userId: string,
  customerId: string,
): Promise<void> {
  const charges = await stripe.charges.list({ customer: customerId, limit: 1 });
  const bd = charges.data[0]?.billing_details ?? null;
  if (bd) await persistBuyerDetails(admin, stripe, userId, customerId, bd);
}

export interface StripeWebhookDeps {
  /** Mirror an applied subscription event into the CMS (admin read model). */
  projectSubscription?: (event: Stripe.Event, stripe: Stripe) => Promise<void>;
}

export async function handleStripeWebhook(
  req: Request,
  deps: StripeWebhookDeps = {},
): Promise<Response> {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  if (!supabaseUrl || !serviceKey) {
    return new Response("Server misconfigured", { status: 500 });
  }

  // Signature verification needs only the endpoint secret; a placeholder key
  // keeps the handler working for self-signed test events without an account
  // (Stripe API calls with it fail loudly and are caught per event).
  const stripe = new Stripe(stripeSecret ?? "sk_test_unconfigured_placeholder");
  const admin = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const webhookSecret = await resolveWebhookSecret(admin);
  if (!webhookSecret) {
    return new Response("Webhook not connected", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return new Response(`Signature verification failed: ${message}`, {
      status: 400,
    });
  }

  // Already handled (Stripe redelivers on timeouts and retries): acknowledge.
  const { data: seen } = await admin
    .from("mod_billing_webhook_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();
  if (seen) {
    return Response.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "product.created":
      case "product.updated": {
        await admin
          .from("mod_billing_products")
          .upsert(mapProduct(event.data.object));
        break;
      }
      case "price.created":
      case "price.updated": {
        await admin
          .from("mod_billing_prices")
          .upsert(mapPrice(event.data.object));
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object;
        const { userId: refUserId, customerId } =
          resolveCheckoutCustomer(session);

        // Guest checkout: no app user referenced → match by email or create one.
        let userId = refUserId;
        const email = session.customer_details?.email ?? null;
        if (!userId && email) {
          userId = await resolveOrInviteGuest(
            admin,
            email,
            session.customer_details?.name ?? null,
          );
        }

        // Anonymous buyer (anon account from a favorite) → convert/merge here.
        if (userId && email) {
          userId = await convertOrMergeAnon(admin, userId, email);
        }
        // Persist captured identity (name/phone/address) to profile + customer.
        if (userId) {
          await persistBuyerDetails(
            admin,
            stripe,
            userId,
            customerId ?? undefined,
            session.customer_details,
          );
        }

        if (userId && customerId) {
          await admin
            .from("mod_billing_customers")
            .upsert(
              { user_id: userId, stripe_customer_id: customerId },
              { onConflict: "user_id" },
            );
        }

        // One-time (lifetime) purchases create no subscription, so record an
        // active row keyed by the session id to unlock premium, and tag the user.
        if (userId && session.mode === "payment") {
          const items = await stripe.checkout.sessions.listLineItems(
            session.id,
            { limit: 1 },
          );
          const priceId = items.data[0]?.price?.id ?? null;
          if (priceId) {
            await admin.from("mod_billing_subscriptions").upsert({
              id: session.id,
              user_id: userId,
              price_id: priceId,
              status: "active",
              quantity: 1,
              cancel_at_period_end: false,
              current_period_end: null,
            });
            await ensurePlanTag(admin, userId, priceId);
          }
        }

        // Subscription mode: persist the subscription here too (not just from the
        // customer.subscription.* event), so guest checkouts link correctly
        // regardless of Stripe's event ordering.
        if (userId && session.mode === "subscription" && session.subscription) {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          // The CMS copy follows from the customer.subscription.* event that
          // Stripe sends for the same subscription.
          await applySubscription(
            admin,
            mapSubscription(sub, userId),
            event.created,
          );
          if (sub.status === "active" || sub.status === "trialing") {
            await ensurePlanTag(
              admin,
              userId,
              sub.items.data[0]?.price.id ?? null,
            );
          }
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const customerId = subscriptionCustomerId(sub);
        let userId = subscriptionUserIdFromMetadata(sub);
        if (!userId) {
          const { data } = await admin
            .from("mod_billing_customers")
            .select("user_id")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();
          userId = data?.user_id ?? null;
        }
        // Guest who paid via the EMBEDDED wallet flow without an anonymous
        // session: no metadata user, no mapping yet. Match the customer's email
        // to an account (or create one + email an invite), same as guest
        // Checkout. Not for the deleted event (don't resurrect accounts). The
        // host's /api/mod/billing/guest-account route is the primary, synchronous
        // path (it runs at "Continue"/"Maybe later"); this is the idempotent
        // backstop for when that call didn't run or didn't land.
        //
        // SECURITY: gate this email-match linking on a PAID status. /express-intent
        // creates the Stripe customer with an arbitrary, unverified client email
        // and an unpaid `default_incomplete` subscription; without the paid gate,
        // that unpaid event would match a victim's account by email and overwrite
        // their mod_billing_customers mapping to the attacker's Stripe customer
        // (cross-account invoice/PII leak) — all with no payment.
        const paidSub = sub.status === "active" || sub.status === "trialing";
        if (
          !userId &&
          paidSub &&
          event.type !== "customer.subscription.deleted"
        ) {
          const customer = await stripe.customers.retrieve(customerId);
          if (!customer.deleted && customer.email) {
            userId = await resolveOrInviteGuest(
              admin,
              customer.email,
              customer.name ?? null,
            );
          }
        }
        if (userId) {
          // Persist the customer mapping so later portal/upgrade calls resolve
          // it (checkout.session.completed isn't fired by the embedded flow).
          await admin
            .from("mod_billing_customers")
            .upsert(
              { user_id: userId, stripe_customer_id: customerId },
              { onConflict: "user_id" },
            );
          const applied = await applySubscription(
            admin,
            mapSubscription(sub, userId),
            event.created,
          );
          // Keep the read-only CMS copy (admin Users / Plans pages) in step —
          // only when this event is the newest, so it can't roll back either.
          if (applied && deps.projectSubscription) {
            try {
              await deps.projectSubscription(event, stripe);
            } catch (err) {
              console.error(
                "[billing] CMS subscription projection failed",
                err,
              );
            }
          }
          if (sub.status === "active" || sub.status === "trialing") {
            await ensurePlanTag(
              admin,
              userId,
              sub.items.data[0]?.price.id ?? null,
            );
          }
          // Embedded checkout has no checkout.session — capture the buyer's
          // identity from the first charge on creation.
          if (event.type === "customer.subscription.created") {
            // Best-effort enrichment: the subscription is already applied, so
            // a Stripe API hiccup here mustn't fail (and re-deliver) the event.
            await persistFromLatestCharge(
              admin,
              stripe,
              userId,
              customerId,
            ).catch((err: unknown) => {
              console.warn("[billing] buyer details capture failed", err);
            });
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("[billing] stripe webhook handler error", err);
    // Not recorded: Stripe retries, and the next attempt re-applies it.
    return new Response("Handler error", { status: 500 });
  }

  // Recorded only after a successful apply, so a failed attempt is retried.
  await admin
    .from("mod_billing_webhook_events")
    .upsert({ id: event.id, type: event.type }, { onConflict: "id" });

  return Response.json({ received: true });
}

/**
 * The endpoint's signing secret: STRIPE_WEBHOOK_SECRET when set, else the one
 * `ensureStripeWebhook()` stored in Supabase Vault when it registered the
 * endpoint through the Stripe API (no dashboard step). Cached per instance.
 */
let cachedSecret: string | null | undefined;
async function resolveWebhookSecret(
  admin: SupabaseClient,
): Promise<string | null> {
  if (process.env.STRIPE_WEBHOOK_SECRET)
    return process.env.STRIPE_WEBHOOK_SECRET;
  if (cachedSecret) return cachedSecret;
  const { data } = await admin.rpc("mod_billing_webhook_secret");
  cachedSecret = data ?? null;
  return cachedSecret;
}

/** Forget the cached secret (after ensureStripeWebhook rotates it). */
export function resetWebhookSecretCache(): void {
  cachedSecret = undefined;
}
