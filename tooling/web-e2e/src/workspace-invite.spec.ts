import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { fetchAuthEmail, signUpToCheckEmail } from "./helpers/mailpit";

/**
 * Workspace invitations (docs/WORKSPACES.md, Flow B), in Teams mode (the
 * `workspaces` project; workspaces.setup.ts flips the model):
 *  1. an owner invites a new address from the Invite step → the Supabase
 *     "Invite user" email (Mailpit) → /accept-invite sets a password →
 *     /welcome?invite= joins → invitee steps → /a in that workspace;
 *  2. the owner creates an invite link in Settings → Members → a new person
 *     opens it, creates an account → lands in the same workspace.
 */
test.describe.configure({ mode: "serial", retries: 0 });

const stamp = Date.now();
const emailWorkspace = `Invites ${stamp % 100000}`;
const linkWorkspace = `Links ${stamp % 100000}`;

/** Sign up with the emailed code and name a workspace; ends on the Profile step. */
async function signUpOwner(page: Page, email: string, workspaceName: string) {
  await signUpToCheckEmail(page, { name: "Owner Person", email });
  await page.getByRole("button", { name: "Enter code manually" }).click();
  const { code } = await fetchAuthEmail(email);
  await page.getByPlaceholder("Enter code").fill(code ?? "");
  await page.getByRole("button", { name: "Continue with login code" }).click();
  await page.waitForURL(/\/onboarding\/workspace/, { timeout: 60_000 });
  await page.getByLabel("Workspace name").fill(workspaceName);
  await expect(page.getByText("Available")).toBeVisible();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL(/\/onboarding\/profile/, { timeout: 30_000 });
}

/** Walk the invitee steps (profile → updates) and land on /a in the workspace. */
async function finishInviteeSteps(page: Page, workspaceName: string) {
  await page.waitForURL(/\/onboarding\/profile/, { timeout: 60_000 });
  await expect(page.getByText(workspaceName).first()).toBeVisible();
  await page.getByRole("button", { name: "Do this later" }).click();
  await page.waitForURL(/\/onboarding\/updates/);
  await page.getByRole("button", { name: "Finish" }).click();
  await page.waitForURL(/\/a(?:[/?#]|$)/, { timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: /switch workspace/i }),
  ).toContainText(workspaceName);
}

test("an emailed invite (Supabase Invite template) lands the invitee in the workspace", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const ownerEmail = `owner+${stamp}@example.com`;
  const inviteeEmail = `invitee+${stamp}@example.com`;

  await signUpOwner(page, ownerEmail, emailWorkspace);
  await page.getByRole("button", { name: "Do this later" }).click();

  // Invite step (owners/admins only).
  await page.waitForURL(/\/onboarding\/invite$/);
  await page.getByLabel("Email addresses").fill(inviteeEmail);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Invite sent")).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText("Waiting on them", { exact: true }),
  ).toBeVisible();

  // The Supabase "Invite user" email, with workspace copy and the redirect.
  const { link } = await fetchAuthEmail(inviteeEmail, { timeoutMs: 30_000 });
  expect(link).toContain("/accept-invite?token_hash=");
  expect(link).toContain("redirect_to=");

  const inviteeContext = await browser.newContext();
  const invitee = await inviteeContext.newPage();
  await invitee.goto(link);
  await expect(invitee.getByRole("heading", { name: /invited/i })).toBeVisible({
    timeout: 30_000,
  });
  await invitee.getByLabel("Password", { exact: true }).fill("password123");
  await invitee.getByLabel("Confirm password").fill("password123");
  await invitee.getByRole("button", { name: "Continue" }).click();

  // /welcome?invite= accepted it: invitees never see Name your workspace.
  await finishInviteeSteps(invitee, emailWorkspace);
  await inviteeContext.close();

  // The owner now sees them as a member in Settings → Members.
  await page.goto("/workspace");
  await expect(page.getByText(inviteeEmail).first()).toBeVisible({
    timeout: 30_000,
  });
});

test("an invite link lets a new person join the workspace", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  // A second owner and workspace keep this test standalone.
  const ownerEmail = `owner2+${stamp}@example.com`;
  const joinerEmail = `joiner+${stamp}@example.com`;
  await signUpOwner(page, ownerEmail, linkWorkspace);

  await page.goto("/workspace");
  await page.getByRole("button", { name: "Create invite link" }).click();
  const linkInput = page.getByLabel("Or share an invite link");
  await expect(linkInput).toHaveValue(/\/join\//, { timeout: 15_000 });
  const joinUrl = await linkInput.inputValue();

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await joiner.goto(joinUrl);
  await expect(
    joiner.getByRole("heading", { name: `Join ${linkWorkspace}` }),
  ).toBeVisible();
  // "Create an account" stores the link token in a cookie, then sign-up.
  await joiner.getByRole("link", { name: "Create an account" }).click();
  await joiner.waitForURL(/\/sign-up/);
  await signUpToCheckEmail(joiner, {
    name: "Joiner Person",
    email: joinerEmail,
  });
  await joiner.getByRole("button", { name: "Enter code manually" }).click();
  const { code } = await fetchAuthEmail(joinerEmail);
  await joiner.getByPlaceholder("Enter code").fill(code ?? "");
  await joiner
    .getByRole("button", { name: "Continue with login code" })
    .click();

  await finishInviteeSteps(joiner, linkWorkspace);
  await joinerContext.close();
});
