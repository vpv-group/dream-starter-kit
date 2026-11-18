import { redirect } from "next/navigation";

import { BrandingProvider } from "~/components/branding-provider";
import { getBranding } from "~/lib/payload";
import { getWorkspaceContext } from "~/lib/workspaces/server";

/**
 * Workspace onboarding (Teams / Both account models, docs/WORKSPACES.md).
 * Signed-in, non-anonymous users only; consumer mode never sees these pages.
 * Each step renders its own split layout (OnboardingShell).
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.workspaceMode || ctx.isAnonymous) redirect("/a");

  const branding = await getBranding();
  return <BrandingProvider value={branding}>{children}</BrandingProvider>;
}
