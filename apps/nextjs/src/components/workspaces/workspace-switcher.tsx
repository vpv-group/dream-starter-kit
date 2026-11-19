"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Mail, Plus, Settings } from "lucide-react";

import { labelLower, labelWithArticle, useSetActiveOrg } from "@acme/app";
import { toast } from "@acme/ui/toast";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "~/components/ui/sidebar";

export interface SwitcherWorkspace {
  id: string;
  name: string;
  logoUrl: string | null;
  role: "owner" | "admin" | "member";
}

/** Mirrors lib/workspaces/server.ts → ACTIVE_ORG_COOKIE (a hint, server-validated). */
const ACTIVE_ORG_COOKIE = "active_org";
const ONE_YEAR = 60 * 60 * 24 * 365;

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member" };

function rememberActiveOrg(id: string): void {
  document.cookie = `${ACTIVE_ORG_COOKIE}=${id}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

function WorkspaceMark({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl: string | null;
  className?: string;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        aria-hidden
        className={`rounded-md object-cover ${className ?? "size-8"}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`bg-sidebar-primary text-sidebar-primary-foreground flex shrink-0 items-center justify-center rounded-md text-sm font-semibold ${className ?? "size-8"}`}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

/**
 * shadcn "team switcher" (SidebarMenu + DropdownMenu) at the top of the app
 * sidebar in Teams/Both mode (wireframe Home). Lists the user's workspaces,
 * pending invitations, "Create a workspace", and Workspace settings
 * (Settings → Members at /workspace).
 */
export function WorkspaceSwitcher({
  workspaces,
  activeId,
  email,
  workspaceLabel,
  pendingInvites = [],
}: {
  workspaces: SwitcherWorkspace[];
  activeId: string | null;
  email: string;
  workspaceLabel: string;
  /** Invites to my email I haven't joined — "Join {name}" items. */
  pendingInvites?: { invitationId: string; orgName: string }[];
}) {
  const router = useRouter();
  const { isMobile } = useSidebar();
  const setActive = useSetActiveOrg();
  const active = workspaces.find((w) => w.id === activeId) ?? null;
  const lower = labelLower(workspaceLabel);

  async function switchTo(id: string) {
    if (id === activeId) return;
    try {
      await setActive.mutateAsync(id);
    } catch {
      toast.error(`Couldn't switch ${lower}. Please try again.`);
      return;
    }
    rememberActiveOrg(id);
    router.refresh();
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              aria-label={`Switch ${lower}`}
            >
              {active ? (
                <WorkspaceMark name={active.name} logoUrl={active.logoUrl} />
              ) : (
                <WorkspaceMark name={email} logoUrl={null} />
              )}
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {active?.name ?? "Personal"}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {active ? ROLE_LABEL[active.role] : email}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground truncate font-mono text-xs uppercase">
              {email}
            </DropdownMenuLabel>
            {workspaces.map((w) => (
              <DropdownMenuItem
                key={w.id}
                className="gap-2 p-2"
                onSelect={() => void switchTo(w.id)}
              >
                <WorkspaceMark
                  name={w.name}
                  logoUrl={w.logoUrl}
                  className="size-6"
                />
                <span className="truncate">{w.name}</span>
                {w.id === activeId ? (
                  <Check className="ml-auto size-4" aria-label="Active" />
                ) : null}
              </DropdownMenuItem>
            ))}
            {pendingInvites.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  Invitations
                </DropdownMenuLabel>
                {pendingInvites.map((invite) => (
                  <DropdownMenuItem
                    key={invite.invitationId}
                    className="gap-2 p-2"
                    asChild
                  >
                    <a href="/onboarding/invites">
                      <Mail className="size-4" />
                      <span className="truncate">Join {invite.orgName}</span>
                    </a>
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
            {workspaces.length > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem className="gap-2 p-2" asChild>
              <a href="/onboarding/workspace">
                <Plus className="size-4" />
                Create {labelWithArticle(lower)}
              </a>
            </DropdownMenuItem>
            {active ? (
              <DropdownMenuItem className="gap-2 p-2" asChild>
                <a href="/workspace">
                  <Settings className="size-4" />
                  {workspaceLabel} settings
                </a>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
