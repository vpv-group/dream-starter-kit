import { redirect } from "next/navigation";

import { ServicesStep } from "~/components/cms-setup/services-step";
import { getBranding } from "~/lib/payload";
import { founderSetupContext } from "~/lib/setup/founder";
import { getServiceChecks } from "~/lib/setup/services";
import { allDone } from "~/lib/setup/services-core";
import { stepPosition } from "~/lib/setup/steps";

export const dynamic = "force-dynamic";

/**
 * Founder step "Finish connecting your services": the host and database
 * checks, each with what to do, and Connect Supabase where Meet Dream can set
 * up sign-in links and emails itself. Skipped when everything is done.
 */
export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ supabase?: string }>;
}) {
  const ctx = await founderSetupContext();
  if (!ctx) redirect("/a");
  const position = stepPosition("services", {
    ...ctx.steps,
    githubConnected: false,
  });
  const checks = await getServiceChecks();
  if (!position || allDone(checks)) redirect("/admin");
  return (
    <ServicesStep
      branding={await getBranding()}
      position={position}
      checks={checks}
      supabase={(await searchParams).supabase ?? null}
    />
  );
}
