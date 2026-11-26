import type { AdminClient } from "./types";

/**
 * Account resolution shared by every provider's checkout + webhook: guest
 * buyers (match an account by email or invite one) and anonymous buyers
 * (convert them, or merge their purchases into the account that owns the
 * email). Service-role only.
 */

/** A user id by email — an indexed lookup on profiles.email. */
export async function findUserIdByEmail(
  admin: AdminClient,
  email: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc("mod_billing_user_id_by_email", {
    _email: email,
  });
  if (error) throw new Error(error.message);
  // The generated type says string, but the function returns null when no
  // profile has that email.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return data ?? null;
}

/**
 * Resolve a guest buyer to a user id: an existing account with that email, or
 * a new one with a Supabase invite (the invitee sets a password on
 * /accept-invite, then lands on /a). Null when inviting failed.
 */
export async function resolveOrInviteGuest(
  admin: AdminClient,
  email: string,
  displayName: string | null,
  origin: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/accept-invite`,
    data: displayName ? { display_name: displayName } : undefined,
  });
  if (!error) return data.user.id;
  // Already an app user → link to the existing account (no email sent).
  if (error.code === "email_exists" || /already/i.test(error.message)) {
    return await findUserIdByEmail(admin, email);
  }
  console.error("[billing] guest invite failed", error);
  return null;
}

/**
 * Move every billing row from one user to another (an anonymous buyer merged
 * into the account that owns their email). Must run BEFORE the source user is
 * deleted — billing rows cascade with it. A provider customer the target
 * already has at that provider wins (providers can't merge customers); the
 * source's link is dropped and logged.
 */
export async function moveBillingRows(
  admin: AdminClient,
  fromId: string,
  toId: string,
): Promise<void> {
  // Subscriptions: the PK is the provider's id, so repointing never collides.
  await admin
    .from("mod_billing_subscriptions")
    .update({ user_id: toId })
    .eq("user_id", fromId);

  const { data: links } = await admin
    .from("mod_billing_customer_links")
    .select("provider")
    .eq("user_id", fromId);
  const { data: targetLinks } = await admin
    .from("mod_billing_customer_links")
    .select("provider")
    .eq("user_id", toId);
  const taken = new Set((targetLinks ?? []).map((l) => l.provider));
  for (const { provider } of links ?? []) {
    if (taken.has(provider)) {
      console.warn(
        `[billing] ${toId} already has a ${provider} customer; dropping ${fromId}'s (manual review may be needed).`,
      );
      await admin
        .from("mod_billing_customer_links")
        .delete()
        .eq("user_id", fromId)
        .eq("provider", provider);
    } else {
      await admin
        .from("mod_billing_customer_links")
        .update({ user_id: toId })
        .eq("user_id", fromId)
        .eq("provider", provider);
    }
  }

  // Legacy Stripe mapping (user_id is unique there).
  const { data: legacyTarget } = await admin
    .from("mod_billing_customers")
    .select("user_id")
    .eq("user_id", toId)
    .maybeSingle();
  if (legacyTarget) {
    await admin.from("mod_billing_customers").delete().eq("user_id", fromId);
  } else {
    await admin
      .from("mod_billing_customers")
      .update({ user_id: toId })
      .eq("user_id", fromId);
  }
}

/** Whether the user ever bought anything (a purchase or a customer link). */
export async function hasBillingRecord(
  admin: AdminClient,
  userId: string,
): Promise<boolean> {
  const [{ data: sub }, { data: link }, { data: legacy }] = await Promise.all([
    admin
      .from("mod_billing_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
    admin
      .from("mod_billing_customer_links")
      .select("user_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
    admin
      .from("mod_billing_customers")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  return Boolean(sub ?? link ?? legacy);
}

/**
 * An anonymous buyer (favorited → anon account → checked out) becomes
 * permanent: if another account already owns the email, their purchases move
 * there and the anon user is deleted; otherwise the anon user takes the email
 * (confirmed — a completed payment is strong intent). Returns the user id the
 * purchase now belongs to.
 */
export async function convertOrMergeAnon(
  admin: AdminClient,
  anonId: string,
  email: string,
): Promise<string> {
  const { data: got } = await admin.auth.admin.getUserById(anonId);
  if (!got.user?.is_anonymous) return anonId; // already permanent

  const existingId = await findUserIdByEmail(admin, email);
  if (existingId && existingId !== anonId) {
    await moveBillingRows(admin, anonId, existingId);
    await admin.auth.admin.deleteUser(anonId);
    return existingId;
  }
  await admin.auth.admin.updateUserById(anonId, { email, email_confirm: true });
  return anonId;
}

/** The account (login) email, or null when it can't be read. */
export async function accountEmailOf(
  admin: AdminClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) return null;
    return data.user.email ?? null;
  } catch {
    return null;
  }
}
