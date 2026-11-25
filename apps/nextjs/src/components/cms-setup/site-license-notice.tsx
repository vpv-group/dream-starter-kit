import { ExternalLink, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";

const TERMS_URL = "https://www.meetdream.com/legal";

/**
 * Founder disclosure (docs/MODULES.md → Site license): after the first CMS
 * seed this site registers with meetdream.com for its free license key, under
 * the Dream Starter Kit terms. Shown on the founder's /sign-up and again on
 * /cms-setup, right before the seed that triggers the registration. It must
 * list everything `lib/dream/site-core.ts` sends.
 */
export function SiteLicenseNotice({
  domain,
  consentAction = "signing up",
}: {
  domain: string | null;
  /** How the reader agrees: "signing up" (/sign-up) or "continuing". */
  consentAction?: "signing up" | "continuing";
}) {
  return (
    <Alert data-testid="site-license-notice">
      <ShieldCheck />
      <AlertTitle>Free lifetime kit updates</AlertTitle>
      <AlertDescription>
        <p>
          After setup, this site sends meetdream.com its domain
          {domain ? (
            <>
              {" "}
              (<code>{domain}</code>)
            </>
          ) : null}
          , the email addresses of its admins and editors, the Dream Starter Kit
          version and the repository name. Meet Dream uses them to create a free
          license key, so this site gets free kit updates for life. By{" "}
          {consentAction}, you agree to the Dream Starter Kit terms at{" "}
          <a
            href={TERMS_URL}
            target="_blank"
            rel="noreferrer"
            className="text-foreground inline-flex items-center gap-1 underline underline-offset-4"
          >
            meetdream.com/legal
            <ExternalLink aria-hidden className="size-3.5" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          . Set <code>DREAM_TELEMETRY=off</code> to turn this off.
        </p>
      </AlertDescription>
    </Alert>
  );
}
