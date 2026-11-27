import { readFileSync } from "node:fs";
import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  createConfirmedUser,
  deleteAuthUser,
  fetchBillingRows,
  fetchUserTagNames,
  FOUNDER_STORAGE_STATE,
  signInWithPasswordUI,
} from "./helpers";
import { setSiteKey } from "./helpers/site-key";

/**
 * "Connect with Stripe" end to end against a FAKE meetdream.com
 * (stub-stripe.mjs, mounted by the stub server): the real kit code — the
 * connector broker, the Stripe adapter talking through it, the webhook, the
 * ledger, billing tags and /billing — with no license, no meetdream.com and
 * no Stripe account. Stripe.js confirming a card can't run against a fake, so
 * `/__stripe/pay` stands in for it and delivers the events Stripe would.
 *
 * Runs in its own Playwright project after `chromium` (updates.spec shares
 * the stub server and the site key). Real Stripe and hosted onboarding are
 * covered by the manual live check (live/stripe-connect.live.spec.ts).
 */

const contract = JSON.parse(
  readFileSync(
    new URL(
      "../../../packages/mod-kit/contracts/stripe-connector.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { stripeCalls: string[] };

const STUB = "http://localhost:4010";
const SITE_KEY = "dsk_e2e_site_key";
const STAMP = Date.now();
const PASSWORD = "Stripe-e2e-1!";
const MEMBER = `stripe-member-${STAMP}@example.com`;
const WEBHOOK_URL =
  "http://localhost:3000/api/mod/billing-adapter-stripe/webhook";

interface Plan {
  id: number;
  slug: string;
  name: string;
  unitAmount: number;
  stripePriceId?: string | null;
  syncStatus?: string;
  syncError?: string | null;
}
interface StubLogEntry {
  type: string;
  call?: string;
  body?: unknown;
  route?: string | null;
  path?: string;
  method?: string;
  authorization?: boolean;
  stripeAccount?: string | null;
  eventType?: string;
  status?: number | string;
}

let memberId = "";
let billingModuleUrl = "";
/** The member's signed-in session, reused across tests. */
const MEMBER_STATE = `test-results/.auth/stripe-member-${STAMP}.json`;

async function stub<T = unknown>(path: string, body?: object): Promise<T> {
  const res = await fetch(`${STUB}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return (await res.json()) as T;
}
const stubLog = () => stub<StubLogEntry[]>("/__stripe/log");

async function plan(request: APIRequestContext, slug: string): Promise<Plan> {
  const res = await request.get(
    `/cms-api/mod-billing-plans?where[slug][equals]=${slug}&limit=1&depth=0`,
  );
  const { docs } = (await res.json()) as { docs: Plan[] };
  const doc = docs[0];
  if (!doc) throw new Error(`seeded plan ${slug} missing`);
  return doc;
}

async function memberPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    storageState: MEMBER_STATE,
  });
  return context.newPage();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  // First sign-in can compile /sign-in on a cold dev server.
  test.setTimeout(240_000);
  if (process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      "STRIPE_SECRET_KEY is set in .env: own keys win over Connect with Stripe, " +
        "so this spec can't exercise it. Comment it out and restart the dev server.",
    );
  }
  setSiteKey(SITE_KEY);
  await stub("/__stripe/reset", {});
  memberId = await createConfirmedUser(MEMBER, PASSWORD, "Stripe Member");
  // An empty session: the first test's `use` would hand this the founder's.
  const page = await (
    await browser.newContext({ storageState: { cookies: [], origins: [] } })
  ).newPage();
  await signInWithPasswordUI(page, MEMBER, PASSWORD);
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), {
    timeout: 60_000,
  });
  await page.context().storageState({ path: MEMBER_STATE });
  await page.context().close();
});

test.afterAll(async () => {
  await stub("/__stripe/reset", {});
  setSiteKey(null);
  if (memberId) await deleteAuthUser(memberId);
});

test.describe("as staff", () => {
  test.use({ storageState: FOUNDER_STORAGE_STATE });

  test("connect in test mode: onboarding, connected, webhook, test call", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const res = await page.request.get(
      "/cms-api/kit-modules?where[slug][equals]=billing&limit=1&depth=0",
    );
    const { docs } = (await res.json()) as { docs: { id: number }[] };
    billingModuleUrl = `/admin/collections/kit-modules/${String(docs[0]?.id)}`;

    // The license was just set; the site picks it up within seconds.
    const connect = page.getByRole("button", { name: "Connect in test mode" });
    await expect(async () => {
      await page.goto(billingModuleUrl);
      await expect(connect).toBeEnabled({ timeout: 15_000 });
      await expect(
        page.getByText(/hasn't registered with Meet Dream/),
      ).toHaveCount(0);
    }).toPass({ timeout: 90_000 });
    await expect(
      page.getByText("Not connected", { exact: true }),
    ).toBeVisible();

    // Stripe-hosted onboarding (the stub's page) returns before it's done.
    await stub("/__stripe/scenario", { ready: false });
    await connect.click();
    await page.waitForURL(/stripe=connected/, { timeout: 60_000 });
    await expect(page.getByText("Onboarding", { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      page.getByRole("link", { name: "Finish Stripe onboarding" }),
    ).toBeVisible();
    const start = (await stubLog()).find((e) => e.call === "start");
    expect(start?.body).toMatchObject({ mode: "test" });

    // Stripe finishes onboarding: charges are enabled.
    await stub("/__stripe/scenario", { ready: true });
    await page.reload();
    await expect(page.getByText("Connected", { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/Connected via Meet Dream/)).toBeVisible();

    await page.getByRole("button", { name: "Register now" }).click();
    await expect(page.getByText("Webhook registered.")).toBeVisible({
      timeout: 30_000,
    });
    const target = (await stubLog()).find((e) => e.call === "webhook-target");
    expect(target?.body).toEqual({ url: WEBHOOK_URL });

    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByText(/Stripe answered/)).toBeVisible({
      timeout: 30_000,
    });
    const calls = (await stubLog()).filter((e) => e.type === "stripe");
    expect(calls.some((c) => c.route === "GET /v1/products")).toBe(true);
  });

  test("catalog sync pushes plans; a price change makes a new price", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto(billingModuleUrl);
    await page.getByRole("button", { name: "Sync everything now" }).click();
    await expect(page.getByText(/Pushed \d+ plans/)).toBeVisible({
      timeout: 60_000,
    });
    const monthly = await plan(page.request, "dream-monthly");
    expect(monthly.syncStatus).toBe("synced");
    expect(monthly.stripePriceId).toMatch(/^price_stub_/);

    // Stripe prices are immutable: a new amount creates a new price and
    // archives the old one.
    const annual = await plan(page.request, "dream-annual");
    const oldPrice = annual.stripePriceId;
    expect(oldPrice).toBeTruthy();
    const patch = (unitAmount: number) =>
      page.request.patch(`/cms-api/mod-billing-plans/${annual.id}`, {
        data: { unitAmount },
      });
    expect((await patch(annual.unitAmount + 100)).ok()).toBe(true);
    await expect
      .poll(
        async () => (await plan(page.request, "dream-annual")).stripePriceId,
      )
      .not.toBe(oldPrice);
    const { objects } = await stub<{
      objects: { id: string; object: string; active?: boolean }[];
    }>("/__stripe/state");
    expect(objects.find((o) => o.id === oldPrice)?.active).toBe(false);
    expect((await patch(annual.unitAmount)).ok()).toBe(true);

    // Stripe's product/price events reach the site through "meetdream.com".
    await stub("/__stripe/drain", {});
    const deliveries = (await stubLog()).filter((e) => e.type === "delivery");
    expect(deliveries.length).toBeGreaterThan(0);
    for (const d of deliveries) expect(d.status, d.eventType).toBe(200);
  });
});

test.describe("as a member", () => {
  test("buys a subscription: ledger, billing tags and /billing", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const page = await memberPage(browser);
    const config = await page.request.get(
      "/api/mod/billing-adapter-stripe/config",
    );
    expect(await config.json()).toMatchObject({
      enabled: true,
      publishableKey: "pk_test_stub",
      stripeAccount: "acct_stub",
    });

    const monthly = await plan(page.request, "dream-monthly");
    const intent = await page.request.post(
      "/api/mod/billing-adapter-stripe/express-intent",
      { data: { planId: monthly.id } },
    );
    expect(intent.ok()).toBe(true);
    const { clientSecret, subscriptionId } = (await intent.json()) as {
      clientSecret: string;
      subscriptionId?: string;
    };
    expect(clientSecret).toMatch(/_secret_stub$/);
    expect(subscriptionId).toMatch(/^sub_stub_/);

    // Stands in for Stripe.js confirming the card.
    const paid = await stub<{ results: { status: number }[] }>(
      "/__stripe/pay",
      { subscriptionId },
    );
    for (const r of paid.results) expect(r.status).toBe(200);

    await expect
      .poll(async () =>
        (await fetchBillingRows(memberId)).find((r) => r.id === subscriptionId),
      )
      .toMatchObject({
        status: "active",
        provider: "stripe",
        kind: "subscription",
        store: "web",
      });
    await expect
      .poll(() => fetchUserTagNames(memberId))
      .toEqual(
        expect.arrayContaining([
          "Active",
          monthly.name,
          "Billing cycle: Monthly",
          "Store: Web",
        ]),
      );

    await page.goto("/billing");
    await expect(page.getByText(monthly.name).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("active", { exact: true })).toBeVisible();
    await expect(page.getByText(/STUB-\d+/)).toBeVisible();

    // The customer portal opens at the provider's URL.
    await page.getByRole("button", { name: "Change or cancel plan" }).click();
    await page.waitForURL(/\/stripe-portal\?customer=cus_stub_/, {
      timeout: 30_000,
    });
  });

  test("buys a one-time (lifetime) plan on-site", async ({ browser }) => {
    const page = await memberPage(browser);
    const lifetime = await plan(page.request, "dream-lifetime");
    const intent = await page.request.post(
      "/api/mod/billing-adapter-stripe/express-intent",
      { data: { planId: lifetime.id } },
    );
    expect(intent.ok()).toBe(true);
    const { clientSecret, mode } = (await intent.json()) as {
      clientSecret: string;
      mode: string;
    };
    expect(mode).toBe("payment");
    const paymentIntentId = clientSecret.replace(/_secret_stub$/, "");
    const paid = await stub<{ results: { status: number }[] }>(
      "/__stripe/pay",
      { paymentIntentId },
    );
    expect(paid.results[0]?.status).toBe(200);
    await expect
      .poll(async () =>
        (await fetchBillingRows(memberId)).find(
          (r) => r.id === paymentIntentId,
        ),
      )
      .toMatchObject({
        status: "active",
        kind: "one_time",
        plan_id: String(lifetime.id),
      });
  });

  test("hosted Checkout gets its session URL from the provider", async ({
    browser,
  }) => {
    const page = await memberPage(browser);
    const annual = await plan(page.request, "dream-annual");
    const res = await page.request.post("/api/mod/billing/checkout", {
      data: { planId: annual.id, provider: "stripe" },
    });
    expect(res.ok()).toBe(true);
    expect(((await res.json()) as { url: string }).url).toMatch(
      /^http:\/\/localhost:4010\/stripe-checkout\/cs_stub_/,
    );
  });

  test("a meetdream.com outage fails cleanly, then recovers", async ({
    browser,
  }) => {
    const page = await memberPage(browser);
    const monthly = await plan(page.request, "dream-monthly");
    const buy = () =>
      page.request.post("/api/mod/billing-adapter-stripe/express-intent", {
        data: { planId: monthly.id },
      });
    await stub("/__stripe/scenario", { down: true });
    try {
      const down = await buy();
      expect(down.status()).toBeGreaterThanOrEqual(500);
      expect(await down.json()).toHaveProperty("error");
    } finally {
      await stub("/__stripe/scenario", { down: false });
    }
    expect((await buy()).ok()).toBe(true);
  });
});

test.describe("webhook security", () => {
  test("a bad signature is refused; a replayed event applies once", async () => {
    const { objects } = await stub<{
      objects: { id: string; object: string; status?: string }[];
    }>("/__stripe/state");
    const sub = objects.find(
      (o) => o.object === "subscription" && o.status === "active",
    );
    expect(sub).toBeTruthy();

    const forged = await stub<{ status: number }>("/__stripe/emit", {
      type: "customer.subscription.updated",
      object: sub,
      secret: "whsec_not_the_sites",
    });
    expect(forged.status).toBe(400);

    const id = `evt_replay_${STAMP}`;
    const first = await stub<{ status: number }>("/__stripe/emit", {
      type: "customer.subscription.updated",
      object: sub,
      id,
    });
    expect(first.status).toBe(200);
    const again = await stub<{ status: number; body: string }>(
      "/__stripe/emit",
      { type: "customer.subscription.updated", object: sub, id },
    );
    expect(again.status).toBe(200);
    expect(again.body).toContain("duplicate");
  });
});

test.describe("as staff, finally", () => {
  test.use({ storageState: FOUNDER_STORAGE_STATE });

  test("disconnect, and every forwarded call kept the contract", async ({
    page,
  }) => {
    await page.goto(billingModuleUrl);
    await page.getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByText("Disconnected from Stripe.")).toBeVisible({
      timeout: 30_000,
    });
    await page.reload();
    await expect(page.getByText("Not connected", { exact: true })).toBeVisible({
      timeout: 60_000,
    });

    const log = await stubLog();
    expect(log.some((e) => e.call === "disconnect")).toBe(true);
    const calls = log.filter((e) => e.type === "stripe");
    const allowed = new Set(contract.stripeCalls);
    const offContract = calls.filter((c) => !c.route || !allowed.has(c.route));
    expect(
      offContract.map((c) => `${c.method} ${c.path}`),
      "Stripe calls the adapter made that the contract doesn't list",
    ).toEqual([]);
    // The site never holds a Stripe credential or picks the account.
    expect(
      calls.filter((c) => c.authorization === true || Boolean(c.stripeAccount)),
    ).toEqual([]);
  });
});
