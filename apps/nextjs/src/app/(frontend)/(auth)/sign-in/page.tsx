import { Suspense } from "react";

import { LoginForm } from "~/components/login-form";
import { getAuthSettings, getBranding } from "~/lib/payload";
import { readInviteParams } from "~/lib/workspaces/invite-params";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const invite = readInviteParams(await searchParams);
  const [settings, { appName }] = await Promise.all([
    getAuthSettings(),
    getBranding(),
  ]);
  return (
    <Suspense>
      <LoginForm
        settings={settings}
        appName={appName}
        lockedEmail={invite.lockedEmail}
        joinWorkspaceName={invite.workspaceName}
      />
    </Suspense>
  );
}
