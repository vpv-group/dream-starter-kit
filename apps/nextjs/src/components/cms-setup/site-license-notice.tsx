import { ExternalLink, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";

const TERMS_URL = "https://www.meetdream.com/legal";

/**
 * Founder disclosure on the first account's /sign-up only (docs/MODULES.md →
 * Site license): after setup this site registers with meetdream.com for its
 * free license key, under the Dream Starter Kit terms.
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
          will be used to create a free Dream Starter Kit license key, so this
          site gets free kit updates for life. By signing up, you agree to the
          Dream Starter Kit terms at{" "}
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
          .
        </p>
      </AlertDescription>
    </Alert>
  );
}
