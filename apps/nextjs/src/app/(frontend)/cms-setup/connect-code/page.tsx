import { redirect } from "next/navigation";

import { ConnectCodeStep } from "~/components/cms-setup/connect-code-step";
import { getBranding } from "~/lib/payload";
import { founderSetupContext } from "~/lib/setup/founder";
import { stepPosition } from "~/lib/setup/steps";

export const dynamic = "force-dynamic";

/**
 * Founder step "Connect your code" (after the CMS seed). Skips itself when
 * GitHub is already connected (→ app-updates) or updates aren't available
 * here: localhost, telemetry off, or Meet Dream hasn't enabled them (→
 * /admin).
 */
export default async function ConnectCodePage() {
  const ctx = await founderSetupContext();
  if (!ctx) redirect("/a");
  if (ctx.steps.githubConnected) redirect("/cms-setup/app-updates");
  const position = stepPosition("connect-code", ctx.steps);
  if (!position) redirect("/admin");
  return <ConnectCodeStep branding={await getBranding()} position={position} />;
}
