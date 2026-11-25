import { redirect } from "next/navigation";

import { needsWorkspaceGate } from "@acme/app";

import type { SidebarWorkspaces } from "~/components/app-sidebar";
import type { GettingStarted } from "~/components/workspaces/home-getting-started";
import { AppSidebar } from "~/components/app-sidebar";
import { BrandingProvider } from "~/components/branding-provider";
import { GlassTabBar } from "~/components/glass-tab-bar";
import { AppModWidgetsProvider } from "~/components/mod-widgets-provider";
import { ReloadOnBfcacheRestore } from "~/components/reload-on-bfcache-restore";
import { SiteHeader } from "~/components/site-header";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import { HomeGettingStarted } from "~/components/workspaces/home-getting-started";
import { ensureCmsUser, ensureFreeTag } from "~/lib/cms/mirror-user";
import { disabledModuleSlugs } from "~/lib/mod/enabled";
import { getWebNavItems } from "~/lib/mod/nav";
import { getWebTabMenu } from "~/lib/mod/web-tab-menu";
import { getAuthSettings, getBranding } from "~/lib/payload";
import { createClient } from "~/lib/supabase/server";
import { buildChecklist } from "~/lib/workspaces/checklist";
import { getWorkspaceContext } from "~/lib/workspaces/server";

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

  const [branding, navItems, tabMenu, disabledSlugs, profile] =
    await Promise.all([
      getBranding(),
      // CMS-driven menu (nav-items collection) — staff edits in /admin show up
      // without a redeploy; degrades to the generated defaults if the CMS is down.
      getWebNavItems(),
      // Phone/tablet bottom tab bar: the SAME menu as the native app's tab bar
      // (/admin → Navigation → "iOS and Android App"), filtered per user.
      getWebTabMenu(),
      disabledModuleSlugs(),
      // Staff/admin flag gates the header's CMS settings shortcut (RLS read-own).
      supabase.from("profiles").select("is_staff").eq("id", user.id).single(),
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

  // Teams/Both (docs/WORKSPACES.md): workspace switcher, getting-started
  // checklist on /a, and — in Teams mode — no app without a workspace.
  // Consumer mode skips all of it and renders exactly as before.
  const settings = await getAuthSettings();
  let sidebarWorkspaces: SidebarWorkspaces | undefined;
  let gettingStarted: GettingStarted | null = null;
  if (settings.accountModel !== "consumer" && !user.is_anonymous) {
    const ctx = await getWorkspaceContext();
    if (ctx) {
      if (
        needsWorkspaceGate({
          accountModel: settings.accountModel,
          isStaff,
          isAnonymous: false,
          membershipCount: ctx.workspaces.length,
        })
      ) {
        redirect(
          ctx.pendingInvites.length > 0
            ? "/onboarding/invites"
            : "/onboarding/workspace",
        );
      }
      sidebarWorkspaces = {
        workspaces: ctx.workspaces.map((w) => ({
          id: w.id,
          name: w.name,
          logoUrl: w.logoUrl,
          role: w.role,
        })),
        activeId: ctx.active?.id ?? null,
        email: ctx.profile.email,
        workspaceLabel: settings.workspaceLabel,
        pendingInvites: ctx.pendingInvites,
      };
      if (ctx.active) {
        gettingStarted = {
          workspaceName: ctx.active.name,
          items: buildChecklist(settings, ctx.active),
        };
      }
    }
  }

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
        <AppSidebar
          variant="inset"
          navItems={navItems}
          workspaces={sidebarWorkspaces}
        />
        {/* --app-bottom-inset: room the bottom tab bar takes below `lg`
            (62px bar + its bottom offset + a 12px gap); 0 on desktop.
            Full-height screens (chat) subtract it. */}
        <SidebarInset className="[--app-bottom-inset:calc(62px_+_max(20px,env(safe-area-inset-bottom))_+_12px)] lg:[--app-bottom-inset:0px]">
          <SiteHeader isStaff={isStaff} navItems={navItems} />
          <AppModWidgetsProvider disabledSlugs={disabledSlugs}>
            {gettingStarted ? (
              <HomeGettingStarted data={gettingStarted} />
            ) : null}
            {children}
          </AppModWidgetsProvider>
          <div aria-hidden className="h-(--app-bottom-inset) shrink-0" />
        </SidebarInset>
        <GlassTabBar tabs={tabMenu.tabs} all={tabMenu.all} routes={navItems} />
      </SidebarProvider>
    </BrandingProvider>
  );
}
