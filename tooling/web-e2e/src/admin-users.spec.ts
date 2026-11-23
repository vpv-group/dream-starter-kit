import { expect, test } from "@playwright/test";

import { fetchAuthUserByEmail, fetchProfile } from "./helpers/db";
import { FOUNDER_STORAGE_STATE } from "./helpers/founder";
import {
  fetchEmailText,
  signInWithPasswordUI,
  signUpAndConfirm,
} from "./helpers/mailpit";

/**
 * Admin account editing on /admin/collections/users/:id: changing a member's
 * email / phone writes through to Supabase (payload/hooks/sync-user-to-
 * supabase.ts — service role, email pre-confirmed), and the sidebar
 * "Password" panel sets their password (/api/cms/user-password). The member
 * then signs in with the new email + password.
 *
 * Acts as the founder (admin) via founder.setup.ts's saved session. Requires
 * SUPABASE_SERVICE_ROLE_KEY in the web app's .env.
 */
test.use({ storageState: FOUNDER_STORAGE_STATE });

test("admin edits a member's email, phone and password → member signs in", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const oldEmail = `e2e+member-${stamp}@example.com`;
  const newEmail = `e2e+renamed-${stamp}@example.com`;
  const newPassword = "admin-set-passw0rd";

  // A confirmed member, created in their own browser (mirrored into cms.users
  // on the way through /welcome).
  const memberCtx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  await signUpAndConfirm(await memberCtx.newPage(), {
    name: "Managed Member",
    email: oldEmail,
  });
  await memberCtx.close();
  const authUser = await fetchAuthUserByEmail(oldEmail);
  expect(authUser).toBeDefined();

  // Open the member's CMS row from the Users list.
  await page.goto(
    `/admin/collections/users?search=${encodeURIComponent(oldEmail)}`,
  );
  await page
    .getByRole("link", { name: "Managed Member" })
    .first()
    .click({ timeout: 60_000 });
  await page.waitForURL(/\/admin\/collections\/users\/[^/]+$/);
  await page.waitForLoadState("networkidle");

  // Email (top-level) + phone (Contact tab), then save → write-through.
  await page.locator("#field-email").fill(newEmail);
  await page.getByRole("button", { name: "Contact" }).click();
  await page.locator("#field-phone").fill("+44 7700 900123");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/successfully/i)).toBeVisible({
    timeout: 30_000,
  });

  const renamed = await fetchAuthUserByEmail(newEmail);
  expect(renamed?.id).toBe(authUser?.id);
  expect(renamed?.email_confirmed_at).toBeTruthy();
  const profile = await fetchProfile(authUser?.id ?? "");
  expect(profile).toMatchObject({ email: newEmail, phone: "+44 7700 900123" });
  // The member is told about the phone change (payload/hooks/notify-contact-
  // change.ts) at their new address.
  expect(
    await fetchEmailText(newEmail, "Your phone number was changed"),
  ).toContain("ending in 0123");

  // Set a password from the sidebar panel (never stored in the CMS).
  await page.locator("#user-new-password").fill(newPassword);
  await page.locator("#user-confirm-password").fill(newPassword);
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByText("Password updated.")).toBeVisible({
    timeout: 30_000,
  });
  // …and about the admin-set password (/api/cms/user-password).
  expect(await fetchEmailText(newEmail, "Your password was changed")).toContain(
    "An administrator set a new password",
  );

  // The member signs in with the admin-set email + password.
  const signInCtx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const signInPage = await signInCtx.newPage();
  await signInWithPasswordUI(signInPage, newEmail, newPassword);
  await signInPage.waitForURL(/\/a(\/|$)/, { timeout: 60_000 });
  await signInCtx.close();
});
