import crypto from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, request, test } from "@playwright/test";

import { FOUNDER_STORAGE_STATE } from "./helpers/founder";

/**
 * Subscription pipeline coverage, in two independent layers:
 *
 * 1. "subscriptions webhook" — the ONE Stripe endpoint
 *    (POST /api/mod/billing/stripe/webhook) that writes public.mod_billing_*
 *    and projects subscriptions into the read-only CMS `subscriptions`
 *    collection. The spec signs its own synthetic events with
 *    STRIPE_WEBHOOK_SECRET (the same HMAC scheme `stripe listen` uses), so it
 *    runs with NO Stripe account — CI sets a throwaway secret. Also pins the
 *    security posture: bad signatures are rejected, a replayed event is not
 *    applied twice (nor are two concurrent deliveries of it), an OLDER event
 *    can't roll a subscription back, the REST
 *    proxy is off, and the collection's access control holds.
 *
 * 2. "stripe checkout (test mode)" — real Stripe Checkout subscription
 *    creation as an authenticated user AND as a guest, paying with the
 *    standard test card 4242 4242 4242 4242 (https://docs.stripe.com/testing).
 *    Needs a real TEST-mode STRIPE_SECRET_KEY in .env (and network access to
 *    stripe.com), so it auto-skips when unset. The flow also exercises the
 *    automatic plan → Stripe sync: saving a plan from the CMS REST API is
 *    what provisions its Stripe price.
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const WEBHOOK_PATH = "/api/mod/billing/stripe/webhook";
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

/** Sign a payload the way Stripe does (`t=<unix>,v1=<hmac-sha256>`). */
function stripeSignature(payload: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${payload}`)
    .digest("hex");
  return `t=${t},v1=${v1}`;
}

/** A minimal customer.subscription.* event the webhook handler reads. */
function subscriptionEvent(
  subId: string,
  opts: {
    userId?: string;
    status?: string;
    type?: string;
    created?: number;
    eventId?: string;
  } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: opts.eventId ?? `evt_e2e_${subId}_${opts.status ?? "active"}`,
    object: "event",
    type: opts.type ?? "customer.subscription.created",
    created: opts.created ?? now,
    data: {
      object: {
        id: subId,
        object: "subscription",
        customer: "cus_e2e_does_not_exist",
        status: opts.status ?? "active",
        metadata: opts.userId ? { supabase_user_id: opts.userId } : {},
        start_date: now,
        trial_end: null,
        cancel_at_period_end: false,
        canceled_at: null,
        items: {
          data: [
            {
              id: "si_e2e",
              quantity: 1,
              price: { id: "price_e2e_does_not_exist" },
              current_period_start: now,
              current_period_end: now + 30 * 24 * 3600,
            },
          ],
        },
      },
    },
  };
}

async function postEvent(event: unknown, secret = WEBHOOK_SECRET ?? "") {
  const body = JSON.stringify(event);
  const anon = await request.newContext({ baseURL: BASE_URL });
  const res = await anon.post(WEBHOOK_PATH, {
    headers: {
      "content-type": "application/json",
      "stripe-signature": stripeSignature(body, secret),
    },
    data: body,
  });
  const out = { status: res.status(), body: await res.text() };
  await anon.dispose();
  return out;
}

/** The founder's Supabase user id (the CMS user's supabaseUserId). */
async function founderUserId(): Promise<string> {
  const staff = await request.newContext({
    baseURL: BASE_URL,
    storageState: FOUNDER_STORAGE_STATE,
  });
  const me = (await (await staff.get("/cms-api/users/me")).json()) as {
    user: { supabaseUserId: string };
  };
  await staff.dispose();
  return me.user.supabaseUserId;
}

async function cmsSubscription(subId: string) {
  const staff = await request.newContext({
    baseURL: BASE_URL,
    storageState: FOUNDER_STORAGE_STATE,
  });
  const found = await staff.get(
    `/cms-api/mod-billing-subscriptions?where[stripeSubscriptionID][equals]=${subId}`,
  );
  const json = found.ok()
    ? ((await found.json()) as {
        totalDocs: number;
        docs: {
          status: string;
          stripeCustomerID: string;
          cancelAtPeriodEnd: boolean;
        }[];
      })
    : { totalDocs: 0, docs: [] };
  await staff.dispose();
  return json;
}

test.describe("subscriptions webhook", () => {
  test.skip(
    !WEBHOOK_SECRET,
    "STRIPE_WEBHOOK_SECRET not set — the webhook can't verify test events",
  );

  test("a signed subscription event is applied and projected into the CMS", async () => {
    const subId = `sub_e2e_${Date.now()}`;
    const userId = await founderUserId();
    const res = await postEvent(subscriptionEvent(subId, { userId }));
    expect(res.status).toBe(200);

    await expect
      .poll(async () => (await cmsSubscription(subId)).totalDocs, {
        timeout: 20_000,
      })
      .toBe(1);
    expect((await cmsSubscription(subId)).docs[0]).toMatchObject({
      status: "active",
      stripeCustomerID: "cus_e2e_does_not_exist",
      cancelAtPeriodEnd: false,
    });
  });

  test("a replayed event is acknowledged but not applied twice", async () => {
    const subId = `sub_e2e_replay_${Date.now()}`;
    const userId = await founderUserId();
    const event = subscriptionEvent(subId, { userId });
    expect((await postEvent(event)).status).toBe(200);
    const again = await postEvent(event);
    expect(again.status).toBe(200);
    expect(JSON.parse(again.body)).toMatchObject({ duplicate: true });
  });

  test("concurrent deliveries of one event are applied once", async () => {
    const subId = `sub_e2e_concurrent_${Date.now()}`;
    const userId = await founderUserId();
    const event = subscriptionEvent(subId, {
      userId,
      eventId: `evt_e2e_concurrent_${Date.now()}`,
    });
    const isDuplicate = (r: { status: number; body: string }) => {
      if (r.status !== 200) return false;
      try {
        return (
          (JSON.parse(r.body) as { duplicate?: boolean }).duplicate === true
        );
      } catch {
        return false;
      }
    };
    // Stripe redelivers while the first attempt is still running: the event
    // is claimed before any side effect, so only one delivery applies it.
    const results = await Promise.all([postEvent(event), postEvent(event)]);
    const applied = results.filter((r) => r.status === 200 && !isDuplicate(r));
    expect(applied).toHaveLength(1);
    // The other one saw the claim (409 → Stripe retries later) or, if it
    // arrived after the first finished, the handled event.
    const other = results.find((r) => r !== applied[0]);
    expect(other && (other.status === 409 || isDuplicate(other))).toBe(true);
    // Stripe's retry afterwards is acknowledged as a duplicate.
    expect(isDuplicate(await postEvent(event))).toBe(true);
    await expect
      .poll(async () => (await cmsSubscription(subId)).totalDocs, {
        timeout: 20_000,
      })
      .toBe(1);
  });

  test("an older event arriving late doesn't roll the subscription back", async () => {
    const subId = `sub_e2e_order_${Date.now()}`;
    const userId = await founderUserId();
    const now = Math.floor(Date.now() / 1000);
    // Newer cancellation first, then the older "active" update.
    expect(
      (
        await postEvent(
          subscriptionEvent(subId, {
            userId,
            status: "canceled",
            type: "customer.subscription.deleted",
            created: now,
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await postEvent(
          subscriptionEvent(subId, {
            userId,
            status: "active",
            type: "customer.subscription.updated",
            created: now - 120,
          }),
        )
      ).status,
    ).toBe(200);
    await expect
      .poll(async () => (await cmsSubscription(subId)).docs[0]?.status, {
        timeout: 20_000,
      })
      .not.toBe("active");
  });

  test("an event with a bad signature is rejected", async () => {
    const res = await postEvent(
      subscriptionEvent(`sub_e2e_bad_${Date.now()}`),
      "whsec_wrong_secret",
    );
    expect(res.status).toBe(400);
  });

  test("anonymous clients can neither read nor write subscriptions", async () => {
    const anon = await request.newContext({ baseURL: BASE_URL });
    // read: ownsOrStaff → anonymous is denied outright.
    expect(
      (await anon.get("/cms-api/mod-billing-subscriptions")).status(),
    ).toBe(403);
    // create/update/delete are disabled for every client — only the webhook
    // handler writes, via the Local API with overrideAccess.
    const created = await anon.post("/cms-api/mod-billing-subscriptions", {
      data: { status: "active", stripeSubscriptionID: "sub_forged" },
    });
    expect(created.status()).toBe(403);
    await anon.dispose();
  });

  test("even staff cannot write subscriptions through the API", async () => {
    const staff = await request.newContext({
      baseURL: BASE_URL,
      storageState: FOUNDER_STORAGE_STATE,
    });
    expect(
      (await staff.get("/cms-api/mod-billing-subscriptions")).status(),
    ).toBe(200);
    const created = await staff.post("/cms-api/mod-billing-subscriptions", {
      data: { status: "active", stripeSubscriptionID: "sub_forged_staff" },
    });
    expect(created.status()).toBe(403);
    await staff.dispose();
  });

  test("the Stripe REST proxy is disabled", async () => {
    const staff = await request.newContext({
      baseURL: BASE_URL,
      storageState: FOUNDER_STORAGE_STATE,
    });
    // The Stripe plugin (and its REST proxy) is gone — the route must not exist even
    // for authenticated staff (credentials stay server-side).
    const res = await staff.post("/cms-api/stripe/rest", {
      data: { stripeMethod: "customers.list", stripeArgs: [] },
    });
    expect([404, 403]).toContain(res.status());
    await staff.dispose();
  });
});

test.describe("stripe checkout (test mode)", () => {
  test.skip(
    !STRIPE_KEY?.startsWith("sk_test"),
    "STRIPE_SECRET_KEY (test mode) not set — skipping real Checkout flows",
  );

  /** Save the monthly plan via the CMS API as staff → afterChange hook syncs
   *  it to Stripe; poll until the price id lands (the checkout prerequisite). */
  async function ensureMonthlyPlanSynced(): Promise<void> {
    const staff = await request.newContext({
      baseURL: BASE_URL,
      storageState: FOUNDER_STORAGE_STATE,
    });
    const list = await staff.get(
      "/cms-api/mod-billing-plans?where[slug][equals]=dream-monthly",
    );
    expect(list.ok()).toBeTruthy();
    const { docs } = (await list.json()) as {
      docs: { id: string | number; stripePriceId?: string | null }[];
    };
    const plan = docs[0];
    if (!plan) throw new Error("seeded dream-monthly plan not found");

    if (!plan.stripePriceId) {
      // A no-op save is enough — the afterChange hook pushes to Stripe.
      const saved = await staff.patch(`/cms-api/mod-billing-plans/${plan.id}`, {
        data: {},
      });
      expect(saved.ok()).toBeTruthy();
      await expect
        .poll(
          async () => {
            const res = await staff.get(
              `/cms-api/mod-billing-plans/${plan.id}`,
            );
            const doc = (await res.json()) as {
              stripePriceId?: string | null;
              syncStatus?: string;
              syncError?: string | null;
            };
            if (doc.syncStatus === "error") {
              throw new Error(`Stripe sync failed: ${doc.syncError}`);
            }
            return doc.stripePriceId ?? null;
          },
          { timeout: 30_000 },
        )
        .not.toBeNull();
    }
    await staff.dispose();
  }

  /** Fill Stripe's hosted Checkout with the standard success test card. */
  async function payWithTestCard(
    page: Page,
    opts: { email?: string } = {},
  ): Promise<void> {
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    if (opts.email) {
      const email = page.locator('input[name="email"]');
      if (await email.isVisible().catch(() => false)) {
        await email.fill(opts.email);
      }
    }
    await page.locator("#cardNumber").fill("4242 4242 4242 4242");
    await page.locator("#cardExpiry").fill("12 / 34");
    await page.locator("#cardCvc").fill("123");
    await page.locator("#billingName").fill("E2E Tester");
    const postal = page.locator("#billingPostalCode");
    if (await postal.isVisible().catch(() => false)) {
      await postal.fill("90210");
    }
    await page.locator('[data-testid="hosted-payment-submit-button"]').click();
  }

  /** Assert via the Stripe API that the returned session created a live sub. */
  async function assertSubscriptionCreated(sessionId: string): Promise<void> {
    const auth = { Authorization: `Bearer ${STRIPE_KEY}` };
    const sessionRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
      { headers: auth },
    );
    expect(sessionRes.ok).toBeTruthy();
    const session = (await sessionRes.json()) as {
      status: string;
      subscription: string | null;
    };
    expect(session.status).toBe("complete");
    expect(session.subscription).toBeTruthy();

    const subRes = await fetch(
      `https://api.stripe.com/v1/subscriptions/${session.subscription}`,
      { headers: auth },
    );
    const sub = (await subRes.json()) as { status: string };
    expect(["active", "trialing"]).toContain(sub.status);
  }

  test.describe("as an authenticated user", () => {
    test.use({ storageState: FOUNDER_STORAGE_STATE });

    test("subscribes to the monthly plan with the 4242 test card", async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await ensureMonthlyPlanSynced();

      await page.goto("/pricing");
      // Monthly is the first non-highlighted plan ("Choose plan" CTA).
      await page.getByRole("button", { name: "Choose plan" }).first().click();
      await payWithTestCard(page);

      // Signed-in buyers land on the app home with a success flag.
      await page.waitForURL(/checkout=success/, { timeout: 60_000 });

      // The success redirect strips the session id, so recover it from the
      // Stripe side: the most recent session for this test run must be
      // complete with a live subscription.
      const listRes = await fetch(
        "https://api.stripe.com/v1/checkout/sessions?limit=1",
        { headers: { Authorization: `Bearer ${STRIPE_KEY}` } },
      );
      const { data } = (await listRes.json()) as { data: { id: string }[] };
      const latest = data[0];
      if (!latest) throw new Error("no checkout session found on Stripe");
      await assertSubscriptionCreated(latest.id);
    });
  });

  test.describe("as a guest", () => {
    // No storage state — a fresh anonymous visitor.
    test("buys the monthly plan with the 4242 test card and is told to check email", async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await ensureMonthlyPlanSynced();

      const guestEmail = `guest-e2e-${Date.now()}@example.com`;
      await page.goto("/pricing");
      await page.getByRole("button", { name: "Choose plan" }).first().click();
      await payWithTestCard(page, { email: guestEmail });

      // Guests return to /checkout/return and are told to check their email
      // (the webhook provisions their account afterwards).
      await page.waitForURL(/\/checkout\/return/, { timeout: 60_000 });
      await expect(page.getByText(/payment received/i)).toBeVisible();

      const sessionId = new URL(page.url()).searchParams.get("session_id");
      if (!sessionId) throw new Error("session_id missing from return URL");
      await assertSubscriptionCreated(sessionId);
    });
  });
});
