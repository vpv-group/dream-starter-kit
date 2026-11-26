import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { env } from "~/env";
import { createAdminClient } from "~/lib/supabase/admin";
import { getRequestClient } from "~/lib/supabase/request-client";

/**
 * Delete the caller's account (App Store requirement: deletion in-app).
 *
 * Replaces the `delete-account` edge function, so the kit needs no edge
 * function deploy and this works in every environment. Authenticated by the
 * caller's own session (cookie on web, Bearer token from Expo).
 *
 * 1. A sole owner of a workspace with other members must transfer ownership
 *    first (the profiles_guard_delete trigger enforces it; checked here so
 *    nothing irreversible happens and the client can name the workspaces).
 * 2. An `account-erasure` Payload job is queued first (it runs two minutes
 *    later and removes what lives outside `public`: their CMS user row, even
 *    from the Trash, and their storage objects). If queueing fails, nothing
 *    has happened yet and the request fails. The job does nothing if the
 *    auth user still exists, so a deletion that fails below is harmless.
 * 3. Live Stripe subscriptions are cancelled (best-effort) — the database
 *    cascade only removes our mirror rows, not Stripe's state.
 * 4. The auth user is deleted with the service role; ON DELETE CASCADE removes
 *    everything they own in `public`. An audit entry records the deletion
 *    (IDs only — the audit log outlives the account).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await getRequestClient(req);
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { user, supabase } = auth;

  const { data: blocking, error: blockErr } = await supabase.rpc(
    "my_blocking_workspaces",
  );
  if (blockErr) {
    return NextResponse.json({ error: blockErr.message }, { status: 500 });
  }
  if (blocking.length > 0) {
    return NextResponse.json(
      {
        error: "sole_owner_with_members",
        workspaces: blocking.map((w) => w.org_name),
      },
      { status: 409 },
    );
  }

  const admin = createAdminClient();

  // Queue the erasure of what lives outside `public` (CMS user, storage)
  // BEFORE deleting: if queueing fails, nothing is deleted and the client can
  // retry. The job does nothing while the auth user still exists, so a
  // deletion that fails below never erases a live account.
  try {
    const { getPayloadClient } = await import("~/lib/cms/payload-client");
    const payload = await getPayloadClient();
    await payload.jobs.queue({
      task: "account-erasure",
      input: { supabaseUserId: user.id },
      // Runs after the deletion below has happened (the job checks).
      waitUntil: new Date(Date.now() + 2 * 60_000),
    });
  } catch (err) {
    console.error("[account-delete] couldn't queue account-erasure", err);
    return NextResponse.json(
      { error: "Couldn't start the account deletion. Please try again." },
      { status: 500 },
    );
  }

  if (env.STRIPE_SECRET_KEY) {
    try {
      const { data: customer } = await admin
        .from("mod_billing_customers")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (customer?.stripe_customer_id) {
        const { default: Stripe } = await import("stripe");
        const stripe = new Stripe(env.STRIPE_SECRET_KEY);
        const subs = await stripe.subscriptions.list({
          customer: customer.stripe_customer_id,
          status: "all",
        });
        await Promise.all(
          subs.data
            .filter((s) => s.status !== "canceled")
            .map((s) => stripe.subscriptions.cancel(s.id)),
        );
      }
    } catch (err) {
      // Never block deletion on Stripe — log and continue.
      console.error("[account-delete] Stripe cleanup failed", err);
    }
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    const status = delErr.message.includes("sole_owner_with_members")
      ? 409
      : 500;
    return NextResponse.json({ error: delErr.message }, { status });
  }

  await admin.rpc("audit_log_event", {
    _action: "account.deleted",
    _actor_id: user.id,
    _actor_type: "user",
    _entity_type: "user",
    _entity_id: user.id,
  });

  return NextResponse.json({ success: true });
}
