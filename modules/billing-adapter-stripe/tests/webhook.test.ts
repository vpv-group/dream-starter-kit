/**
 * The Stripe webhook's delivery guarantees, against a fake service-role
 * client and a real Stripe SDK (signatures) with stubbed API calls:
 *   - claim before processing (duplicate → 200, busy → 409, failure releases
 *     the claim → 500, success marks it done);
 *   - customer.subscription.* apply the re-fetched subscription, falling back
 *     to the event payload when Stripe can't be reached;
 *   - the wallet email never replaces the account email.
 */
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FakeAdminOptions } from "./fakes";
import {
  currentSubscription,
  handleStripeWebhook,
  persistBuyerDetails,
} from "../src/server/webhook";
import { fakeAdmin } from "./fakes";

const SECRET = "whsec_unit_test";
const USER_ID = "00000000-0000-4000-8000-000000000001";

async function signedRequest(event: object): Promise<Request> {
  const payload = JSON.stringify(event);
  const header = await new Stripe(
    "sk_test_unit",
  ).webhooks.generateTestHeaderStringAsync({ payload, secret: SECRET });
  return new Request(
    "http://localhost/api/mod/billing-adapter-stripe/webhook",
    {
      method: "POST",
      headers: { "stripe-signature": header },
      body: payload,
    },
  );
}

const productEvent = {
  id: "evt_product_1",
  object: "event",
  type: "product.updated",
  created: 1_800_000_000,
  data: {
    object: {
      id: "prod_1",
      object: "product",
      active: true,
      name: "Pro",
      metadata: {},
    },
  },
};

function subscription(status: string) {
  return {
    id: "sub_1",
    object: "subscription",
    customer: "cus_1",
    status,
    cancel_at_period_end: false,
    metadata: { supabase_user_id: USER_ID },
    items: {
      data: [
        {
          price: { id: "price_1" },
          quantity: 1,
          current_period_end: 1_800_100_000,
        },
      ],
    },
  };
}

function subscriptionEvent(status: string) {
  return {
    id: "evt_sub_1",
    object: "event",
    type: "customer.subscription.updated",
    created: 1_800_000_000,
    data: { object: subscription(status) },
  };
}

function adminWithClaim(
  claim: string | { message: string },
  extra: FakeAdminOptions = {},
) {
  return fakeAdmin({
    ...extra,
    rpc: {
      mod_billing_claim_event:
        typeof claim === "string"
          ? { data: claim, error: null }
          : { data: null, error: claim },
      mod_billing_apply_subscription: { data: true, error: null },
      ...extra.rpc,
    },
  });
}

const savedEnv = { ...process.env };
beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  delete process.env.STRIPE_SECRET_KEY;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
});

describe("webhook claims", () => {
  it("claims, applies, then marks the event done", async () => {
    const fake = adminWithClaim("claimed");
    const res = await handleStripeWebhook(await signedRequest(productEvent), {
      admin: fake.admin,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(fake.rpcCalls).toContainEqual({
      fn: "mod_billing_claim_event",
      args: {
        _provider: "stripe",
        _id: "evt_product_1",
        _type: "product.updated",
      },
    });
    expect(fake.ops.map((o) => [o.table, o.op])).toEqual([
      ["mod_billing_products", "upsert"],
    ]);
    expect(fake.ops[0]?.values).toMatchObject({
      id: "prod_1",
      provider: "stripe",
      name: "Pro",
    });
    expect(fake.rpcCalls).toContainEqual({
      fn: "mod_billing_finish_event",
      args: { _provider: "stripe", _id: "evt_product_1", _ok: true },
    });
  });

  it("acknowledges an already handled event without applying it", async () => {
    const fake = adminWithClaim("duplicate");
    const res = await handleStripeWebhook(await signedRequest(productEvent), {
      admin: fake.admin,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: true });
    expect(fake.ops).toEqual([]);
  });

  it("answers 409 while another delivery is processing it", async () => {
    const fake = adminWithClaim("busy");
    const res = await handleStripeWebhook(await signedRequest(productEvent), {
      admin: fake.admin,
    });
    expect(res.status).toBe(409);
    expect(fake.ops).toEqual([]);
  });

  it("releases the claim when processing fails, so Stripe's retry runs", async () => {
    const fake = adminWithClaim("claimed", {
      throwOnWrite: ["mod_billing_products"],
    });
    const res = await handleStripeWebhook(await signedRequest(productEvent), {
      admin: fake.admin,
    });
    expect(res.status).toBe(500);
    expect(fake.ops).toEqual([]);
    expect(fake.rpcCalls).toContainEqual({
      fn: "mod_billing_finish_event",
      args: { _provider: "stripe", _id: "evt_product_1", _ok: false },
    });
  });

  it("answers 500 (Stripe retries) when the claim itself fails", async () => {
    const fake = adminWithClaim({ message: "db down" });
    const res = await handleStripeWebhook(await signedRequest(productEvent), {
      admin: fake.admin,
    });
    expect(res.status).toBe(500);
    expect(fake.ops).toEqual([]);
  });

  it("rejects a bad signature before claiming anything", async () => {
    const fake = adminWithClaim("claimed");
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_other";
    const res = await handleStripeWebhook(await signedRequest(productEvent), {
      admin: fake.admin,
    });
    expect(res.status).toBe(400);
    expect(fake.rpcCalls.some((c) => c.fn === "mod_billing_claim_event")).toBe(
      false,
    );
  });
});

describe("subscription events apply Stripe's current state", () => {
  const appliedRow = (fake: ReturnType<typeof fakeAdmin>) =>
    fake.rpcCalls.find((c) => c.fn === "mod_billing_apply_subscription")?.args;

  it("re-fetches the subscription and stamps it with event.created", async () => {
    const stripe = new Stripe("sk_test_unit");
    const retrieve = vi
      .spyOn(stripe.subscriptions, "retrieve")
      .mockResolvedValue(
        subscription(
          "canceled",
        ) as unknown as Stripe.Response<Stripe.Subscription>,
      );
    vi.spyOn(stripe.charges, "list").mockRejectedValue(new Error("offline"));
    const projected: {
      status: string;
      provider: string;
      customerId?: string | null;
    }[] = [];
    const fake = adminWithClaim("claimed");

    const res = await handleStripeWebhook(
      await signedRequest(subscriptionEvent("active")),
      {
        admin: fake.admin,
        stripe,
        projectSubscription: (sub) => {
          projected.push(sub);
          return Promise.resolve();
        },
      },
    );
    expect(res.status).toBe(200);
    expect(retrieve).toHaveBeenCalledWith("sub_1");
    expect(appliedRow(fake)).toMatchObject({
      _row: {
        id: "sub_1",
        user_id: USER_ID,
        status: "canceled",
        provider: "stripe",
        kind: "subscription",
        store: "web",
      },
      _event_at: new Date(1_800_000_000 * 1000).toISOString(),
    });
    // The customer is linked per provider (and in the 1.x table).
    expect(fake.ops).toContainEqual(
      expect.objectContaining({
        table: "mod_billing_customer_links",
        op: "upsert",
        values: expect.objectContaining({
          user_id: USER_ID,
          provider: "stripe",
          provider_customer_id: "cus_1",
        }) as unknown,
      }),
    );
    // The CMS copy gets the same re-fetched state.
    expect(projected[0]).toMatchObject({
      status: "canceled",
      provider: "stripe",
      customerId: "cus_1",
    });
  });

  it("falls back to the event payload when the re-fetch fails", async () => {
    const stripe = new Stripe("sk_test_unit");
    vi.spyOn(stripe.subscriptions, "retrieve").mockRejectedValue(
      new Error("No such subscription"),
    );
    const fake = adminWithClaim("claimed");
    const res = await handleStripeWebhook(
      await signedRequest(subscriptionEvent("past_due")),
      { admin: fake.admin, stripe },
    );
    expect(res.status).toBe(200);
    expect(appliedRow(fake)).toMatchObject({ _row: { status: "past_due" } });
  });

  it("uses the payload without calling Stripe when no key is configured", async () => {
    const fake = adminWithClaim("claimed");
    const res = await handleStripeWebhook(
      await signedRequest(subscriptionEvent("past_due")),
      { admin: fake.admin },
    );
    expect(res.status).toBe(200);
    expect(appliedRow(fake)).toMatchObject({ _row: { status: "past_due" } });
  });

  it("currentSubscription reports whether the state is fresh", async () => {
    const fromEvent = subscription("active") as unknown as Stripe.Subscription;
    expect(await currentSubscription(null, fromEvent)).toEqual({
      sub: fromEvent,
      fresh: false,
    });
    const fresh = subscription("canceled") as unknown as Stripe.Subscription;
    const ok = {
      subscriptions: { retrieve: () => Promise.resolve(fresh) },
    } as unknown as Pick<Stripe, "subscriptions">;
    expect(await currentSubscription(ok, fromEvent)).toEqual({
      sub: fresh,
      fresh: true,
    });
  });
});

describe("persistBuyerDetails keeps the account email", () => {
  function stripeWithCustomerUpdate() {
    const stripe = new Stripe("sk_test_unit");
    const update = vi
      .spyOn(stripe.customers, "update")
      .mockResolvedValue({} as unknown as Stripe.Response<Stripe.Customer>);
    return { stripe, update };
  }

  it("stores a differing wallet email as the billing email", async () => {
    const fake = fakeAdmin({ accountEmail: "me@example.com" });
    const { stripe, update } = stripeWithCustomerUpdate();
    await persistBuyerDetails(fake.admin, stripe, USER_ID, "cus_1", {
      name: "Ada",
      email: "wallet@icloud.com",
    });
    expect(update).toHaveBeenCalledWith(
      "cus_1",
      expect.objectContaining({
        email: "me@example.com",
        metadata: { billing_email: "wallet@icloud.com" },
      }),
    );
    expect(fake.ops).toContainEqual({
      table: "mod_billing_customer_links",
      op: "update",
      values: { billing_email: "wallet@icloud.com" },
      filters: [
        ["user_id", USER_ID],
        ["provider", "stripe"],
      ],
    });
    expect(fake.ops).toContainEqual({
      table: "mod_billing_customers",
      op: "update",
      values: { billing_email: "wallet@icloud.com" },
      filters: [["user_id", USER_ID]],
    });
    expect(fake.metadataUpdates[0]?.attrs).toMatchObject({
      user_metadata: { billing_email: "wallet@icloud.com" },
    });
  });

  it("clears the billing email when the wallet email is the account's", async () => {
    const fake = fakeAdmin({ accountEmail: "Me@Example.com" });
    const { stripe, update } = stripeWithCustomerUpdate();
    await persistBuyerDetails(fake.admin, stripe, USER_ID, "cus_1", {
      email: "me@example.com",
    });
    expect(update).toHaveBeenCalledWith(
      "cus_1",
      expect.objectContaining({
        email: "Me@Example.com",
        metadata: { billing_email: "" },
      }),
    );
    expect(fake.ops).toContainEqual(
      expect.objectContaining({
        table: "mod_billing_customers",
        values: { billing_email: null },
      }),
    );
  });

  it("leaves the customer's email alone when the account email is unknown", async () => {
    const fake = fakeAdmin({ accountEmail: null });
    const { stripe, update } = stripeWithCustomerUpdate();
    await persistBuyerDetails(fake.admin, stripe, USER_ID, "cus_1", {
      name: "Ada",
      email: "wallet@icloud.com",
    });
    const params = update.mock.calls[0]?.[1];
    expect(params).toBeDefined();
    expect(params).not.toHaveProperty("email");
    expect(params).not.toHaveProperty("metadata");
    expect(
      fake.ops.some((o) => o.table.startsWith("mod_billing_customer")),
    ).toBe(false);
  });
});
