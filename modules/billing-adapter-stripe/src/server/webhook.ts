import "server-only";

import type { BasePayload } from "payload";
import Stripe from "stripe";

import type {
  AdminClient,
  ClaimResult,
  CmsSubscriptionInput,
} from "@acme/mod-billing/server";
import {
  accountEmailOf,
  claimWebhookEvent,
  convertOrMergeAnon,
  createAdminClient,
  findCustomerSubject,
  finishWebhookEvent,
  linkCustomer,
  linkOrgCustomer,
  recordSubscription,
  resolveOrInviteGuest,
  setBillingEmail,
  siteUrl,
  upsertPrice,
  upsertProduct,
  workspaceOwnerId,
} from "@acme/mod-billing/server";

import { getStripeOrNull } from "../stripe/client";
import {
  isoOrNull,
  normalizePrice,
  normalizeProduct,
  normalizeSubscription,
  ON_SITE_ONE_TIME,
  resolveCheckoutCustomer,
  splitBuyerEmails,
  subscriptionCustomerId,
  subscriptionOrgIdFromMetadata,
  subscriptionUserIdFromMetadata,
} from "./mapping";

// The ONE Stripe webhook → billing's purchase ledger. Signature verified;
// every event is CLAIMED before its side effects run (billing's
// claimWebhookEvent), so a redelivery — even one arriving while the first is
// still running — is never applied twice. customer.subscription.* events
// apply the subscription as re-fetched from Stripe (delivery order stops
// mattering), and billing's applySubscription ignores an event older than the
// one already applied. All writes go through billing's core services — the
// adapter owns no tables.
//
// It also drives the "checkout-first" signup flow: when an anonymous visitor
// pays, this matches the checkout email to an existing user (and attaches the
// purchase) or creates the account and emails a Supabase invite.
//
// Served at POST /api/mod/billing-adapter-stripe/webhook (a public module
// route — Stripe has no session). Local: `stripe listen --forward-to
// localhost:3000/api/mod/billing-adapter-stripe/webhook`.

const PROVIDER = "stripe";

/** Name/email/phone/address from Checkout `customer_details` OR a charge's
 *  `billing_details` — structurally the same shape. */
interface BuyerContact {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: Stripe.Address | null;
}

/**
 * Persist the buyer's captured identity to their profile + Stripe customer.
 *
 * The account email is the buyer's identity and is never replaced by a
 * different wallet email (splitBuyerEmails): the Stripe customer's email is
 * pinned to the account email, and a differing wallet / checkout email is
 * stored as the billing email on the customer link (and in the customer's
 * metadata.billing_email) instead. Call it after the customer is linked, so
 * the billing email has a row to land on.
 */
export async function persistBuyerDetails(
  admin: AdminClient,
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
    await setBillingEmail(admin, userId, PROVIDER, emails.billingEmail);
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
  admin: AdminClient,
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
 * the retrieve fails; billing's ordering guard still covers that path.
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
      "[stripe] subscription re-fetch failed; applying the event payload",
      err instanceof Error ? err.message : err,
    );
    return { sub: fromEvent, fresh: false };
  }
}

export type { ClaimResult };

export interface StripeWebhookDeps {
  /** Mirror an applied subscription into the CMS (admin read model). */
  projectSubscription?: (sub: CmsSubscriptionInput) => Promise<void>;
  /** For billing tag names (Billing → Tags); default names without it. */
  getPayload?: () => Promise<BasePayload>;
  /** Tests: the service-role client (default: createAdminClient()). */
  admin?: AdminClient;
  /** Tests: the Stripe client (default: the connected/env credential).
   *  Passing one counts as "Stripe is reachable" (subscriptions re-fetched). */
  stripe?: Stripe;
  /** Tests: the signing secrets (default: env + Vault). */
  secrets?: string[];
}

export async function handleStripeWebhook(
  req: Request,
  deps: StripeWebhookDeps = {},
): Promise<Response> {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  let admin: AdminClient;
  try {
    admin = deps.admin ?? createAdminClient();
  } catch {
    return new Response("Server misconfigured", { status: 500 });
  }

  // Signature verification needs only the endpoint secret; without a
  // credential a placeholder client still verifies self-signed test events
  // (Stripe API calls with it fail loudly and are caught per event).
  const connected = deps.stripe ?? (await getStripeOrNull());
  const stripe = connected ?? new Stripe("sk_test_unconfigured_placeholder");
  const liveStripe = connected !== null;
  const secrets = deps.secrets ?? (await resolveWebhookSecrets(admin));
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
    claim = await claimWebhookEvent(admin, PROVIDER, event.id, event.type);
  } catch (err) {
    console.error("[stripe] could not claim event", err);
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
      getPayload: deps.getPayload,
    });
  } catch (err) {
    console.error("[stripe] webhook handler error", err);
    // Release the claim so Stripe's retry can apply it.
    await finishWebhookEvent(admin, PROVIDER, event.id, false);
    return new Response("Handler error", { status: 500 });
  }

  await finishWebhookEvent(admin, PROVIDER, event.id, true);
  return Response.json({ received: true });
}

/** Apply one verified, claimed event. Throws to have Stripe retry it. */
async function applyEvent(
  admin: AdminClient,
  stripe: Stripe,
  event: Stripe.Event,
  opts: {
    liveStripe: boolean;
    projectSubscription?: StripeWebhookDeps["projectSubscription"];
    getPayload?: StripeWebhookDeps["getPayload"];
  },
): Promise<void> {
  const record = { getPayload: opts.getPayload };
  switch (event.type) {
    case "product.created":
    case "product.updated": {
      await upsertProduct(admin, normalizeProduct(event.data.object));
      break;
    }
    case "price.created":
    case "price.updated": {
      await upsertPrice(admin, normalizePrice(event.data.object));
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
          siteUrl(),
        );
      }

      // Anonymous buyer (anon account from a favorite) → convert/merge here.
      if (userId && email) {
        userId = await convertOrMergeAnon(admin, userId, email);
      }

      // Bought for a workspace (our checkout stamped it after checking the
      // buyer is an owner/admin): the customer is the workspace's.
      const orgId = session.metadata?.org_id ?? null;
      if (customerId && orgId) {
        await linkOrgCustomer(admin, {
          orgId,
          provider: PROVIDER,
          customerId,
        });
      } else if (userId && customerId) {
        await linkCustomer(admin, {
          userId,
          provider: PROVIDER,
          customerId,
        });
      }
      // Persist captured identity (name/phone/address, a differing billing
      // email) to profile + customer — after the link above, which holds the
      // billing email. Not for a workspace customer (it isn't the buyer's).
      if (userId && !orgId) {
        await persistBuyerDetails(
          admin,
          stripe,
          userId,
          customerId ?? undefined,
          session.customer_details,
        );
      }

      // One-time (lifetime) purchases create no subscription: record an
      // active one-time purchase keyed by the session id.
      if (userId && session.mode === "payment") {
        const items = await stripe.checkout.sessions.listLineItems(session.id, {
          limit: 1,
        });
        const price = items.data[0]?.price ?? null;
        if (price) {
          await recordSubscription(
            admin,
            {
              provider: PROVIDER,
              id: session.id,
              userId,
              priceId: price.id,
              status: "active",
              quantity: 1,
              cancelAtPeriodEnd: false,
              currentPeriodEnd: null,
              kind: "one_time",
              planId:
                session.metadata?.plan_id ?? price.metadata.payloadId ?? null,
              store: "web",
              environment: event.livemode ? "live" : "test",
              orgId,
            },
            null,
            record,
          );
        }
      }

      // Subscription mode: persist the subscription here too (not just from
      // the customer.subscription.* event), so guest checkouts link correctly
      // regardless of Stripe's event ordering.
      if (userId && session.mode === "subscription" && session.subscription) {
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
        const sub = await stripe.subscriptions.retrieve(subId);
        // The CMS copy follows from the customer.subscription.* event that
        // Stripe sends for the same subscription.
        await recordSubscription(
          admin,
          normalizeSubscription(sub, userId, { livemode: event.livemode }),
          new Date(event.created * 1000),
          record,
        );
      }
      break;
    }
    case "payment_intent.succeeded": {
      const pi = event.data.object;
      if (pi.metadata.purchase !== ON_SITE_ONE_TIME) break;
      const userId = pi.metadata.supabase_user_id ?? null;
      const orgId = pi.metadata.org_id ?? null;
      const priceId = pi.metadata.price_id ?? null;
      if (!userId || !priceId) {
        console.warn(
          `[billing-adapter-stripe] one-time payment ${pi.id} has no buyer or price in its metadata; not recorded`,
        );
        break;
      }
      const customerId =
        typeof pi.customer === "string"
          ? pi.customer
          : (pi.customer?.id ?? null);
      if (customerId && orgId) {
        await linkOrgCustomer(admin, { orgId, provider: PROVIDER, customerId });
      } else if (customerId) {
        await linkCustomer(admin, { userId, provider: PROVIDER, customerId });
      }
      await recordSubscription(
        admin,
        {
          provider: PROVIDER,
          id: pi.id,
          userId,
          priceId,
          status: "active",
          quantity: 1,
          cancelAtPeriodEnd: false,
          currentPeriodEnd: null,
          kind: "one_time",
          planId: pi.metadata.plan_id ?? null,
          store: "web",
          environment: event.livemode ? "live" : "test",
          orgId,
        },
        null,
        record,
      );
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      // Apply what Stripe holds NOW, not the payload: deliveries arrive in any
      // order, and a re-fetched state is right whichever one runs last.
      //
      // It is still stamped with event.created, not now(): the ordering guard
      // then compares Stripe's clock with Stripe's clock only, so it stays
      // right when this falls back to the payload (no key, retrieve failed)
      // and under clock skew between our instances. Nothing is lost by it: an
      // older event that runs late is skipped even though its fetched state
      // is current, but every change after the newer event emits its own,
      // later event, which applies it. Events in the same second pass the
      // guard (>=), and the one processed last fetched the newest state.
      const { sub } = await currentSubscription(
        opts.liveStripe ? stripe : null,
        event.data.object,
      );
      const customerId = subscriptionCustomerId(sub);
      // Whose purchase: the metadata our checkout stamped, else the customer
      // link (a person's or a workspace's).
      const linked = await findCustomerSubject(admin, PROVIDER, customerId);
      const orgId = subscriptionOrgIdFromMetadata(sub) ?? linked?.orgId ?? null;
      let userId =
        subscriptionUserIdFromMetadata(sub) ??
        linked?.userId ??
        (orgId ? await workspaceOwnerId(admin, orgId) : null);
      // Guest who paid via the EMBEDDED wallet flow without an anonymous
      // session: no metadata user, no link yet. Match the customer's email to
      // an account (or create one + email an invite), same as guest Checkout.
      // Not for the deleted event (don't resurrect accounts). The
      // /guest-account route is the primary, synchronous path (it runs at
      // "Continue"/"Maybe later"); this is the idempotent backstop for when
      // that call didn't run or didn't land.
      //
      // SECURITY: gate this email-match linking on a PAID status.
      // /express-intent creates the Stripe customer with an arbitrary,
      // unverified client email and an unpaid `default_incomplete`
      // subscription; without the paid gate, that unpaid event would match a
      // victim's account by email and overwrite their customer link to the
      // attacker's Stripe customer (cross-account invoice/PII leak) — all
      // with no payment.
      const paidSub = sub.status === "active" || sub.status === "trialing";
      let customerEmail: string | null = null;
      if (
        !userId &&
        paidSub &&
        event.type !== "customer.subscription.deleted"
      ) {
        const customer = await stripe.customers.retrieve(customerId);
        if (!customer.deleted && customer.email) {
          customerEmail = customer.email;
          userId = await resolveOrInviteGuest(
            admin,
            customer.email,
            customer.name ?? null,
            siteUrl(),
          );
        }
      }
      if (userId) {
        // Link the customer so later portal/upgrade calls resolve it
        // (checkout.session.completed isn't fired by the embedded flow).
        if (orgId) {
          await linkOrgCustomer(admin, {
            orgId,
            provider: PROVIDER,
            customerId,
          });
        } else {
          await linkCustomer(admin, {
            userId,
            provider: PROVIDER,
            customerId,
          });
        }
        const normalized = {
          ...normalizeSubscription(sub, userId, { livemode: event.livemode }),
          orgId,
        };
        const applied = await recordSubscription(
          admin,
          normalized,
          new Date(event.created * 1000),
          record,
        );
        // Keep the read-only CMS copy (admin Users / Plans pages) in step —
        // only when this event is the newest, so it can't roll back either.
        // It gets the same (re-fetched) state the row was written from.
        if (applied && opts.projectSubscription) {
          const item = sub.items.data[0];
          try {
            await opts.projectSubscription({
              ...normalized,
              customerId,
              customerEmail,
              deleted: event.type === "customer.subscription.deleted",
              startedAt: isoOrNull(sub.start_date),
              trialEndsAt: isoOrNull(sub.trial_end),
              currentPeriodStart: isoOrNull(item?.current_period_start),
              canceledAt: isoOrNull(sub.canceled_at),
            });
          } catch (err) {
            console.error("[stripe] CMS subscription projection failed", err);
          }
        }
        // Embedded checkout has no checkout.session — capture the buyer's
        // identity from the first charge on creation.
        if (event.type === "customer.subscription.created" && !orgId) {
          // Best-effort enrichment: the subscription is already applied, so
          // a Stripe API hiccup here mustn't fail (and re-deliver) the event.
          await persistFromLatestCharge(
            admin,
            stripe,
            userId,
            customerId,
          ).catch((err: unknown) => {
            console.warn("[stripe] buyer details capture failed", err);
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
 * (an endpoint you manage — or, on installs upgraded from 2.4 or earlier, the
 * old edge function's secret), then the one `ensureStripeWebhook()` stored in
 * Supabase Vault when it registered the endpoint through the Stripe API.
 * Vault value cached per instance.
 */
let cachedSecret: string | null | undefined;
async function resolveWebhookSecrets(admin: AdminClient): Promise<string[]> {
  if (cachedSecret === undefined) {
    const { data } = await admin.rpc(
      "mod_billing_adapter_stripe_webhook_secret",
    );
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
