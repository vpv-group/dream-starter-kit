import { redirect } from "next/navigation";

import { AppUpdatesStep } from "~/components/cms-setup/app-updates-step";
import { getBranding } from "~/lib/payload";
import { founderSetupContext } from "~/lib/setup/founder";
import { stepPosition } from "~/lib/setup/steps";

export const dynamic = "force-dynamic";

/**
 * Founder step "How should your app stay up to date?" — only once GitHub is
 * connected; otherwise straight to /admin (the dashboard's Finish setup row
 * links back to /admin/updates).
 */
export default async function AppUpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ github?: string }>;
}) {
  const ctx = await founderSetupContext();
  if (!ctx) redirect("/a");
  // Arriving from "Connect your code" (GitHub sends the founder back with
  // ?github=connected): that step still counts, so the numbering doesn't
  // jump back.
  const justConnected = (await searchParams).github === "connected";
  const position = stepPosition("app-updates", {
    ...ctx.steps,
    githubConnected: ctx.steps.githubConnected && !justConnected,
  });
  if (!position || !ctx.steps.githubConnected || ctx.updates.status !== "ok") {
    redirect("/admin");
  }
  const { autoUpdate, autoMerge } = ctx.updates.settings;
  return (
    <AppUpdatesStep
      branding={await getBranding()}
      position={position}
      repo={ctx.updates.repo}
      initial={!autoUpdate ? "manual" : autoMerge ? "automatic" : "review"}
    />
  );
}
