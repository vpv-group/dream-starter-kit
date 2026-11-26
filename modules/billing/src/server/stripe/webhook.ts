import "server-only";

import type { SupabaseClient as BaseSupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import type { Database, Json } from "@acme/api";

import { createAdminClient } from "../admin-client";
import {
  mapPrice,
  mapProduct,
  mapSubscription,
  resolveCheckoutCustomer,
  splitBuyerEmails,
  subscriptionCustomerId,
  subscriptionUserIdFromMetadata,
} from "./mapping";

type SupabaseClient = BaseSupabaseClient<Database>;

// Stripe webhook → syncs products / prices / customers / subscriptions into the
// DB using the SERVICE ROLE (clients never write billing rows). The ONE place
// Stripe state enters the app (public.mod_billing_* is the source of truth that
// web, mobile and the CMS read). Signature is verified; every event is
// CLAIMED before its side effects run (mod_billing_claim_webhook_event), so a
// redelivery — even one arriving while the first is still running — is never
// applied twice. customer.subscription.* events apply the subscription as
// re-fetched from Stripe (delivery order stops mattering), and writes go
// through mod_billing_apply_subscription(), which also ignores an event older
// than the one already applied.
//
// It also drives the "checkout-first" signup flow: when an anonymous visitor
// pays, this matches the checkout email to an existing user (and attaches the
// subscription) or creates the account and emails a Supabase invite. Active
// plans tag the user with the plan name (public.user_tags).
//
// Served at POST /api/mod/billing/stripe/webhook (a module public route — Stripe
// has no Supabase session). Local: `stripe listen --forward-to
// localhost:3000/api/mod/billing/stripe/webhook`.

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

/** The account (login) email, or null when it can't be read. */
async function accountEmailOf(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) return null;
    return data.user.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Persist the buyer's captured identity to their profile + Stripe customer.
 *
 * The account email is the buyer's identity and is never replaced by a
 * different wallet email (splitBuyerEmails): the Stripe customer's email is
 * pinned to the account email, and a differing wallet / checkout email is
 * stored as mod_billing_customers.billing_email (and in the customer's
 * metadata.billing_email) instead. Call it after the customer mapping is
 * written, so the billing email has a row to land on.
 */
export async function persistBuyerDetails(
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

  const emails = splitBuyerEmails(
    await accountEmailOf(admin, userId),
    details.email,
  );
  if (emails.billingEmail !== undefined) {
    const { error } = await admin
      .from("mod_billing_customers")
      .update({ billing_email: emails.billingEmail })
      .eq("user_id", userId);
    if (error) {
      console.warn("[billing] could not store billing email:", error.message);
    }
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
  if (emails.billingEmail) meta.billing_email = emails.billingEmail;
  if (Object.keys(meta).length) {
    await admin.auth.admin
      .updateUserById(userId, { user_metadata: meta })
      .then(undefined, () => undefined);
  }
  if (customerId) {
    await stripe.customers
      .update(customerId, {
        name: details.name ?? undefined,
        // Pinned to the account email; never the wallet email.
        ...(emails.customerEmail ? { email: emails.customerEmail } : {}),
        phone: details.phone ?? undefined,
        // Stripe's AddressParam doesn't accept nulls; drop empty fields.
        address: details.address
          ? (Object.fromEntries(
              Object.entries(details.address).filter(([, v]) => v != null),
            ) as Stripe.AddressParam)
          : undefined,
        // Stripe merges metadata keys; "" removes the key.
        ...(emails.billingEmail !== undefined
          ? { metadata: { billing_email: emails.billingEmail ?? "" } }
          : {}),
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

/**
 * The subscription's CURRENT state, re-fetched from Stripe, so the order
 * events arrive in stops mattering: whichever delivery runs last writes what
 * Stripe holds now, not what its (possibly stale) payload said. Falls back to
 * the event payload when there's no Stripe key (self-signed test events) or
 * the retrieve fails; the ordering guard in mod_billing_apply_subscription()
 * still covers that path.
 */
export async function currentSubscription(
  stripe: Pick<Stripe, "subscriptions"> | null,
  fromEvent: Stripe.Subscription,
): Promise<{ sub: Stripe.Subscription; fresh: boolean }> {
  if (!stripe) return { sub: fromEvent, fresh: false };
  try {
    const sub = await stripe.subscriptions.retrieve(fromEvent.id);
    return { sub, fresh: true };
  } catch (err) {
    console.warn(
      "[billing] subscription re-fetch failed; applying the event payload",
      err instanceof Error ? err.message : err,
    );
    return { sub: fromEvent, fresh: false };
  }
}

export type ClaimResult = "claimed" | "duplicate" | "busy";

/**
 * Claim the event BEFORE running any side effect (mod_billing_claim_webhook_
 * event, atomic): two concurrent deliveries of one event can't both send the
 * guest invite or write the tags. A claim abandoned for over five minutes is
 * taken over.
 */
async function claimEvent(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<ClaimResult> {
  const { data, error } = await admin.rpc("mod_billing_claim_webhook_event", {
    _id: event.id,
    _type: event.type,
  });
  if (error) throw new Error(error.message);
  if (data === "claimed" || data === "duplicate" || data === "busy") {
    return data;
  }
  throw new Error(`unexpected claim result: ${String(data)}`);
}

export interface StripeWebhookDeps {
  /** Mirror an applied subscription event into the CMS (admin read model). */
  projectSubscription?: (event: Stripe.Event, stripe: Stripe) => Promise<void>;
  /** Tests: the service-role client (default: createAdminClient()). */
  admin?: SupabaseClient;
  /** Tests: the Stripe client (default: one built from STRIPE_SECRET_KEY).
   *  Passing one counts as "Stripe is reachable" (subscriptions re-fetched). */
  stripe?: Stripe;
}

export async function handleStripeWebhook(
  req: Request,
  deps: StripeWebhookDeps = {},
): Promise<Response> {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  let admin: SupabaseClient;
  try {
    // The module's service-role client (accepts SUPABASE_SECRET_KEY too).
    admin = deps.admin ?? createAdminClient();
  } catch {
    return new Response("Server misconfigured", { status: 500 });
  }

  // Signature verification needs only the endpoint secret; a placeholder key
  // keeps the handler working for self-signed test events without an account
  // (Stripe API calls with it fail loudly and are caught per event).
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const stripe =
    deps.stripe ??
    new Stripe(stripeSecret ?? "sk_test_unconfigured_placeholder");
  const liveStripe = deps.stripe !== undefined || Boolean(stripeSecret);
  const secrets = await resolveWebhookSecrets(admin);
  if (secrets.length === 0) {
    return new Response("Webhook not connected", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const payload = await req.text();
  // Either secret may have signed it: STRIPE_WEBHOOK_SECRET (an endpoint you
  // manage, or a pre-2.5 install's) or the one the app registered (Vault).
  let event: Stripe.Event | null = null;
  let lastError = "unknown";
  for (const secret of secrets) {
    try {
      event = await stripe.webhooks.constructEventAsync(
        payload,
        signature,
        secret,
      );
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "unknown";
    }
  }
  if (!event) {
    return new Response(`Signature verification failed: ${lastError}`, {
      status: 400,
    });
  }

  // Claim first (Stripe redelivers on timeouts and retries, sometimes while
  // the first delivery is still running).
  let claim: ClaimResult;
  try {
    claim = await claimEvent(admin, event);
  } catch (err) {
    console.error("[billing] could not claim stripe event", err);
    return new Response("Could not claim event", { status: 500 });
  }
  if (claim === "duplicate") {
    return Response.json({ received: true, duplicate: true });
  }
  if (claim === "busy") {
    // Another delivery is applying it right now: a non-2xx makes Stripe retry
    // later, by when it's done (→ duplicate) or abandoned (→ taken over).
    return new Response("Event is being processed", { status: 409 });
  }

  try {
    await applyEvent(admin, stripe, event, {
      liveStripe,
      projectSubscription: deps.projectSubscription,
    });
  } catch (err) {
    console.error("[billing] stripe webhook handler error", err);
    // Release the claim so Stripe's retry can apply it.
    const { error } = await admin
      .from("mod_billing_webhook_events")
      .delete()
      .eq("id", event.id)
      .eq("status", "processing");
    if (error) {
      console.error("[billing] could not release event claim", error.message);
    }
    return new Response("Handler error", { status: 500 });
  }

  const { error: doneError } = await admin
    .from("mod_billing_webhook_events")
    .update({ status: "done" })
    .eq("id", event.id);
  if (doneError) {
    // Applied, so still acknowledge; the claim is taken over (and the
    // idempotent writes re-run) only if Stripe redelivers after 5 minutes.
    console.error("[billing] could not mark event done", doneError.message);
  }
  return Response.json({ received: true });
}

/** Apply one verified, claimed event. Throws to have Stripe retry it. */
async function applyEvent(
  admin: SupabaseClient,
  stripe: Stripe,
  event: Stripe.Event,
  opts: {
    liveStripe: boolean;
    projectSubscription?: StripeWebhookDeps["projectSubscription"];
  },
): Promise<void> {
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

      if (userId && customerId) {
        await admin
          .from("mod_billing_customers")
          .upsert(
            { user_id: userId, stripe_customer_id: customerId },
            { onConflict: "user_id" },
          );
      }
      // Persist captured identity (name/phone/address, a differing billing
      // email) to profile + customer — after the mapping above, which holds
      // the billing email.
      if (userId) {
        await persistBuyerDetails(
          admin,
          stripe,
          userId,
          customerId ?? undefined,
          session.customer_details,
        );
      }

      // One-time (lifetime) purchases create no subscription, so record an
      // active row keyed by the session id to unlock premium, and tag the user.
      if (userId && session.mode === "payment") {
        const items = await stripe.checkout.sessions.listLineItems(session.id, {
          limit: 1,
        });
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
      // Apply what Stripe holds NOW, not the payload: deliveries arrive in any
      // order, and a re-fetched state is right whichever one runs last.
      //
      // It is still stamped with event.created, not now(): the ordering guard
      // in mod_billing_apply_subscription() then compares Stripe's clock with
      // Stripe's clock only, so it stays right when this falls back to the
      // payload (no key, retrieve failed) and under clock skew between our
      // instances. Nothing is lost by it: an older event that runs late is
      // skipped even though its fetched state is current, but every change
      // after the newer event emits its own, later event, which applies it.
      // Events in the same second pass the guard (>=), and the one processed
      // last fetched the newest state.
      const { sub } = await currentSubscription(
        opts.liveStripe ? stripe : null,
        event.data.object,
      );
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
        // It gets the same (re-fetched) state the row was written from.
        if (applied && opts.projectSubscription) {
          try {
            await opts.projectSubscription(
              { ...event, data: { ...event.data, object: sub } },
              stripe,
            );
          } catch (err) {
            console.error("[billing] CMS subscription projection failed", err);
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
}

/**
 * The signing secrets a delivery may carry: STRIPE_WEBHOOK_SECRET when set
 * (an endpoint you manage — or, on installs upgraded from 2.4 or earlier, the old edge
 * function's secret), then the one `ensureStripeWebhook()` stored in Supabase
 * Vault when it registered the endpoint through the Stripe API. Vault value
 * cached per instance.
 */
let cachedSecret: string | null | undefined;
async function resolveWebhookSecrets(admin: SupabaseClient): Promise<string[]> {
  if (cachedSecret === undefined) {
    const { data } = await admin.rpc("mod_billing_webhook_secret");
    cachedSecret = data ?? null;
  }
  return [process.env.STRIPE_WEBHOOK_SECRET, cachedSecret].filter(
    (s): s is string => Boolean(s),
  );
}

/** Forget the cached secret (after ensureStripeWebhook rotates it). */
export function resetWebhookSecretCache(): void {
  cachedSecret = undefined;
}
