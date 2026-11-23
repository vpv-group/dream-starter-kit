import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { fetchAuthUserByEmail, fetchProfile } from "./helpers/db";
import {
  fetchAuthEmail,
  fetchEmailCode,
  fetchEmailText,
  signInWithPasswordUI,
  signUpAndConfirm,
} from "./helpers/mailpit";

/**
 * Account settings on /profile (docs/AUTH.md → Account settings): profile
 * metadata, password change, and Supabase's secure email change — which emails
 * a confirmation link to BOTH the old and the new address and applies only
 * once both are confirmed (supabase/templates/email_change.html →
 * /confirm-email?type=email_change).
 *
 * Each test signs up its own fresh, confirmed member (unique email), so the
 * suite is order-independent. The password dialog always asks for the
 * emailed reauthentication code first (GoTrue itself only verifies it for
 * sessions older than 24h, which a fresh e2e session never is).
 */
test.describe.configure({ mode: "default" });

const uniqueEmail = (tag: string) =>
  `e2e+${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

/** Sonner's top-center toaster (account confirmations land there). */
const topCenterToasts = (page: Page) =>
  page.locator(
    '[data-sonner-toaster][data-y-position="top"][data-x-position="center"]',
  );

async function openProfile(page: Page) {
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible({
    timeout: 30_000,
  });
  // Hydration before interacting (a click before React attaches no-ops).
  await page.waitForLoadState("networkidle");
}

test("edit profile metadata (name, job title, phone) and keep it after reload", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = uniqueEmail("profile");
  await signUpAndConfirm(page, { name: "Profile Tester", email });
  await openProfile(page);

  await page.getByLabel("Display name").fill("Ada Lovelace");
  await page.getByLabel("Job title").fill("Analyst");
  await page.getByLabel("Phone").fill("+1 (555) 010-0199");
  await page.getByRole("button", { name: "Save profile" }).click();
  // A phone change is confirmed prominently + by email (security notice,
  // payload/hooks/notify-contact-change.ts via SMTP → Mailpit).
  await expect(
    topCenterToasts(page).getByText("Phone number changed"),
  ).toBeVisible();
  const notice = await fetchEmailText(email, "Your phone number was changed");
  expect(notice).toContain("A phone number ending in 0199 was added");
  expect(notice).not.toContain("010-0199");

  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Ada Lovelace");
  await expect(page.getByLabel("Job title")).toHaveValue("Analyst");
  await expect(page.getByLabel("Phone")).toHaveValue("+1 (555) 010-0199");

  const user = await fetchAuthUserByEmail(email);
  expect(user).toBeDefined();
  const profile = await fetchProfile(user?.id ?? "");
  expect(profile).toMatchObject({
    display_name: "Ada Lovelace",
    title: "Analyst",
    phone: "+1 (555) 010-0199",
  });
});

test("an invalid phone number is rejected client-side", async ({ page }) => {
  test.setTimeout(120_000);
  await signUpAndConfirm(page, {
    name: "Phone Tester",
    email: uniqueEmail("phone"),
  });
  await openProfile(page);

  await page.getByLabel("Phone").fill("call me");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Enter a valid phone number")).toBeVisible();
});

test("change password: emailed reauthentication code first, then sign in with the new one", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const email = uniqueEmail("password");
  await signUpAndConfirm(page, { name: "Password Tester", email });
  await openProfile(page);

  // Opening the dialog calls reauthenticate(), which emails a 6-digit code;
  // the password fields only appear once a code is entered.
  await page.getByRole("button", { name: "Change password" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
  await expect(dialog.getByText(email)).toBeVisible();
  await expect(dialog.getByLabel("New password")).toHaveCount(0);

  const code = await fetchEmailCode(email, "Confirm it's you");
  // A complete code advances to the password step (same as "Continue").
  await dialog.getByLabel("Confirmation code").fill(code);
  await expect(
    dialog.getByRole("heading", { name: "Change password" }),
  ).toBeVisible();

  await dialog.getByLabel("New password", { exact: true }).fill("short");
  await dialog.getByLabel("Confirm new password").fill("short");
  await dialog.getByRole("button", { name: "Update password" }).click();
  await expect(dialog.getByText(/Use at least \d+ characters/)).toBeVisible();

  const newPassword = "a-much-better-passw0rd";
  await dialog.getByLabel("New password", { exact: true }).fill(newPassword);
  await dialog.getByLabel("Confirm new password").fill(newPassword);
  await dialog.getByRole("button", { name: "Update password" }).click();
  await expect(
    topCenterToasts(page).getByText("Password changed"),
  ).toBeVisible();
  // Supabase's "Password changed" security notification
  // (supabase/templates/password_changed_notification.html).
  expect(await fetchEmailText(email, "Your password was changed")).toContain(
    "was just changed",
  );
  await expect(dialog).toBeHidden();

  const fresh = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const other = await fresh.newPage();
  await signInWithPasswordUI(other, email, newPassword);
  await other.waitForURL(/\/a(\/|$)/, { timeout: 60_000 });
  await fresh.close();
});

test("secure email change: confirm on both addresses, then sign in with the new email", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const oldEmail = uniqueEmail("old");
  const newEmail = uniqueEmail("new");
  await signUpAndConfirm(page, { name: "Email Tester", email: oldEmail });
  await openProfile(page);
  await expect(page.getByTestId("current-email")).toHaveText(oldEmail);

  await page.getByRole("button", { name: "Change email" }).click();
  await page.getByLabel("New email").fill(newEmail);
  await page.getByRole("button", { name: "Send confirmation" }).click();
  await expect(page.getByTestId("pending-email-change")).toContainText(
    newEmail,
  );

  // Secure email change: one link per address, each with its own token.
  const subject = "Confirm your email change";
  const toOld = await fetchAuthEmail(oldEmail, { subject });
  const toNew = await fetchAuthEmail(newEmail, { subject });
  expect(toOld.link).toContain("type=email_change");
  expect(toNew.link).toContain("type=email_change");

  // First link (opened in a fresh browser — token_hash has no PKCE coupling):
  // accepted, but the change waits for the other address.
  const fresh = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const other = await fresh.newPage();
  await other.goto(toOld.link);
  await expect(
    other.getByRole("heading", { name: "One more step" }),
  ).toBeVisible({ timeout: 30_000 });
  await fresh.close();
  expect((await fetchAuthUserByEmail(oldEmail))?.email).toBe(oldEmail);

  // Second link completes it and returns to /profile showing the new email,
  // confirmed by the "Email address changed" toast (?notice=email-changed,
  // stripped from the URL once shown).
  await page.goto(toNew.link);
  await page.waitForURL(/\/profile/, { timeout: 60_000 });
  await expect(page.getByTestId("current-email")).toHaveText(newEmail, {
    timeout: 30_000,
  });
  await expect(
    topCenterToasts(page).getByText(/Email address changed/),
  ).toBeVisible();
  await expect.poll(() => page.url()).not.toContain("notice=");

  const user = await fetchAuthUserByEmail(newEmail);
  expect(user).toBeDefined();
  // The on_auth_user_updated trigger keeps profiles.email in step.
  expect((await fetchProfile(user?.id ?? ""))?.email).toBe(newEmail);
  expect(await fetchAuthUserByEmail(oldEmail)).toBeUndefined();

  // The new address now signs in.
  const signIn = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const signInPage = await signIn.newPage();
  await signInWithPasswordUI(signInPage, newEmail);
  await signInPage.waitForURL(/\/a(\/|$)/, { timeout: 60_000 });
  await signIn.close();
});

test("an invalid email-change link shows the expired state", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUpAndConfirm(page, {
    name: "Bad Link",
    email: uniqueEmail("badlink"),
  });
  await page.goto(
    "/confirm-email?token_hash=not-a-real-token&type=email_change",
  );
  await expect(
    page.getByRole("heading", { name: "Link invalid or expired" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/email-change link is invalid/)).toBeVisible();
});

test("a GoTrue redirect message (default templates) shows as a top-center toast", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // What Supabase's default email-change template redirects to after the
  // first of the two links (lib/auth/url-message.ts).
  const msg =
    "Confirmation+link+accepted.+Please+proceed+to+confirm+link+sent+to+the+other+email";
  await page.goto(`/?message=${msg}#message=${msg}&sb=`);

  const toaster = page.locator(
    '[data-sonner-toaster][data-y-position="top"][data-x-position="center"]',
  );
  await expect(
    toaster.getByText(/Confirmation link accepted\. Open the link we sent/),
  ).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.url()).not.toMatch(/message=|sb=/);
});

test("arbitrary ?message= text is never shown as a toast", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(
    "/?message=Call+us+at+555-0100+to+verify#message=Call+us&sb=",
  );
  await expect
    .poll(() => page.url(), { timeout: 30_000 })
    .not.toContain("message=");
  await expect(page.getByText(/Call us/)).toHaveCount(0);
});
