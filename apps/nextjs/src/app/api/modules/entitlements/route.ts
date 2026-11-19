import { requireAdmin } from "~/lib/mod/admin-ops";
import { fetchEntitlements } from "~/lib/mod/dream-registry";

/**
 * Staff-gated proxy for the Dream registry's /entitlements endpoint
 * (docs/MODULES.md → Paid modules). The DREAM_LICENSE_KEY stays server-side —
 * the /admin/modules page reads only the derived state (active/inactive +
 * entitled slugs), never the key.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  return Response.json(await fetchEntitlements());
}
