/**
 * LIVE check of "Connect with Stripe" (Meet Dream's Stripe Connect platform)
 * on a DEPLOYED kit site, in Stripe test mode. Not part of CI: it needs a
 * real site with a Meet Dream license and talks to meetdream.com and Stripe.
 *
 *   1. sign in as a staff admin
 *   2. Modules → Billing → "Connect in test mode" (or resume onboarding)
 *   3. finish Stripe-hosted onboarding (test data; headed runs can finish it
 *      by hand)
 *   4. register the webhook and test the connection
 *   5. save a plan and wait until it is synced to Stripe
 *   6. buy it with 4242 4242 4242 4242 (on-site Elements or hosted Checkout)
 *   7. /billing shows the plan as active
 *
 * The site must run kit ≥ 2.6 (the Meet Dream platform model), have a Meet
 * Dream license (set up on a public https domain), and have NO
 * STRIPE_SECRET_KEY / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (own keys win and
 * hide the Connect buttons).
 *
 * Run (from the repo root):
 *   LIVE_SITE_URL=https://your-site.example \
 *   LIVE_ADMIN_EMAIL=admin@your-site.example LIVE_ADMIN_PASSWORD=… \
 *   pnpm -F @acme/web-e2e exec playwright test -c live.config.ts --headed
 *
 * Optional: LIVE_PLAN (plan name, default the first monthly plan),
 * LIVE_DISCONNECT=1 (disconnect again at the end), LIVE_MANUAL=1 (wait up to
 * 15 minutes for you on Stripe's onboarding pages). Screenshots of every step
 * land in tooling/web-e2e/test-results/live/.
 */
import type { APIRequestContext, Frame, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

/* eslint-disable turbo/no-undeclared-env-vars -- a
   standalone live check, configured by its own env vars */
const SITE = process.env.LIVE_SITE_URL?.replace(/\/+$/, "") ?? "";
const EMAIL = process.env.LIVE_ADMIN_EMAIL ?? "";
const PASSWORD = process.env.LIVE_ADMIN_PASSWORD ?? "";
const PLAN_NAME = process.env.LIVE_PLAN ?? "";
const DISCONNECT = process.env.LIVE_DISCONNECT === "1";
/** Wait for you to finish Stripe steps by hand (implied by --headed). */
const MANUAL = process.env.LIVE_MANUAL === "1";
/* eslint-enable turbo/no-undeclared-env-vars */

const SHOTS = "test-results/live";
const consoleErrors: string[] = [];

// eslint-disable-next-line no-empty-pattern -- Playwright needs the fixtures arg
test.afterEach(async ({}, testInfo) => {
  if (consoleErrors.length > 0) {
    await testInfo.attach("browser-console-errors", {
      body: consoleErrors.join("\n"),
      contentType: "text/plain",
    });
  }
});
let shot = 0;
async function snap(page: Page, name: string) {
  shot += 1;
  await page
    .screenshot({
      path: `${SHOTS}/${String(shot).padStart(2, "0")}-${name}.png`,
      fullPage: true,
    })
    .catch(() => undefined);
}

interface Plan {
  id: number | string;
  name?: string;
  title?: string;
  interval?: string;
  stripePriceId?: string | null;
  syncStatus?: string;
  syncError?: string | null;
}

const planLabel = (p: Plan) => p.name ?? p.title ?? String(p.id);

async function cmsGet<T>(request: APIRequestContext, path: string) {
  const res = await request.get(`${SITE}/cms-api${path}`);
  if (!res.ok()) {
    throw new Error(
      `GET /cms-api${path} → ${res.status()}: ${await res.text()}`,
    );
  }
  return (await res.json()) as T;
}

/**
 * A never-seeded site sends staff from /admin to /cms-setup (client-side), which
 * seeds the CMS and returns to /admin. Wait that out when it happens.
 */
async function waitOutSeed(page: Page) {
  const seeding = await page
    .waitForURL(/\/cms-setup/, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (seeding) {
    await snap(page, "cms-setup");
    // First step: "Who signs up for your app?" — keep the default.
    const ask = page.getByRole("heading", {
      name: "Who signs up for your app?",
    });
    if (await ask.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await page.getByRole("button", { name: "Continue" }).click();
    }
    await page.waitForURL(/\/admin/, { timeout: 600_000 });
  }
}

/** Status line from the panel's last action (a toast or inline message). */
async function panelMessage(page: Page, text: RegExp, timeout = 60_000) {
  await expect(page.getByText(text).first()).toBeVisible({ timeout });
}

/**
 * Click through Stripe-hosted onboarding in test mode. Stripe offers test
 * shortcuts there (a test phone number, SMS code 000000, "use test data"
 * buttons); this presses the ones it finds until Stripe sends the browser
 * back to the site. Stripe changes this UI often, so a headed run also lets
 * you finish it by hand: the loop just waits for the return.
 */
async function completeOnboarding(page: Page, headed: boolean) {
  const site = new URL(SITE).host;
  const deadline = Date.now() + (headed ? 15 : 5) * 60_000;
  let idleSince = Date.now();
  while (new URL(page.url()).host !== site) {
    if (Date.now() > deadline) {
      await snap(page, "onboarding-timeout");
      throw new Error(
        `Stripe onboarding didn't return to the site (still on ${page.url()}). ` +
          "Rerun with --headed and finish the remaining step by hand.",
      );
    }
    const acted = await onboardingStep(page);
    if (acted) {
      idleSince = Date.now();
      await snap(page, "onboarding");
    } else if (!headed && Date.now() - idleSince > 90_000) {
      await snap(page, "onboarding-stuck");
      throw new Error(
        `Stuck on a Stripe onboarding page this script can't fill (${page.url()}). ` +
          "Rerun with --headed and finish it by hand; the test continues once Stripe returns.",
      );
    }
    await page.waitForTimeout(1_500);
  }
}

/** One pass over the current onboarding page; true if anything was done. */
async function onboardingStep(page: Page): Promise<boolean> {
  const frames: (Page | Frame)[] = [page, ...page.frames()];
  for (const f of frames) {
    const testShortcut = f
      .getByRole("button", {
        name: /use test (data|phone|account|document|bank)|test (phone )?number|skip.*test/i,
      })
      .first();
    if (await testShortcut.isVisible().catch(() => false)) {
      await testShortcut.click().catch(() => undefined);
      return true;
    }
  }
  const phone = page.locator('input[type="tel"]').first();
  if (
    (await phone.isVisible().catch(() => false)) &&
    !(await phone.inputValue().catch(() => ""))
  ) {
    await phone.fill("0000000000");
    return true;
  }
  const code = page.locator(
    'input[autocomplete="one-time-code"], input[inputmode="numeric"][maxlength="1"]',
  );
  if (
    await code
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    const n = await code.count();
    if (n > 1) {
      for (let i = 0; i < n; i++) await code.nth(i).fill("0");
    } else {
      await code.first().fill("000000");
    }
    return true;
  }
  const next = page
    .getByRole("button", {
      name: /^(continue|agree and submit|submit|done|next|save|confirm|agree)$/i,
    })
    .first();
  if (
    (await next.isVisible().catch(() => false)) &&
    (await next.isEnabled().catch(() => false))
  ) {
    await next.click().catch(() => undefined);
    return true;
  }
  return false;
}

/** Card details in Stripe's Payment Element (on-site checkout). */
async function payOnSite(page: Page) {
  const card = page
    .frameLocator('iframe[title="Secure payment input frame"]')
    .first();
  await card.locator('input[name="number"]').fill("4242424242424242");
  await card.locator('input[name="expiry"]').fill("12 / 34");
  await card.locator('input[name="cvc"]').fill("123");
  const country = card.locator('select[name="country"]');
  if (await country.isVisible().catch(() => false)) {
    await country.selectOption("US");
  }
  const postal = card.locator('input[name="postalCode"]');
  if (await postal.isVisible().catch(() => false)) {
    await postal.fill("90210");
  }
  const consent = page.locator(".dr-consent input[type='checkbox']");
  if (
    (await consent.isVisible().catch(() => false)) &&
    !(await consent.isChecked())
  ) {
    await consent.check();
  }
  await snap(page, "card-filled");
  const pay = page
    .getByRole("button", {
      name: /pay|subscribe|start|buy|complete|purchase|get access/i,
    })
    .filter({ hasNotText: /processing/i })
    .last();
  await expect(pay).toBeEnabled({ timeout: 30_000 });
  await pay.click();
}

/** Stripe's hosted Checkout page (when the "hosted" setting is on). */
async function payHosted(page: Page) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  await page.locator("#cardNumber").fill("4242 4242 4242 4242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  await page.locator("#billingName").fill("Live Test");
  const postal = page.locator("#billingPostalCode");
  if (await postal.isVisible().catch(() => false)) await postal.fill("90210");
  await snap(page, "hosted-card-filled");
  await page.locator('[data-testid="hosted-payment-submit-button"]').click();
}

test.describe.configure({ mode: "serial" });

test("Connect with Stripe (test mode): connect, sync a plan, buy it, see it on /billing", async ({
  page,
}, testInfo) => {
  test.skip(
    !SITE || !EMAIL || !PASSWORD,
    "Set LIVE_SITE_URL, LIVE_ADMIN_EMAIL and LIVE_ADMIN_PASSWORD",
  );
  test.setTimeout(30 * 60_000);
  const headed = MANUAL || testInfo.project.use.headless === false;
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  await test.step("sign in as staff", async () => {
    await page.goto(`${SITE}/sign-in`);
    const withEmail = page.getByRole("button", { name: "Continue with email" });
    if (await withEmail.isVisible().catch(() => false)) await withEmail.click();
    await page.locator('input[type="email"]').fill(EMAIL);
    const usePassword = page.getByRole("button", {
      name: "Use password instead",
    });
    if (await usePassword.isVisible().catch(() => false)) {
      await usePassword.click();
    }
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), {
      timeout: 60_000,
    });
    await snap(page, "signed-in");
  });

  let billingPage = "";
  await test.step("open Modules → Billing", async () => {
    await page.goto(`${SITE}/admin`);
    await waitOutSeed(page);
    const { docs } = await cmsGet<{ docs: { id: number | string }[] }>(
      page.request,
      "/kit-modules?where[slug][equals]=billing&limit=1&depth=0",
    );
    const id = docs[0]?.id;
    if (id === undefined) throw new Error("No billing module on this site");
    billingPage = `${SITE}/admin/collections/kit-modules/${String(id)}`;
    await page.goto(billingPage);
    await expect(
      page
        .getByText(/Connect with Stripe|Connected via Meet Dream|Own API keys/)
        .first(),
    ).toBeVisible({ timeout: 90_000 });
    await snap(page, "billing-module");
  });

  await test.step("connect in test mode", async () => {
    const ownKeys = page.getByText("Own API keys", { exact: true });
    if (await ownKeys.isVisible().catch(() => false)) {
      throw new Error(
        "This site uses its own STRIPE_SECRET_KEY, which wins over Connect with Stripe. " +
          "Remove STRIPE_SECRET_KEY / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY from its env and redeploy.",
      );
    }
    const connected = page.getByText("Connected", { exact: true });
    if (await connected.isVisible().catch(() => false)) return; // already done
    const resume = page.getByRole("link", { name: "Finish Stripe onboarding" });
    if (await resume.isVisible().catch(() => false)) {
      await resume.click();
    } else {
      const noLicense = page.getByText(
        /hasn't registered with Meet Dream|needs this site's free Meet Dream license/,
      );
      if (
        await noLicense
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        throw new Error(
          `This site has no Meet Dream license yet: "${await noLicense.first().innerText()}". ` +
            "It registers after the first setup on a public https domain (/cms-setup), unless DREAM_TELEMETRY=off.",
        );
      }
      await page.getByRole("button", { name: "Connect in test mode" }).click();
      // The panel posts to the adapter, then sends the browser to Stripe. An
      // error (e.g. Meet Dream refusing) shows in the panel instead.
      const left = await page
        .waitForURL((u) => u.host !== new URL(SITE).host, { timeout: 60_000 })
        .then(() => true)
        .catch(() => false);
      if (!left) {
        await snap(page, "connect-failed");
        const card = page
          .locator("div")
          .filter({ has: page.getByText("Connect in test mode") })
          .last();
        throw new Error(
          `"Connect in test mode" didn't open Stripe. The panel says:\n${await card.innerText().catch(() => "(unreadable)")}`,
        );
      }
    }
    await snap(page, "stripe-onboarding-start");
    await completeOnboarding(page, headed);
    const back = new URL(page.url());
    const err = back.searchParams.get("stripe_error");
    if (err)
      throw new Error(`Stripe onboarding came back with stripe_error=${err}`);
    await snap(page, "back-from-stripe");
  });

  await test.step("connected, webhook registered, connection works", async () => {
    await page.goto(billingPage);
    // Stripe can take a moment to enable card payments after onboarding.
    await expect
      .poll(
        async () => {
          await page.reload();
          await page
            .getByText(/Connected via Meet Dream/)
            .first()
            .waitFor({ timeout: 60_000 });
          return page
            .getByText("Connected", { exact: true })
            .isVisible()
            .catch(() => false);
        },
        { timeout: 300_000, intervals: [5_000, 10_000, 20_000] },
      )
      .toBe(true);
    await snap(page, "connected");
    await page.getByRole("button", { name: "Register now" }).click();
    await panelMessage(page, /Webhook registered\.|Skipped:/);
    const skipped = page.getByText(/^Skipped:/);
    if (await skipped.isVisible().catch(() => false)) {
      throw new Error(`Webhook not registered: ${await skipped.innerText()}`);
    }
    await page.getByRole("button", { name: "Test connection" }).click();
    await panelMessage(page, /Stripe answered/);
    await snap(page, "webhook-and-test");
  });

  let plan: Plan | undefined;
  await test.step("save a plan and wait for it to sync to Stripe", async () => {
    const { docs } = await cmsGet<{ docs: Plan[] }>(
      page.request,
      "/mod-billing-plans?limit=50&depth=0",
    );
    plan = PLAN_NAME
      ? docs.find((p) => planLabel(p).toLowerCase() === PLAN_NAME.toLowerCase())
      : (docs.find((p) => p.interval === "month") ?? docs[0]);
    if (!plan) {
      throw new Error(
        `No plan ${PLAN_NAME ? `named "${PLAN_NAME}"` : "found"} (have: ${docs.map(planLabel).join(", ")})`,
      );
    }
    await page.goto(
      `${SITE}/admin/collections/mod-billing-plans/${String(plan.id)}`,
    );
    const save = page.getByRole("button", { name: "Save", exact: true });
    await save.waitFor({ timeout: 60_000 });
    if (await save.isEnabled().catch(() => false)) {
      await save.click();
    } else {
      // Payload disables Save on an unchanged doc: push via the panel instead.
      await page.goto(billingPage);
      await page.getByRole("button", { name: "Sync everything now" }).click();
      await panelMessage(page, /Pushed \d+ plans/);
    }
    await snap(page, "plan-saved");
    const id = plan.id;
    await expect
      .poll(
        async () => {
          const doc = await cmsGet<Plan>(
            page.request,
            `/mod-billing-plans/${String(id)}?depth=0`,
          );
          if (doc.syncStatus === "error") {
            throw new Error(`Stripe sync failed: ${doc.syncError}`);
          }
          return doc.stripePriceId ?? null;
        },
        { timeout: 120_000, intervals: [2_000, 5_000] },
      )
      .not.toBeNull();
  });

  await test.step("buy it with 4242 4242 4242 4242", async () => {
    if (!plan) throw new Error("no plan");
    await page.goto(`${SITE}/checkout?plan=${String(plan.id)}&step=payment`);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await snap(page, "checkout");
    const unavailable = page.getByText(/Payments aren’t set up yet/);
    if (await unavailable.isVisible().catch(() => false)) {
      throw new Error(
        "Checkout says payments aren't set up yet (connection not ready?)",
      );
    }
    const elements = page.locator('iframe[title="Secure payment input frame"]');
    const onSite = await elements
      .first()
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (onSite) {
      await payOnSite(page);
    } else {
      // Hosted setting: one button that redirects to Stripe.
      await page
        .getByRole("button", { name: /pay|subscribe|checkout|continue|start/i })
        .last()
        .click();
      await payHosted(page);
    }
    await page.waitForURL(
      (u) =>
        u.host === new URL(SITE).host &&
        (!u.pathname.startsWith("/checkout") ||
          u.searchParams.has("checkout") ||
          u.pathname.startsWith("/checkout/return")),
      { timeout: 120_000 },
    );
    await snap(page, "after-payment");
  });

  await test.step("/billing shows the plan as active", async () => {
    if (!plan) throw new Error("no plan");
    const name = planLabel(plan);
    await expect
      .poll(
        async () => {
          await page.goto(`${SITE}/billing`);
          await page.waitForLoadState("networkidle").catch(() => undefined);
          const text = await page
            .locator("main")
            .innerText()
            .catch(() => "");
          return text.includes(name) && /active|trialing/i.test(text);
        },
        { timeout: 180_000, intervals: [5_000, 10_000] },
      )
      .toBe(true);
    await snap(page, "billing");
  });

  if (DISCONNECT) {
    await test.step("disconnect", async () => {
      await page.goto(billingPage);
      await page.getByRole("button", { name: "Disconnect" }).click();
      await panelMessage(page, /Disconnected from Stripe/);
      await snap(page, "disconnected");
    });
  }
});
