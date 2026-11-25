import type { CollectionBeforeChangeHook } from "payload";
import { APIError } from "payload";

import type { User } from "@acme/cms";

import { getSiteUrl } from "~/lib/site-url";
import { createAdminClient } from "~/lib/supabase/admin";
import { hasStaffRole } from "../access";

/**
 * User invite — runs when an admin creates a row in the `users` collection
 * from the CMS (`/admin` → Users → Create New, or POST /cms-api/users).
 *
 * Sends a Supabase invite email (the invitee clicks it, lands on
 * /accept-invite and sets a password) and sets `profiles.is_staff` from the
 * chosen roles: admin/editor/author → staff (they continue to /admin), member
 * only → an app user (/welcome sends them to the app). The service-role
 * client is the one writer allowed to touch that column (RLS revokes it from
 * users by design); later role edits keep it in step via
 * hooks/sync-user-to-supabase.ts.
 * The new auth user's id is stored as `supabaseUserId` so the SSO bridge
 * (payload/auth/supabase-strategy.ts) finds this row instead of JIT-creating
 * a duplicate on their first visit.
 *
 * Deliberately skipped for the two server-side create paths:
 *  - the SSO bridge's JIT provisioning (it sets `supabaseUserId`), and
 *  - the CMS seed's placeholder author (Local API, no `req.user`).
 *
 * If the email already belongs to an app user, no email is sent — the existing
 * account is linked and its staff access set from the roles instead
 * (re-running a failed invite lands here too, which makes the operation
 * self-healing).
 */
export const inviteUserOnCreate: CollectionBeforeChangeHook<User> = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== "create" || data.supabaseUserId || !req.user) return data;

  const email = typeof data.email === "string" ? data.email.trim() : "";
  if (!email) {
    throw new APIError("An email address is required to invite a user.", 400);
  }

  const admin = createAdminClient();
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(
    email,
    {
      // Invite links carry their tokens in the URL hash (implicit flow — there
      // is no PKCE state for an admin-generated link), so they're handled by
      // the client-side /accept-invite page, not /auth/callback.
      redirectTo: `${getSiteUrl()}/accept-invite`,
      // Picked up by the handle_new_user trigger for the profile display name.
      data: data.name ? { display_name: data.name } : undefined,
    },
  );

  let supabaseUserId: string;
  if (error) {
    if (error.code !== "email_exists") {
      throw new APIError(`Could not send the invite: ${error.message}`, 502);
    }
    // Already an app user → link (and set staff access) instead of emailing
    // an invite (an invite would be a confusing "create account" prompt).
    const existing = await findAuthUserByEmail(admin, email);
    if (!existing) {
      throw new APIError(
        `${email} already has an account, but it could not be looked up to promote it.`,
        502,
      );
    }
    supabaseUserId = existing.id;
    req.payload.logger.info(
      `User invite: ${email} already has an account — linking it without sending an email.`,
    );
  } else {
    supabaseUserId = invited.user.id;
  }

  // Staff access follows the roles. The profiles row exists by now:
  // handle_new_user fires synchronously on auth.users insert. Zero updated
  // rows means it doesn't — fail loudly rather than leaving a CMS row whose
  // roles and `is_staff` disagree.
  const isStaff = hasStaffRole(data.roles ?? ["member"]);
  const { data: updated, error: updateError } = await admin
    .from("profiles")
    .update({ is_staff: isStaff })
    .eq("id", supabaseUserId)
    .select("id");
  const applied = !updateError && updated.length > 0;
  if (!applied) {
    throw new APIError(
      `Invited ${email}, but setting their access failed${
        updateError ? `: ${updateError.message}` : " (no profile row found)"
      }. Re-create the user to retry.`,
      502,
    );
  }

  return { ...data, supabaseUserId };
};

/**
 * Look up an auth user by email via the admin API. Paged scan — O(users), fine
 * at starter-kit scale; swap for a `profiles` email mirror if it ever matters.
 */
async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
) {
  const target = email.toLowerCase();
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw new APIError(error.message, 502);
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
}
