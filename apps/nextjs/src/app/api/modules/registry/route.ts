import {
  githubConnected,
  paidModulesEnabled,
  requireAdmin,
} from "~/lib/mod/admin-ops";
import { catalogUrl, licenseConfigured } from "~/lib/mod/dream-registry";
import { modulesLock } from "~/mod/lock.generated";
import { modInstalled } from "~/mod/registry.data.generated";

/**
 * Install state for the Modules screen (/admin/collections/kit-modules): the BUNDLED lock (readable on
 * serverless; a deploy containing a new version is the honest "Active"
 * signal), the generated registry, the Dream catalog URL, and whether GitHub
 * is connected (installs open PRs through Meet Dream AI). Staff-gated.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const [connected, paid, license] = await Promise.all([
    githubConnected(),
    paidModulesEnabled(),
    licenseConfigured(),
  ]);
  return Response.json({
    installed: modInstalled,
    lock: modulesLock,
    githubConnected: connected,
    paidModulesEnabled: paid,
    catalogUrl: catalogUrl(),
    licenseConfigured: license,
  });
}
