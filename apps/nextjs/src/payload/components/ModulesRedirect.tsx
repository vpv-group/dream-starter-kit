import type { AdminViewServerProps } from "payload";
import { redirect } from "next/navigation";

/**
 * `/admin/modules` → the Modules list (`/admin/collections/kit-modules`),
 * which now holds module management (catalog, install, update, remove).
 * Kept so old links and bookmarks still work.
 */
export function ModulesRedirect({ initPageResult }: AdminViewServerProps) {
  const adminRoute = initPageResult.req.payload.config.routes.admin;
  redirect(`${adminRoute}/collections/kit-modules`);
}
