import { z } from "zod/v4";

import { requireAdmin } from "~/lib/mod/admin-ops";
import { githubConnectUrl } from "~/lib/mod/updates";
import { getSiteUrl } from "~/lib/site-url";

/**
 * "Connect GitHub": asks meetdream.com for the Dream Updates App install URL
 * (with a signed state for this site) and returns it for the browser to open.
 * After the owner picks the repository, GitHub sends them back to `returnTo`
 * on this site with `?github=connected`. Staff-gated.
 */
const bodySchema = z.object({
  returnTo: z
    .string()
    .regex(/^\/(admin|cms-setup)(\/[\w\-/]*)?$/)
    .default("/admin/updates"),
});

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid return path" }, { status: 400 });
  }
  const res = await githubConnectUrl(`${getSiteUrl()}${parsed.data.returnTo}`);
  if (res.status !== "ok") {
    return Response.json(res, { status: 502 });
  }
  return Response.json({ url: res.url });
}
