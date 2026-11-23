import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { makePasswordSchema } from "@acme/app";

import { getPayloadClient } from "~/lib/cms/payload-client";
import { passwordSetByAdminEmail } from "~/lib/email/security-notices";
import { getAuthSettings } from "~/lib/payload";
import { createAdminClient } from "~/lib/supabase/admin";

/**
 * Set a member's Supabase password from /admin (the Users "Password" panel —
 * payload/components/UserPasswordField.tsx). Passwords never live in the CMS:
 * the value goes straight to `auth.admin.updateUserById` (service role,
 * server-only — golden rule #2) and is never stored or logged.
 *
 * Authed via the Payload admin session and restricted to the `admin` role
 * (editors can't take over other accounts). Keyed by the Payload user doc id →
 * its `supabaseUserId`; trashed rows are refused.
 */
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  docId: z.union([z.string(), z.number()]).transform(String),
  password: z.string(),
});

export async function POST(request: Request) {
  const payload = await getPayloadClient();
  const { user } = await payload.auth({ headers: await headers() });
  if (!user?.roles.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Same minimum the sign-up / change-password forms enforce (auth-settings
  // global). Supabase still applies its own minimum + strength rules.
  const { minPasswordLength } = await getAuthSettings();
  const check = makePasswordSchema(minPasswordLength).safeParse(
    parsed.data.password,
  );
  if (!check.success) {
    return NextResponse.json(
      { error: check.error.issues[0]?.message ?? "Invalid password" },
      { status: 400 },
    );
  }

  const doc = await payload
    .findByID({ collection: "users", id: parsed.data.docId, depth: 0 })
    .catch(() => null);
  const supabaseUserId = doc?.supabaseUserId;
  if (!doc || !supabaseUserId) {
    return NextResponse.json({ error: "User not linked" }, { status: 404 });
  }
  if (doc.deletedAt) {
    return NextResponse.json(
      { error: "Restore this user from the Trash first." },
      { status: 409 },
    );
  }

  const { error } = await createAdminClient().auth.admin.updateUserById(
    supabaseUserId,
    { password: parsed.data.password },
  );
  if (error) {
    const message =
      error.code === "weak_password"
        ? "That password is too weak. Try a longer one."
        : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  payload.logger.info(
    `[user-password] admin ${String(user.id)} set the password for ${supabaseUserId}`,
  );

  // Tell the account owner (Supabase's own "password changed" notice covers a
  // member's self-service change, not an admin reset). Best-effort.
  if (doc.email) {
    try {
      await payload.sendEmail({
        to: doc.email,
        ...passwordSetByAdminEmail({ email: doc.email }),
      });
    } catch (e) {
      payload.logger.error(
        `[user-password] notice email failed for ${supabaseUserId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }
  return NextResponse.json({ ok: true });
}
