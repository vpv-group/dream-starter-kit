import type { AdminViewServerProps } from "payload";
import { notFound } from "next/navigation";
import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";

import { UpdatesPanel } from "./UpdatesPanel";

/**
 * /admin/updates — automatic updates for the Dream Starter Kit and modules
 * (docs/MODULES.md → Automatic updates). Admins only. The data and actions
 * come from the staff-gated /api/modules/updates and /api/modules/ops routes
 * (UpdatesPanel); settings are stored on meetdream.com, where the update
 * workflow reads them.
 */
export function UpdatesView({
  initPageResult,
  params,
  searchParams,
}: AdminViewServerProps) {
  const { req, permissions, locale, visibleEntities } = initPageResult;
  const roles = (req.user as { roles?: string[] } | null)?.roles ?? [];
  if (!roles.includes("admin")) notFound();
  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      searchParams={searchParams}
      user={req.user ?? undefined}
      visibleEntities={visibleEntities}
    >
      <Gutter>
        <UpdatesPanel />
      </Gutter>
    </DefaultTemplate>
  );
}
