import { ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";

const DOCS_URL =
  "https://github.com/vpv-group/dream-starter-kit/blob/main/docs/MODULES.md#site-license";

/**
 * Founder disclosure on /cms-setup (docs/MODULES.md → Site license): after
 * setup this site registers with meetdream.com for its free license key.
 */
export function SiteLicenseNotice({ domain }: { domain: string | null }) {
  return (
    <Alert data-testid="site-license-notice">
      <ShieldCheck />
      <AlertTitle>Free lifetime kit updates</AlertTitle>
      <AlertDescription>
        <p>
          Your email address and this site&apos;s domain
          {domain ? (
            <>
              {" "}
              (<code>{domain}</code>)
            </>
          ) : null}{" "}
          will be used to create a free Dream Starter Kit license key on
          meetdream.com, so this site gets free kit updates for life. Admin and
          staff emails are added as they join. No emails are sent to them.
        </p>
        <p>
          Set <code>DREAM_TELEMETRY=off</code> to opt out.{" "}
          <a href={DOCS_URL} target="_blank" rel="noreferrer">
            Learn more
          </a>
        </p>
      </AlertDescription>
    </Alert>
  );
}
