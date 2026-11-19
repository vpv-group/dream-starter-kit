import type { APIRequestContext } from "@playwright/test";
import { expect, request as playwrightRequest, test } from "@playwright/test";

import { FOUNDER_STORAGE_STATE } from "./helpers/founder";
import { fetchAuthEmail, signUpToCheckEmail } from "./helpers/mailpit";

/**
 * Teams-mode sign-up (docs/WORKSPACES.md, Flow A): sign up → code from
 * Mailpit → Name your workspace → skip the welcome steps → /a with the
 * workspace switcher showing the new workspace.
 *
 * Runs in the `workspaces` Playwright project, AFTER the main suite (it flips
 * the site-wide account model, which would reroute parallel consumer
 * sign-ups), and restores Individuals afterwards even on failure.
 */
test.describe.configure({ mode: "serial", retries: 0 });

const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
let staff: APIRequestContext;

async function setAccountModel(accountModel: "consumer" | "business") {
  // Payload REST global update, authenticated as the founder (staff) through
  // the Supabase SSO strategy — the same write path as /admin.
  const res = await staff.post("/cms-api/globals/authentication-settings", {
    data: { accountModel },
  });
  expect(res.ok(), `set accountModel=${accountModel}: ${res.status()}`).toBe(
    true,
  );
}

test.beforeAll(async () => {
  staff = await playwrightRequest.newContext({
    baseURL,
    storageState: FOUNDER_STORAGE_STATE,
  });
  await setAccountModel("business");
});

test.afterAll(async () => {
  await setAccountModel("consumer");
  await staff.dispose();
});

test("a Teams-mode sign-up names a workspace and lands in it", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const email = `ws+${stamp}@example.com`;
  const workspaceName = `Acme ${stamp % 100000}`;

  await signUpToCheckEmail(page, { name: "Ana Lopez", email });

  // Confirm with the emailed 6-digit code.
  await page.getByRole("button", { name: "Enter code manually" }).click();
  const { code } = await fetchAuthEmail(email);
  expect(code).toBeTruthy();
  await page.getByPlaceholder("Enter code").fill(code ?? "");
  await page.getByRole("button", { name: "Continue with login code" }).click();

  // /welcome → Name your workspace (no membership yet, business mode).
  await page.waitForURL(/\/onboarding\/workspace/, { timeout: 60_000 });
  await page.getByLabel("Workspace name").fill(workspaceName);
  // The slug auto-derives from the name and is checked for availability.
  await expect(page.getByLabel("Workspace URL")).toHaveValue(
    `acme-${stamp % 100000}`,
  );
  await expect(page.getByText("Available")).toBeVisible();
  await page.getByRole("button", { name: "Create workspace" }).click();

  // Splash, then the first welcome step.
  await page.waitForURL(/\/onboarding\/profile/, { timeout: 30_000 });
  await expect(page.getByText("Step 01")).toBeVisible();
  await page.getByRole("button", { name: "Do this later" }).click();

  await page.waitForURL(/\/onboarding\/updates/);
  await page.getByRole("button", { name: "Finish" }).click();

  // Home: checklist + the switcher showing the new workspace.
  await page.waitForURL(/\/a(?:[/?#]|$)/, { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: `Welcome to ${workspaceName}` }),
  ).toBeVisible();
  const switcher = page.getByRole("button", { name: /switch workspace/i });
  await expect(switcher).toContainText(workspaceName);
  await switcher.click();
  await expect(
    page.getByRole("menuitem", { name: "Create a workspace" }),
  ).toBeVisible();

  // Signing in again resumes nothing: onboarding is finished → /a.
  const welcome = await page.request.get("/welcome", { maxRedirects: 0 });
  expect(welcome.headers().location).toMatch(/\/a$/);
});
