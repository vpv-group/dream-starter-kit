import type { CollectionBeforeChangeHook } from "payload";
import { APIError } from "payload";

import type { User } from "@acme/cms";

// Relative (not `~/`) so the unit test can vi.mock it.
import { createAdminClient } from "../../lib/supabase/admin";

/** `req.context` flag: set by server-side writers whose values came FROM Supabase. */
export const SKIP_SUPABASE_SYNC = "skipSupabaseSync";

const norm = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/**
 * Write-through for admin edits on `/admin/collections/users/:id` — keeps
 * Supabase (the identity source) in step with what staff change in the CMS:
 *
 *  - `email` → `auth.admin.updateUserById(id, { email, email_confirm: true })`.
 *    An admin edit is trusted, so it applies immediately and skips the
 *    double-confirm emails a member's own change goes through (see
 *    docs/AUTH.md → Account settings). The `on_auth_user_updated` trigger
 *    mirrors it into `profiles.email`. Only `admin` may edit the field
 *    (field access in collections/Users.ts).
 *  - `displayName` / `phone` / `jobTitle` → `profiles.display_name / phone /
 *    title` (service role — the same columns the member edits on /profile) and
 *    `user_metadata.display_name / phone` (the app's sidebar + menus read it;
 *    GoTrue merges user_metadata).
 *
 * Passwords never live in the CMS — they're set from the "Password" panel
 * (components/UserPasswordField.tsx → /api/cms/user-password).
 *
 * Runs as `beforeChange` so a Supabase failure (e.g. the email is taken)
 * aborts the save with an admin toast instead of leaving the two out of sync.
 * Skipped for creates (the invite hook owns those), for server-side writes
 * with no `req.user` (SSO bridge, signup mirror, seed), for writes flagged
 * `context.skipSupabaseSync` (values that came from Supabase in the first
 * place — lib/cms/mirror-user.ts), and for rows not linked to a Supabase user.
 */
export const syncUserToSupabase: CollectionBeforeChangeHook<User> = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  if (operation !== "update" || !req.user) return data;
  if (req.context[SKIP_SUPABASE_SYNC]) return data;
  const supabaseUserId = norm(originalDoc?.supabaseUserId);
  if (!supabaseUserId || originalDoc?.deletedAt) return data;

  // `data` may be partial (REST/Local API PATCH): a key that's absent wasn't
  // edited, so only diff the keys the caller actually sent.
  const changed = (key: "email" | "displayName" | "phone" | "jobTitle") =>
    key in data && norm(data[key]) !== norm(originalDoc?.[key]);

  const emailChanged =
    changed("email") &&
    norm(data.email)?.toLowerCase() !== norm(originalDoc?.email)?.toLowerCase();
  const nameChanged = changed("displayName");
  const phoneChanged = changed("phone");
  const titleChanged = changed("jobTitle");
  if (!emailChanged && !nameChanged && !phoneChanged && !titleChanged) {
    return data;
  }

  const admin = createAdminClient();

  // 1. Auth user: login email + the user_metadata the app reads.
  const attrs: {
    email?: string;
    email_confirm?: boolean;
    user_metadata?: Record<string, unknown>;
  } = {};
  if (emailChanged) {
    const email = norm(data.email);
    if (!email) {
      throw new APIError("A linked user must keep an email address.", 400);
    }
    attrs.email = email;
    attrs.email_confirm = true;
  }
  const meta: Record<string, unknown> = {};
  if (nameChanged) meta.display_name = norm(data.displayName);
  if (phoneChanged) meta.phone = norm(data.phone);
  if (Object.keys(meta).length) attrs.user_metadata = meta;

  if (Object.keys(attrs).length) {
    const { error } = await admin.auth.admin.updateUserById(
      supabaseUserId,
      attrs,
    );
    if (error) {
      if (error.code === "email_exists") {
        throw new APIError(
          "That email address is already used by another account.",
          409,
        );
      }
      throw new APIError(
        `Could not update the Supabase account: ${error.message}`,
        502,
      );
    }
  }

  // 2. profiles row (RLS clients — web + native — read it).
  const profile: {
    display_name?: string;
    phone?: string | null;
    title?: string | null;
  } = {};
  // display_name is NOT NULL-ish in practice (handle_new_user always sets it):
  // a cleared CMS display name keeps the profile's current one.
  const displayName = norm(data.displayName);
  if (nameChanged && displayName) profile.display_name = displayName;
  if (phoneChanged) profile.phone = norm(data.phone);
  if (titleChanged) profile.title = norm(data.jobTitle);
  if (Object.keys(profile).length) {
    const { error } = await admin
      .from("profiles")
      .update(profile)
      .eq("id", supabaseUserId);
    if (error) {
      throw new APIError(
        `Could not update the user's profile: ${error.message}`,
        502,
      );
    }
  }

  req.payload.logger.info(
    `[sync-user-to-supabase] updated ${supabaseUserId}: ${[
      emailChanged && "email",
      nameChanged && "displayName",
      phoneChanged && "phone",
      titleChanged && "jobTitle",
    ]
      .filter(Boolean)
      .join(", ")}`,
  );
  return data;
};
