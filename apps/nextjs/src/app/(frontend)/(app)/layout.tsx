import { redirect } from "next/navigation";

import { resolveOrganizationGate } from "@acme/app";

import { WebActiveOrgProvider } from "~/components/active-org-provider";
import { AppSidebar } from "~/components/app-sidebar";
import { BrandingProvider } from "~/components/branding-provider";
import { AppModWidgetsProvider } from "~/components/mod-widgets-provider";
import { ReloadOnBfcacheRestore } from "~/components/reload-on-bfcache-restore";
import { SiteHeader } from "~/components/site-header";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import { ensureCmsUser, ensureFreeTag } from "~/lib/cms/mirror-user";
import { disabledModuleSlugs } from "~/lib/mod/enabled";
import { getWebNavItems } from "~/lib/mod/nav";
import { getOrgContext } from "~/lib/org/active-org";
import { getAuthSettings, getBranding } from "~/lib/payload";
import { createClient } from "~/lib/supabase/server";

/**
 * Server-side guard for the authenticated area (belt-and-suspenders with
 * middleware). Anything under (app) requires a session.
 *
 * Also provides the shared shadcn `dashboard-01` shell — sidebar + header — so
 * every signed-in page (dashboard, chat, reminders, notifications, profile)
 * renders inside one consistent chrome. Pages return only their content.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const [branding, navItems, disabledSlugs, profile, authSettings, orgContext] =
    await Promise.all([
      getBranding(),
      // CMS-driven menu (nav-items collection) — staff edits in /admin show up
      // without a redeploy; degrades to the generated defaults if the CMS is down.
      getWebNavItems(),
      disabledModuleSlugs(),
      // Staff/admin flag gates the header's CMS settings shortcut (RLS read-own).
      supabase.from("profiles").select("is_staff").eq("id", user.id).single(),
      getAuthSettings(),
      // The user's organizations + the active one (header switcher, org gate).
      getOrgContext(supabase, user.id),
      // Universal backstop for the cms.users mirror: guest-checkout buyers (and
      // any future out-of-band signup) establish their session without passing
      // through /welcome or /auth/callback, so mirror here the first time they
      // reach the app shell. Idempotent + best-effort (swallows its own errors),
      // so it never blocks render — for already-mirrored users it's one indexed
      // lookup. Skip ANONYMOUS sessions (anon-first identity): they must not
      // become permanent ghost cms.users rows — they're mirrored on conversion.
      // See lib/cms/mirror-user.ts.
      user.is_anonymous
        ? Promise.resolve()
        : ensureCmsUser({
            id: user.id,
            email: user.email,
            name:
              (user.user_metadata.display_name as string | undefined) ??
              (user.user_metadata.name as string | undefined),
            metadata: user.user_metadata,
          }),
      user.is_anonymous ? Promise.resolve() : ensureFreeTag(user.id),
    ]);
  const isStaff = profile.data?.is_staff ?? false;

  // Organization mode "required": a non-staff user without a membership must
  // create or join one first (backstop for /welcome; docs/AUTH.md).
  const gate = resolveOrganizationGate({
    isStaff,
    isAnonymous: user.is_anonymous ?? false,
    mode: authSettings.organizationMode,
    hasMembership: orgContext.orgs.length > 0,
  });
  if (gate) redirect(gate);

  return (
    <BrandingProvider value={branding}>
      {/* After logout, Back must not restore this entitled shell from bfcache
          without a server re-check (shared-machine leak). */}
      <ReloadOnBfcacheRestore />
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" navItems={navItems} />
        <SidebarInset>
          <WebActiveOrgProvider
            orgs={orgContext.orgs}
            activeId={orgContext.activeId}
          >
            <SiteHeader
              isStaff={isStaff}
              navItems={navItems}
              showOrgSwitcher={
                orgContext.orgs.length > 1 ||
                (orgContext.orgs.length > 0 &&
                  authSettings.organizationMode !== "off")
              }
              canCreateOrg={authSettings.organizationMode !== "off"}
            />
            <AppModWidgetsProvider disabledSlugs={disabledSlugs}>
              {children}
            </AppModWidgetsProvider>
          </WebActiveOrgProvider>
        </SidebarInset>
      </SidebarProvider>
    </BrandingProvider>
  );
}
