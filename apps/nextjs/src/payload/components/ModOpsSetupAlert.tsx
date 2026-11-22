import Link from "next/link";
import { KeyRound } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { githubRepo, opsConfigured } from "~/lib/mod/admin-ops";

const PAT_URL = "https://github.com/settings/personal-access-tokens/new";
const VERCEL_ENV_DOCS =
  "https://vercel.com/docs/environment-variables#creating-environment-variables";
const DOCS_URL =
  "https://github.com/vpv-group/dream-starter-kit/blob/main/docs/MODULES.md#admin-panel--automatic-updates";

/**
 * Top of the /admin dashboard (Payload `beforeDashboard`): until module ops is
 * configured, explains how to set it up. Module ops opens PRs for module and
 * kit updates and is required for paid modules; without it the daily
 * workflow skips and /admin/modules is read-only. Server component — reads
 * server env, ships no client JS, renders nothing once configured.
 */
export function ModOpsSetupAlert() {
  if (opsConfigured()) return null;
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
            <Link href="/admin/modules">Modules</Link>. Paid modules stay off
            until it is set up. Until then the daily update check is skipped.
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
              For paid modules, also add your license key as the repository
              secret <code>DREAM_LICENSE_KEY</code>.
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
