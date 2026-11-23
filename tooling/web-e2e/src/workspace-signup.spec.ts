import { expect, test } from "@playwright/test";

import { fetchAuthEmail, signUpToCheckEmail } from "./helpers/mailpit";

/**
 * Teams-mode sign-up (docs/WORKSPACES.md, Flow A): sign up → code from
 * Mailpit → Name your workspace → skip the welcome steps → /a with the
 * workspace switcher showing the new workspace.
 *
 * Runs in the `workspaces` Playwright project: workspaces.setup.ts switches
 * the app to Teams after the main suite, and its teardown restores it.
 */
test.describe.configure({ retries: 0 });

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
  await page.getByLabel("Login code").fill(code ?? "");
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

  // Owners can invite teammates; skip it here (workspace-invite.spec.ts).
  await page.waitForURL(/\/onboarding\/invite$/);
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
