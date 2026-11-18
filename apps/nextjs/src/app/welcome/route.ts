import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { PostAuthInput, PostAuthMembership } from "@acme/app";
import {
  activeOnboardingSteps,
  isWorkspaceMode,
  readSignupIntent,
  resolvePostAuthDestination,
} from "@acme/app";

import { reconcileAnonByEmail } from "~/lib/auth/merge-anon";
import { ensureCmsUser, ensureFreeTag } from "~/lib/cms/mirror-user";
import { getPayloadClient } from "~/lib/cms/payload-client";
import { isCmsSeeded } from "~/lib/cms/seed-status";
import { ensureDbProvisioned } from "~/lib/db/bootstrap-runner";
import { getAuthSettings } from "~/lib/payload";
import { getSiteUrl } from "~/lib/site-url";
import { createAdminClient } from "~/lib/supabase/admin";
import { createClient } from "~/lib/supabase/server";

/**
 * Post-auth landing. Gathers the inputs and redirects per the PURE
 * `resolvePostAuthDestination` in @acme/app (docs/WORKSPACES.md → Routing),
 * which mobile reuses. Consumer mode (the default account model) routes
 * exactly as before; Teams/Both add the workspace branches (accept an invite
 * token, resume onboarding, Name your workspace, the hybrid question).
 *
 * Routes by role first. Staff land in the CMS: the FIRST staff
 * login ever (the founder, flagged `profiles.is_staff` by the
 * `handle_new_user` trigger) goes through the CMS setup flow so demo content
 * is seeded behind the shadcn progress bar IMMEDIATELY after the account is
 * created; once the CMS is seeded, staff go STRAIGHT to `/admin` — the
 * `/cms-setup` progress screen is a one-time founder experience, never shown
 * on subsequent sign-ins or to later staff accounts. Everyone else goes to
 * `/a`.
 *
 * Reached as a hard navigation right after password sign-up/sign-in, and as
 * the OAuth callback `next` for the auth pages. Idempotent either way:
 * `/cms-setup` itself also no-ops (and forwards to `/admin`) if it's ever
 * reached with the CMS already seeded.
 *
 * Redirects are built from `getSiteUrl()` (not `request.url`): behind Vercel's
 * proxy `request.url` can carry the internal deployment host. Mirrors
 * `/auth/callback`.
 */
export const dynamic = "force-dynamic";

/**
 * Shown (503 + auto-refresh) while the database behind a brand-new deploy is
 * still being provisioned. The page re-requests /welcome every few seconds;
 * combined with `ensureDbProvisioned` below, the founder's sign-up completes
 * by itself as soon as the database accepts connections — no manual steps, no
 * dead-end error page.
 */
function databaseNotReadyResponse(): NextResponse {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <meta http-equiv="refresh" content="8" />
    <title>Finishing setup…</title>
    <style>
      body { font: 16px/1.6 system-ui, sans-serif; margin: 0; min-height: 100vh;
             display: flex; align-items: center; justify-content: center;
             background: #ffffff; color: #101524; }
      main { max-width: 26rem; padding: 2rem; text-align: center; }
      h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
      p { margin: .5rem 0; color: #414856; }
      .spin { width: 1.5rem; height: 1.5rem; margin: 0 auto 1rem;
              border: 2px solid #e3e6ec; border-top-color: #101524;
              border-radius: 50%; animation: s 1s linear infinite; }
      @keyframes s { to { transform: rotate(360deg); } }
      a { color: inherit; }
      @media (prefers-color-scheme: dark) {
        body { background: #090c14; color: #f2f3f7; }
        p { color: #c6cbd3; }
        .spin { border-color: #292e38; border-top-color: #f2f3f7; }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="spin" aria-hidden="true"></div>
      <h1>Finishing setup…</h1>
      <p>Your database is still being provisioned. This page retries
         automatically — a fresh project usually takes under a minute.</p>
      <p>If it doesn't resolve, check <a href="/api/health/db">/api/health/db</a>
         and the README's Deploy section.</p>
    </main>
  </body>
</html>`;
  return new NextResponse(html, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": "8",
      "Cache-Control": "no-store",
    },
  });
}

/** Invite/join tokens are opaque URL-safe strings; ignore anything else. */
const TOKEN_RE = /^[A-Za-z0-9_-]{16,256}$/;

function readToken(request: NextRequest): PostAuthInput["token"] {
  const params = new URL(request.url).searchParams;
  const invite = params.get("invite");
  if (invite && TOKEN_RE.test(invite)) return { kind: "invite", value: invite };
  const join = params.get("join");
  if (join && TOKEN_RE.test(join)) return { kind: "join", value: join };
  return null;
}

export async function GET(request: NextRequest) {
  const siteUrl = getSiteUrl();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${siteUrl}/sign-in`);
  }

  // A brand-new deploy can reach here BEFORE the runtime DB bootstrap has
  // managed to provision the database (a just-created Supabase project may
  // reject the boot-time connection attempts). This is the founder's first
  // navigation after sign-up — exactly the moment provisioning must exist —
  // so retry it now (single-flight + cooldown; a healthy instance returns
  // immediately). Best-effort: the profiles probe below decides what renders.
  try {
    await ensureDbProvisioned();
  } catch (error) {
    console.warn("[welcome] provisioning retry failed", error);
  }

  // Mirror the user into the Payload Users collection (all users) and ensure a
  // default "Free" tag. Best-effort — never blocks the redirect.
  await ensureCmsUser({
    id: user.id,
    email: user.email,
    name:
      (user.user_metadata.display_name as string | undefined) ??
      (user.user_metadata.name as string | undefined),
    metadata: user.user_metadata,
  });
  await ensureFreeTag(user.id);

  // Reconciliation safety net: a paid anonymous buyer who never confirmed and
  // then signed up fresh would otherwise strand their subscription on the dead
  // anon account. If this (now permanent) user hasn't transacted yet, merge any
  // orphaned anonymous users that carry their email. Cheap guard avoids the
  // listUsers scan for accounts that already have billing. Best-effort.
  if (!user.is_anonymous && user.email) {
    try {
      const { data: customer } = await supabase
        .from("mod_billing_customers")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!customer) {
        await reconcileAnonByEmail(createAdminClient(), user.id, user.email);
      }
    } catch (e) {
      console.warn("[welcome] anon reconciliation failed", e);
    }
  }

  // maybeSingle: zero rows is NOT an error (a missing profile row just routes
  // to /a) — but a query failure (e.g. the profiles table doesn't exist
  // because the runtime DB bootstrap failed) must NOT silently misroute the
  // founder; surface it instead.
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("is_staff, last_org_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error(
      "[welcome] profiles lookup failed — database likely not provisioned",
      error,
    );
    // Auto-refreshing holding page: each refresh re-enters this handler, whose
    // `ensureDbProvisioned` keeps retrying until the database comes up — the
    // founder's first sign-in completes on its own instead of dead-ending.
    return databaseNotReadyResponse();
  }

  const isStaff = profile?.is_staff ?? false;
  const settings = await getAuthSettings();

  // Staff: only the very first staff login should see the seed screen. If the
  // CMS is already seeded, skip /cms-setup entirely. If the seeded check fails
  // (CMS unconfigured, DB unreachable), fall back to /cms-setup — it surfaces
  // a structured, founder-readable error instead of /admin's opaque digest,
  // and its seed POST is idempotent so a stale routing can never double-seed.
  let cmsSeeded: boolean | null = null;
  if (isStaff) {
    try {
      const payload = await getPayloadClient();
      cmsSeeded = await isCmsSeeded(payload);
    } catch (error) {
      console.warn(
        "[welcome] CMS seeded check failed — routing to /cms-setup",
        error,
      );
    }
  }

  // Workspace inputs are only read in Teams/Both mode, so consumer sign-ins do
  // exactly the same queries as before.
  const workspaceMode = !isStaff && isWorkspaceMode(settings);
  const memberships: PostAuthMembership[] = [];
  const ownedOrgs = new Set<string>();
  if (workspaceMode) {
    const { data: rows, error: membershipsError } = await supabase
      .from("memberships")
      .select(
        "org_id, role, onboarding_step, onboarding_completed_at, organizations(owner_id)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (membershipsError) {
      console.warn("[welcome] memberships lookup failed", membershipsError);
    }
    for (const row of rows ?? []) {
      memberships.push({
        orgId: row.org_id,
        role: row.role as "owner" | "admin" | "member",
        onboardingStep: row.onboarding_step,
        onboardingCompletedAt: row.onboarding_completed_at,
      });
      if (row.organizations.owner_id === user.id) ownedOrgs.add(row.org_id);
    }
  }

  const input: PostAuthInput = {
    accountModel: settings.accountModel,
    isStaff,
    isAnonymous: user.is_anonymous ?? false,
    cmsSeeded,
    token: workspaceMode ? readToken(request) : null,
    memberships,
    lastOrgId: profile?.last_org_id ?? null,
    // PR 2 wires my_pending_invitations() here together with the
    // /onboarding/invites screen; until then no invites can be created.
    pendingInvites: 0,
    hybridChoice: readSignupIntent(user.user_metadata),
    stepsFor: (m) =>
      activeOnboardingSteps(settings, {
        isAdmin: m.role !== "member",
        isInvitee: !ownedOrgs.has(m.orgId),
      }),
  };

  let destination = resolvePostAuthDestination(input);

  if (destination.kind === "accept-token") {
    const rpc =
      destination.tokenKind === "invite"
        ? supabase.rpc("accept_invitation", { _token: destination.token })
        : supabase.rpc("join_workspace_by_link", { _token: destination.token });
    const { data: org, error: acceptError } = await rpc;
    if (acceptError) {
      // PR 2 renders these on /invite/[token] (InviteProblem). Until then,
      // route as if no token was carried so the user still lands somewhere.
      console.warn("[welcome] token acceptance failed", acceptError.message);
      destination = resolvePostAuthDestination({ ...input, token: null });
    } else {
      // Joined: an invitee walks the invitee steps for that workspace (the
      // stepsFor callback treats any workspace they don't own as invitee).
      const joined: PostAuthMembership = {
        orgId: org.id,
        role: "member",
        onboardingStep: null,
        onboardingCompletedAt: null,
      };
      destination = resolvePostAuthDestination({
        ...input,
        token: null,
        memberships: [joined, ...memberships.filter((m) => m.orgId !== org.id)],
        lastOrgId: org.id,
      });
    }
  }

  const path = destination.kind === "redirect" ? destination.path : "/a";
  return NextResponse.redirect(`${siteUrl}${path}`);
}
