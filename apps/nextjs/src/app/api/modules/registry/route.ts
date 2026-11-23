import {
  opsConfigured,
  paidModulesEnabled,
  requireAdmin,
} from "~/lib/mod/admin-ops";
import { catalogUrlFor, licenseConfigured } from "~/lib/mod/dream-registry";
import { modulesLock } from "~/mod/lock.generated";
import { modInstalled } from "~/mod/registry.data.generated";

/**
 * Install state for the admin Modules page: the BUNDLED lock (readable on
 * serverless; a deploy containing a new version is the honest "Active"
 * signal), the generated registry, and the catalog URL. Staff-gated.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  return Response.json({
    installed: modInstalled,
    lock: modulesLock,
    opsConfigured: opsConfigured(),
    paidModulesEnabled: paidModulesEnabled(),
    catalogUrl: catalogUrlFor(paidModulesEnabled()),
    licenseConfigured: await licenseConfigured(),
  });
}
