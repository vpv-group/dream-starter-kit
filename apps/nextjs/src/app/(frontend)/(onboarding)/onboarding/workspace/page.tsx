import { redirect } from "next/navigation";

import { CreateWorkspaceStep } from "~/components/onboarding/create-workspace-step";
import { getBranding } from "~/lib/payload";
import { getWorkspaceContext } from "~/lib/workspaces/server";

export const metadata = { title: "Name your workspace" };

/** Flow A step 4: name + URL slug (wireframe CreateWorkspace). */
export default async function CreateWorkspacePage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/sign-in");
  const branding = await getBranding();

  return (
    <CreateWorkspaceStep
      branding={branding}
      email={ctx.profile.email}
      workspaceLabel={ctx.settings.workspaceLabel}
      urlPrefix={ctx.settings.workspaceUrlPrefix ?? ""}
    />
  );
}
