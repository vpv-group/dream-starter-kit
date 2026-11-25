import type { AdminViewServerProps } from "payload";
import { notFound, redirect } from "next/navigation";

/**
 * /admin/module-settings/<slug> → that module's page in /admin
 * (/admin/collections/kit-modules/<id>), where its settings live. Lets
 * modules and docs link to a module's settings without knowing the row id;
 * the old per-module settings globals redirect here too (proxy.ts).
 */
export async function ModuleSettingsRedirect({
  initPageResult,
  params,
}: AdminViewServerProps) {
  const segments = (params?.segments ?? []) as string[];
  const slug = segments[1];
  if (!slug) notFound();
  const { docs } = await initPageResult.req.payload.find({
    collection: "kit-modules",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    req: initPageResult.req,
  });
  const row = docs[0];
  if (!row) notFound();
  redirect(`/admin/collections/kit-modules/${row.id}`);
}
