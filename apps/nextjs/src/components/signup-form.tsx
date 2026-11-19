import type { AuthSettings } from "@acme/app";

import { AuthFlow } from "~/components/auth/auth-flow";

export function SignupForm({
  settings,
  appName,
  lockedEmail,
  joinWorkspaceName,
}: {
  settings: AuthSettings;
  appName: string;
  /** Workspace invite (JoinSignIn): see AuthFlow. */
  lockedEmail?: string;
  joinWorkspaceName?: string;
}) {
  return (
    <AuthFlow
      mode="signUp"
      settings={settings}
      appName={appName}
      lockedEmail={lockedEmail}
      joinWorkspaceName={joinWorkspaceName}
    />
  );
}
