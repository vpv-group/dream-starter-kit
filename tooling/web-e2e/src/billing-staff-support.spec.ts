import type { Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  createConfirmedUser,
  createWorkspace,
  deleteAuthUser,
  deleteWorkspace,
  FOUNDER_STORAGE_STATE,
  signInWithPasswordUI,
} from "./helpers";

/**
 * Workspace (company) billing and the staff support view (docs/BILLING.md
 * §10): staff find a workspace from /billing's "Billing account for"
 * switcher, grant it a no-charge plan, every member gets premium, the owner
 * sees it as complimentary, and revoking takes it away again. The founder
 * is staff; the owner and member are created through the service role.
 * Serial: each step builds on the previous one.
 */

const STAMP = Date.now();
const PASSWORD = "Billing-e2e-1!";
const WORKSPACE = `Billing Co ${STAMP}`;
const OWNER = `ws-owner-${STAMP}@example.com`;
const MEMBER = `ws-member-${STAMP}@example.com`;
const PREMIUM_POST = "/posts/premium-preview";

let ownerId = "";
let memberId = "";
let orgId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  ownerId = await createConfirmedUser(OWNER, PASSWORD, "Workspace Owner");
  memberId = await createConfirmedUser(MEMBER, PASSWORD, "Workspace Member");
  orgId = await createWorkspace(WORKSPACE, `billing-co-${STAMP}`, ownerId, [
    [ownerId, "owner"],
    [memberId, "member"],
  ]);
});

test.afterAll(async () => {
  if (orgId) await deleteWorkspace(orgId);
  for (const id of [ownerId, memberId]) if (id) await deleteAuthUser(id);
});

/** A fresh browser context signed in as `email` (not staff). */
async function signedIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signInWithPasswordUI(page, email, PASSWORD);
  await page.waitForURL(/\/(a|welcome|onboarding)(\/|$|\?)/, {
    timeout: 60_000,
  });
  return page;
}

test.describe("as staff", () => {
  test.use({ storageState: FOUNDER_STORAGE_STATE });

  test("finds the workspace and grants it a plan", async ({ page }) => {
    await page.goto("/billing");
    await page.getByRole("button", { name: "Switch billing account" }).click();
    await page.getByRole("menuitem", { name: /Find an account/ }).click();
    await page.getByPlaceholder("Email, name or workspace").fill(WORKSPACE);
    await page.getByRole("option", { name: new RegExp(WORKSPACE) }).click();

    await expect(page).toHaveURL(new RegExp(`account=org(%3A|:)${orgId}`));
    await expect(page.getByText("Staff view — read-only")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/2 members/)).toBeVisible();

    await page.getByRole("button", { name: "Grant a plan" }).click();
    await page
      .getByRole("combobox")
      .filter({ hasText: "Choose a plan" })
      .click();
    await page.getByRole("option").first().click();
    const until = new Date(Date.now() + 30 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await page.getByLabel("Until (optional)").fill(until);
    await page.getByLabel("Why (shown to staff only)").fill("E2E pilot");
    await page.getByRole("button", { name: "Grant plan (no charge)" }).click();

    await expect(page.getByText("Granted by staff")).toBeVisible();
    await expect(page.getByText("“E2E pilot”")).toBeVisible();
  });
});

test("every member of the workspace gets premium", async ({ browser }) => {
  const page = await signedIn(browser, MEMBER);
  await page.goto(PREMIUM_POST);
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator(".premium-gate")).toHaveCount(0);

  // A plain member doesn't manage the workspace's billing.
  await page.goto(`/billing?account=org:${orgId}`);
  await expect(page.getByText(/manage billing for this account/)).toBeVisible();
});

test("the owner sees the complimentary workspace plan", async ({ browser }) => {
  const page = await signedIn(browser, OWNER);
  await page.goto("/billing");
  await page.getByRole("button", { name: "Switch billing account" }).click();
  await page.getByRole("menuitem", { name: WORKSPACE }).click();
  await expect(
    page.getByText("Workspace plan — every member gets it"),
  ).toBeVisible();
  await expect(page.getByText(/Complimentary until/)).toBeVisible();
});

test.describe("revoking", () => {
  test.use({ storageState: FOUNDER_STORAGE_STATE });

  test("ends the grant, and members are gated again", async ({
    page,
    browser,
  }) => {
    await page.goto(`/billing?account=org:${orgId}`);
    await expect(page.getByText("Granted by staff")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByText("Grant revoked")).toBeVisible();
    await expect(page.getByText("canceled", { exact: true })).toBeVisible();

    const member = await signedIn(browser, MEMBER);
    await member.goto(PREMIUM_POST);
    await expect(member.locator(".premium-gate")).toBeVisible();
  });
});
