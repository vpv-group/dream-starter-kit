import { requireAdmin } from "~/lib/mod/admin-ops";
import { getServiceChecks } from "~/lib/setup/services";
import { allDone } from "~/lib/setup/services-core";

/**
 * What this deployment still needs from its host and database (site
 * address, sign-in links and emails, uploads, scheduled jobs). Powers
 * /cms-setup/services. Staff-gated: it describes the deployment's setup.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;
  const checks = await getServiceChecks();
  return Response.json({ ok: allDone(checks), checks });
}
