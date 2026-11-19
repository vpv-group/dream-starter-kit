import { expect, test } from "@playwright/test";

import {
  createInvitation,
  fetchAuthUserByEmail,
  fetchOwnedOrganizations,
} from "./helpers/db";
import { FOUNDER_STORAGE_STATE } from "./helpers/founder";
import { signUpAndConfirm } from "./helpers/mailpit";

/**
 * Organization onboarding (docs/AUTH.md → Organizations). With organization
 * mode "required", a new user lands on /onboarding/organization after
 * confirming their email, creates (or joins) an organization and reaches the
 * app with it active in the header switcher.
 *
 * The founder (founder.setup.ts) flips the authentication-settings global to
 * "required" through the CMS REST API and restores "off" afterwards.
 */
test.describe.configure({ mode: "serial" });

async function setOrganizationMode(
  browser: import("@playwright/test").Browser,
  mode: "off" | "personal" | "required",
) {
  const ctx = await browser.newContext({ storageState: FOUNDER_STORAGE_STATE });
  const res = await ctx.request.post(
    "/cms-api/globals/authentication-settings",
    {
      data: { organizationMode: mode },
    },
  );
  expect(res.ok(), await res.text()).toBe(true);
  await ctx.close();
}

test.beforeAll(async ({ browser }) => {
  await setOrganizationMode(browser, "required");
});

test.afterAll(async ({ browser }) => {
  await setOrganizationMode(browser, "off");
});

test.use({ storageState: { cookies: [], origins: [] } });

let ownerOrgId = "";

test("required mode: a new user creates an organization before entering the app", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const email = `org-owner-${Date.now()}@test.local`;
  await signUpAndConfirm(page, { name: "Nora Whitfield", email });

  await expect(page).toHaveURL(/\/onboarding\/organization/);
  await expect(
    page.getByRole("heading", { name: "Set up your organization" }),
  ).toBeVisible();

  // Validation: name is required.
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByText("Enter your organization's name")).toBeVisible();

  await page.getByLabel("Organization name").fill("Northwind Traders E2E");
  await page.getByLabel("Website").fill("northwind.example.com");
  await page.getByRole("button", { name: "Create organization" }).click();

  await page.waitForURL((url) => url.pathname === "/a", { timeout: 60_000 });
  await expect(
    page.getByRole("button", { name: /Organization: Northwind Traders E2E/ }),
  ).toBeVisible();

  const user = await fetchAuthUserByEmail(email);
  const orgs = await fetchOwnedOrganizations(user?.id ?? "");
  expect(orgs).toEqual([
    expect.objectContaining({
      name: "Northwind Traders E2E",
      website: "https://northwind.example.com",
    }),
  ]);
  ownerOrgId = orgs[0]?.id ?? "";
});

test("an invited user accepts the invitation on onboarding", async ({
  page,
}) => {
  test.setTimeout(180_000);
  expect(ownerOrgId).not.toBe("");
  const email = `org-invitee-${Date.now()}@test.local`;
  await createInvitation(ownerOrgId, email);

  await signUpAndConfirm(page, { name: "Theo Park", email });
  await expect(page).toHaveURL(/\/onboarding\/organization/);
  await expect(page.getByText(`Invitation for ${email}`)).toBeVisible();
  await page.getByRole("button", { name: "Accept and join" }).click();

  await page.waitForURL((url) => url.pathname === "/a", { timeout: 60_000 });
  await expect(
    page.getByRole("button", { name: /Organization: Northwind Traders E2E/ }),
  ).toBeVisible();
});
