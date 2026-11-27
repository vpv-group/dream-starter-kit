import type { ServerProps } from "payload";

import { UpdatesAlertClient } from "./UpdatesAlertClient";

/**
 * Top of every /admin page (Payload `admin.components.header`): "Updates
 * available" when the starter kit or an installed module is behind its newest
 * release, with Update / Update all. Admins only, like the Updates page; the
 * client part loads /api/modules/outdated after the page renders, so the
 * GitHub and registry lookups never slow an admin page down.
 */
export function UpdatesAlert({ user }: ServerProps) {
  const roles = (user as { roles?: string[] } | undefined)?.roles ?? [];
  if (!roles.includes("admin")) return null;
  return <UpdatesAlertClient />;
}
