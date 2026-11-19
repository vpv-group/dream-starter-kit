import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod/v4";

import type { InviteResult } from "@acme/app";
import { MAX_INVITES_PER_REQUEST, workspaceErrorMessage } from "@acme/app";
import { slidingWindow } from "@acme/config";

import { getAuthSettings, getBranding } from "~/lib/payload";
import { getRequestClient } from "~/lib/supabase/request-client";
import { inviteLink, sendWorkspaceInvite } from "~/lib/workspaces/invite-email";

/**
 * POST /api/workspaces/:id/invitations — owners/admins invite by email.
 *
 *   body: { emails: string[], role: "member" | "admin" }
 *   200:  { results: [{ email, result, link? }] }
 *
 * create_invitations (SQL, as the caller) checks admin rights, dedupes,
 * skips members, rotates tokens for re-invites and caps ~50 per workspace per
 * day; this route then emails each new token via the Supabase Invite template.
 * `link` is returned only for `existing_account` rows so the admin can share
 * it (Supabase won't send its invite template to an existing account).
 */
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  emails: z.array(z.string().max(320)).min(1).max(MAX_INVITES_PER_REQUEST),
  role: z.enum(["member", "admin"]).default("member"),
});

const RATE_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT = 20;
const hitsByUser = new Map<string, number[]>();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getRequestClient(req);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, supabase } = auth;

  const { allowed, hits } = slidingWindow(
    hitsByUser.get(user.id) ?? [],
    Date.now(),
    RATE_WINDOW_MS,
    RATE_LIMIT,
  );
  hitsByUser.set(user.id, hits);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many invite requests. Try again shortly." },
      { status: 429 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { id: orgId } = await params;
  const [settings, branding] = await Promise.all([
    getAuthSettings(),
    getBranding(),
  ]);

  const { data: rows, error } = await supabase.rpc("create_invitations", {
    _org: orgId,
    _emails: parsed.data.emails,
    _role: parsed.data.role,
    _expires_days: settings.inviteExpiryDays,
  });
  if (error) {
    const status = error.message === "not_allowed" ? 403 : 400;
    return NextResponse.json(
      {
        error: workspaceErrorMessage(error, settings.workspaceLabel),
        code: error.message,
      },
      { status },
    );
  }

  const [{ data: org }, { data: inviter }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).single(),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const results: { email: string; result: InviteResult; link?: string }[] = [];
  for (const row of rows) {
    if (row.result !== "invited") {
      results.push({
        email: row.invite_email,
        result: row.result as InviteResult,
      });
      continue;
    }
    const delivery = await sendWorkspaceInvite({
      email: row.invite_email,
      token: row.invite_token,
      workspaceName: org?.name ?? settings.workspaceLabel,
      inviterName: inviter?.display_name ?? null,
      appName: branding.appName,
    });
    results.push(
      delivery === "existing_account"
        ? {
            email: row.invite_email,
            result: delivery,
            link: inviteLink(row.invite_token),
          }
        : { email: row.invite_email, result: delivery },
    );
  }
  return NextResponse.json({ results });
}
