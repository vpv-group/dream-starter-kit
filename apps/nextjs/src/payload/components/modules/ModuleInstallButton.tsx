"use client";

import { Button, CopyToClipboard, Pill, Spinner } from "@payloadcms/ui";

import type { InstallState } from "~/lib/mod/install-state";
import { isBusy } from "~/lib/mod/install-state";
import { requestInstall } from "./use-modules-admin";

/**
 * A catalog card's action, in Payload's own components: Install → a spinner
 * with the install's stage (Preparing, Running checks, Deploying; it links to
 * the run or PR) → an "Installed" pill. Once an install is on its way the
 * button is gone, so it can't be started twice.
 */
export function ModuleInstallButton({
  slug,
  state,
  installable,
  githubConnected,
  pricingUrl,
  licenseConfigured,
  missingDeps,
  waitingFor,
}: {
  slug: string;
  state: InstallState;
  /** Free, or paid and in this site's plan. */
  installable: boolean;
  githubConnected: boolean;
  pricingUrl?: string;
  licenseConfigured: boolean;
  /** Slugs of required modules that aren't installed (install with it). */
  missingDeps: string[];
  /** Names of required modules already installing on their own. */
  waitingFor: string[];
}) {
  if (state.stage === "installed") {
    return (
      <Pill pillStyle="success" size="small">
        Installed
      </Pill>
    );
  }

  if (isBusy(state)) {
    const label = state.label ?? "Installing";
    return (
      <span className="kit-modules-catalog__progress">
        <Spinner size="sm" loadingText={label} />
        {state.url ? (
          <a href={state.url} target="_blank" rel="noreferrer">
            Details
          </a>
        ) : null}
      </span>
    );
  }

  if (!installable) {
    return pricingUrl ? (
      <Button
        el="anchor"
        url={pricingUrl}
        newTab
        buttonStyle="secondary"
        size="small"
        margin={false}
      >
        Get access
      </Button>
    ) : (
      <span className="kit-modules-install__hint">
        {licenseConfigured
          ? "Not included in your plan"
          : "Available once this site has its license key"}
      </span>
    );
  }

  if (!githubConnected) {
    const command = `pnpm mod add dream:${slug}`;
    return (
      <span className="kit-modules-catalog__command">
        <code>{command}</code>
        <CopyToClipboard value={command} />
      </span>
    );
  }

  if (waitingFor.length > 0) {
    return (
      <span className="kit-modules-catalog__progress">
        <Button size="small" margin={false} disabled>
          Install
        </Button>
        <span className="kit-modules-install__hint">
          Waiting for {waitingFor.join(", ")}
        </span>
      </span>
    );
  }

  const failed = state.stage === "failed";
  return (
    <span className="kit-modules-catalog__progress">
      <Button
        size="small"
        margin={false}
        buttonStyle={failed ? "secondary" : "primary"}
        onClick={() => requestInstall(slug, missingDeps)}
      >
        {failed ? "Retry" : "Install"}
      </Button>
      {failed ? (
        <Pill pillStyle="error" size="small">
          {state.label ?? "Failed"}
        </Pill>
      ) : null}
      {failed && state.url ? (
        <a href={state.url} target="_blank" rel="noreferrer">
          See why
        </a>
      ) : null}
    </span>
  );
}
