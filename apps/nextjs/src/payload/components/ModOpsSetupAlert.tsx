import Link from "next/link";
import { KeyRound } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { getPayloadClient } from "~/lib/cms/payload-client";
import { siteLicenseKey } from "~/lib/dream/site";
import { githubRepo, opsConfigured } from "~/lib/mod/admin-ops";
import { CopySecret } from "./CopySecret";

const PAT_URL = "https://github.com/settings/personal-access-tokens/new";
const VERCEL_ENV_DOCS =
  "https://vercel.com/docs/environment-variables#creating-environment-variables";
const DOCS_URL =
  "https://github.com/vpv-group/dream-starter-kit/blob/main/docs/MODULES.md#admin-panel--automatic-updates";

/**
 * Top of the /admin dashboard (Payload `beforeDashboard`): until module ops is
 * configured, explains how to set it up. Module ops opens PRs for module and
 * kit updates and is required for paid modules; without it the daily
 * workflow skips and the Modules page is read-only. Server component — reads
 * server env, ships no client JS, renders nothing once configured.
 */
export async function ModOpsSetupAlert() {
  if (opsConfigured()) return null;
  // The free site key this deployment got after setup (Site license), if any.
  const siteKey = await getPayloadClient()
    .then(siteLicenseKey)
    .catch(() => null);
  const repo = githubRepo();
  const secretsUrl = repo
    ? `https://github.com/${repo}/settings/secrets/actions/new`
    : null;

  return (
    <div className="gutter--left gutter--right" style={{ paddingTop: 24 }}>
      <Alert className="border-primary/30 bg-primary/5">
        <KeyRound />
        <AlertTitle>Turn on module ops for updates and paid modules</AlertTitle>
        <AlertDescription>
          <p>
            Module ops opens pull requests for module and Dream Starter Kit
            updates, and installs modules from{" "}
            <Link href="/admin/collections/kit-modules">Modules</Link>. Paid
            modules stay off until it is set up. Until then the daily update
            check is skipped.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              <a href={PAT_URL} target="_blank" rel="noreferrer">
                Create a fine-grained GitHub token
              </a>{" "}
              for {repo ? <code>{repo}</code> : "this app's repository"} with
              read &amp; write access to Contents, Pull requests, Actions and
              Workflows.
            </li>
            <li>
              Add it as the repository secret <code>MOD_OPS_TOKEN</code>
              {secretsUrl ? (
                <>
                  {" "}
                  (
                  <a href={secretsUrl} target="_blank" rel="noreferrer">
                    open repository secrets
                  </a>
                  )
                </>
              ) : null}
              .
            </li>
            <li>
              Add the same token to this app&apos;s environment as{" "}
              <code>GITHUB_OPS_TOKEN</code>
              {repo ? null : (
                <>
                  , plus <code>GITHUB_REPO</code> (<code>owner/repo</code>) when
                  not on Vercel
                </>
              )}{" "}
              (
              <a href={VERCEL_ENV_DOCS} target="_blank" rel="noreferrer">
                how
              </a>
              ), then redeploy.
            </li>
            <li>
              Add your license key as the repository secret{" "}
              <code>DREAM_LICENSE_KEY</code>
              {siteKey ? (
                <>
                  . This site&apos;s free license key from meetdream.com:
                  <br />
                  <CopySecret value={siteKey} />
                  <br />
                  To use paid modules, put your meetdream.com plan on this site
                  at{" "}
                  <a
                    href="https://www.meetdream.com/a/modules"
                    target="_blank"
                    rel="noreferrer"
                  >
                    meetdream.com/a/modules
                  </a>
                  .
                </>
              ) : (
                <>
                  {" "}
                  (your site&apos;s free key appears here once it has
                  registered, or use one from{" "}
                  <a
                    href="https://www.meetdream.com/a/modules"
                    target="_blank"
                    rel="noreferrer"
                  >
                    meetdream.com
                  </a>
                  ).
                </>
              )}
            </li>
          </ol>
          <p className="mt-2">
            <a href={DOCS_URL} target="_blank" rel="noreferrer">
              Full setup guide
            </a>
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}
