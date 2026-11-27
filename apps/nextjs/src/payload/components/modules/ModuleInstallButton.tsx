"use client";

import Link from "next/link";
import { CopyToClipboard } from "@payloadcms/ui";

import type { InstallState } from "~/lib/mod/install-state";
import { ProgressRing } from "~/components/ui/progress-ring";
import { isBusy } from "~/lib/mod/install-state";
import { requestInstall } from "./use-modules-admin";

/**
 * The right-hand button of a catalog row, App Store style: a capsule
 * "Install" → a ring that fills as the install moves (preparing, checks,
 * deploying) → "Installed". Once an install is on its way the button can't
 * start it again; the stage under the ring links to the run or the PR.
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
      <Link
        className="kit-capsule kit-capsule--done"
        href={`/admin/module-settings/${slug}`}
        title="Open the module's page"
      >
        Installed
      </Link>
    );
  }

  if (isBusy(state)) {
    const label = state.label ?? "Installing";
    return (
      <span className="kit-install-progress">
        <ProgressRing
          value={state.progress}
          size={30}
          aria-label={`Installing: ${label}`}
        >
          <span className="kit-install-progress__stop" aria-hidden />
        </ProgressRing>
        {state.url ? (
          <a
            className="kit-install-progress__label"
            href={state.url}
            target="_blank"
            rel="noreferrer"
          >
            {label}
          </a>
        ) : (
          <span className="kit-install-progress__label">{label}</span>
        )}
      </span>
    );
  }

  if (!installable) {
    return pricingUrl ? (
      <a
        className="kit-capsule"
        href={pricingUrl}
        target="_blank"
        rel="noreferrer"
      >
        Get
      </a>
    ) : (
      <span className="kit-install-progress__label">
        {licenseConfigured
          ? "Not in your plan"
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
      <span className="kit-install-progress">
        <button type="button" className="kit-capsule" disabled>
          Install
        </button>
        <span className="kit-install-progress__label">
          Waiting for {waitingFor.join(", ")}
        </span>
      </span>
    );
  }

  const failed = state.stage === "failed";
  return (
    <span className="kit-install-progress">
      <button
        type="button"
        className={failed ? "kit-capsule kit-capsule--retry" : "kit-capsule"}
        onClick={() => requestInstall(slug, missingDeps)}
      >
        {failed ? "Retry" : "Install"}
      </button>
      {failed && state.url ? (
        <a
          className="kit-install-progress__label kit-install-progress__label--error"
          href={state.url}
          target="_blank"
          rel="noreferrer"
        >
          {state.label ?? "Failed"} · See why
        </a>
      ) : null}
    </span>
  );
}
