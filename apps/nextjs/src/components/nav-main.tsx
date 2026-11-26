"use client";

import type { Icon } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "~/components/ui/sidebar";
import { activeNavHref } from "~/lib/mod/nav-tree";

export interface NavMainItem {
  key: string;
  title: string;
  url: string;
  icon?: Icon;
  /** A group: the row opens and closes this submenu instead of linking. */
  items?: { key: string; title: string; url: string }[];
}

export function NavMain({ items }: { items: NavMainItem[] }) {
  const pathname = usePathname();
  // One active entry across the whole menu, groups' items included.
  const activeUrl = activeNavHref(
    items.flatMap((i) => [i.url, ...(i.items ?? []).map((s) => s.url)]),
    pathname,
  );

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) =>
            item.items?.length ? (
              <NavGroup key={item.key} item={item} activeUrl={activeUrl} />
            ) : (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={item.url === activeUrl}
                >
                  <Link href={item.url}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ),
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/**
 * A collapsible menu group (shadcn sidebar-07): the row toggles the submenu,
 * which starts open on any of the group's pages (its own home included).
 */
function NavGroup({
  item,
  activeUrl,
}: {
  item: NavMainItem;
  activeUrl: string | undefined;
}) {
  const subItems = item.items ?? [];
  const isCurrent =
    activeUrl !== undefined &&
    (activeUrl === item.url || subItems.some((s) => s.url === activeUrl));

  return (
    <Collapsible asChild defaultOpen={isCurrent} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title}>
            {item.icon && <item.icon />}
            <span>{item.title}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {subItems.map((sub) => (
              <SidebarMenuSubItem key={sub.key}>
                <SidebarMenuSubButton asChild isActive={sub.url === activeUrl}>
                  <Link href={sub.url}>
                    <span>{sub.title}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
