import { CmsSetupFlow } from "~/components/cms-setup/cms-setup-flow";
import { SiteLicenseNotice } from "~/components/cms-setup/site-license-notice";
import { siteTelemetryEnabled } from "~/lib/dream/site";
import { publicDomain } from "~/lib/dream/site-core";
import { getAuthSettings, getBranding } from "~/lib/payload";
import { getSiteUrl } from "~/lib/site-url";
import { createClient } from "~/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * First-admin onboarding. Reached right after the founder's account is created
 * (/welcome) or from the dashboard's SeedGate while the CMS is unseeded. The
 * account-model question (wireframe AccountModel) is asked first, once, and
 * only to staff; the seed then streams behind the progress bar. Lives under
 * (frontend) so Tailwind/shadcn styles load.
 */
export default async function CmsSetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isStaff = false;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("is_staff")
      .eq("id", user.id)
      .maybeSingle();
    isStaff = data?.is_staff ?? false;
  }

  const [settings, branding] = await Promise.all([
    getAuthSettings(),
    getBranding(),
  ]);

  return (
    <CmsSetupFlow
      branding={branding}
      askAccountModel={isStaff && !settings.accountModelChosen}
      notice={
        siteTelemetryEnabled() ? (
          <SiteLicenseNotice domain={publicDomain(getSiteUrl())} />
        ) : undefined
      }
    />
  );
}
