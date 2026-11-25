import type { Icon } from "@tabler/icons-react";
import {
  IconBell,
  IconCalendar,
  IconClock,
  IconCreditCard,
  IconDashboard,
  IconHome,
  IconLayoutGrid,
  IconMessageCircle,
  IconNews,
  IconNotes,
  IconUser,
} from "@tabler/icons-react";

import { modIcons } from "~/mod/registry.client.generated";

/**
 * Icon-name → component map for the CMS-driven menu: the core set below plus
 * every icon referenced by module manifests (generated registry). `nav-items`
 * rows store plain icon NAMES so the planned icon-picker follow-up can swap in
 * without a schema change; unknown names get the default icon.
 */
const CORE_ICONS: Record<string, Icon> = {
  IconBell,
  IconCalendar,
  IconClock,
  IconCreditCard,
  IconDashboard,
  IconHome,
  IconLayoutGrid,
  IconMessageCircle,
  IconNews,
  IconNotes,
  IconUser,
};

export const DEFAULT_NAV_ICON: Icon = IconLayoutGrid;

export function resolveNavIcon(name: string | undefined): Icon {
  if (!name) return DEFAULT_NAV_ICON;
  return (
    CORE_ICONS[name] ?? (modIcons[name] as Icon | undefined) ?? DEFAULT_NAV_ICON
  );
}
