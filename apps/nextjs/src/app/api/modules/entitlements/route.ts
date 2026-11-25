import { paidModulesEnabled, requireAdmin } from "~/lib/mod/admin-ops";
import { fetchEntitlements } from "~/lib/mod/dream-registry";

/**
 * Staff-gated proxy for the Dream registry's /entitlements endpoint
 * (docs/MODULES.md → Paid modules). The site license key stays server-side —
 * the Modules screen (/admin/collections/kit-modules) reads only the derived state (active/inactive +
 * entitled slugs), never the key.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  // GitHub not connected → no installs at all: don't call the registry.
  if (!(await paidModulesEnabled())) {
    return Response.json({
      configured: false,
      status: "disabled",
      entitlements: [],
    });
  }
  return Response.json(await fetchEntitlements());
}
