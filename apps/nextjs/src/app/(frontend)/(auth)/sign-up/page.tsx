import { Suspense } from "react";
import Link from "next/link";

import { SiteLicenseNotice } from "~/components/cms-setup/site-license-notice";
import { SignupForm } from "~/components/signup-form";
import { isFounderSignup } from "~/lib/dream/first-account";
import { siteTelemetryEnabled } from "~/lib/dream/site";
import { publicDomain } from "~/lib/dream/site-core";
import { getAuthSettings, getBranding } from "~/lib/payload";
import { getSiteUrl } from "~/lib/site-url";
import { readInviteParams } from "~/lib/workspaces/invite-params";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const invite = readInviteParams(await searchParams);
  const [settings, { appName }, founder] = await Promise.all([
    getAuthSettings(),
    getBranding(),
    // The founder's sign-up (nobody is staff yet) discloses the free site
    // license their email will be used for (docs/MODULES.md → Site license).
    siteTelemetryEnabled() ? isFounderSignup() : false,
  ]);

  // Invite-only: public sign-up is gated off. (For hard server enforcement also
  // set enable_signup = false in Supabase — see docs/AUTH.md.)
  if (!settings.allowSignups) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <h1 className="text-xl font-bold">Sign-up is invite only</h1>
        <p className="text-muted-foreground text-sm">
          New accounts are currently by invitation. If you have an account,{" "}
          <Link href="/sign-in" className="text-foreground underline">
            sign in
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <Suspense>
      <SignupForm
        settings={settings}
        appName={appName}
        lockedEmail={invite.lockedEmail}
        joinWorkspaceName={invite.workspaceName}
      />
      {founder ? (
        <div className="mt-6">
          <SiteLicenseNotice domain={publicDomain(getSiteUrl())} />
        </div>
      ) : null}
    </Suspense>
  );
}
