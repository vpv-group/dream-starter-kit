"use client";

import * as React from "react";

import { useSession } from "@acme/api";

import type { SwitcherWorkspace } from "~/components/workspaces/workspace-switcher";
import type { NavMenuItem } from "~/lib/mod/nav-types";
import { useBranding } from "~/components/branding-provider";
import { resolveNavIcon } from "~/components/nav-icons";
import { NavMain } from "~/components/nav-main";
import { NavUser } from "~/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import { WorkspaceSwitcher } from "~/components/workspaces/workspace-switcher";

/** Teams/Both mode: the workspace switcher replaces the brand header. */
export interface SidebarWorkspaces {
  workspaces: SwitcherWorkspace[];
  activeId: string | null;
  email: string;
  workspaceLabel: string;
  pendingInvites?: { invitationId: string; orgName: string }[];
}

export function AppSidebar({
  navItems,
  workspaces,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  navItems: NavMenuItem[];
  /** Omitted in consumer mode, which renders exactly as before. */
  workspaces?: SidebarWorkspaces;
}) {
  const { user } = useSession();
  const branding = useBranding();
  // The menu is CMS-driven (nav-items collection, staff-edited in /admin) and
  // resolved server-side by the (app) layout; icon names map through the
  // core + generated icon registry with a default fallback.
  const navMain = navItems.map((item) => ({
    key: item.key,
    title: item.label,
    url: item.href,
    icon: resolveNavIcon(item.icon),
    items: item.items?.map((sub) => ({
      key: sub.key,
      title: sub.label,
      url: sub.href,
    })),
  }));
  const sidebarUser = {
    name:
      (user?.user_metadata?.display_name as string | undefined) ??
      user?.email ??
      "User",
    email: user?.email ?? "",
    avatar: (user?.user_metadata?.avatar_url as string | undefined) ?? "",
  };

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        {workspaces ? (
          <WorkspaceSwitcher {...workspaces} />
        ) : (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="data-[slot=sidebar-menu-button]:p-1.5!"
              >
                <a href="/a">
                  {(branding.logoLightUrl ?? branding.logoDarkUrl) ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={
                          branding.logoLightUrl ?? branding.logoDarkUrl ?? ""
                        }
                        alt={branding.appName}
                        className="h-5 w-auto object-contain dark:hidden"
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={
                          branding.logoDarkUrl ?? branding.logoLightUrl ?? ""
                        }
                        alt={branding.appName}
                        className="hidden h-5 w-auto object-contain dark:block"
                      />
                    </>
                  ) : (
                    <>
                      {/* Brand mark from the favicon set (auto light/dark). */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/favicon.svg"
                        alt=""
                        aria-hidden
                        className="size-5"
                      />
                      <span className="text-base font-semibold">
                        {branding.appName}
                      </span>
                    </>
                  )}
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={sidebarUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
