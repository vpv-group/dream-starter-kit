"use client";

import Link from "next/link";
import { Banner } from "@payloadcms/ui";

import { useModulesAdmin } from "./use-modules-admin";

/**
 * Above the Modules table (collection `beforeListTable`): says when module
 * ops is off (the screen is read-only), or lists what's in flight — open
 * module and kit update PRs plus running or failed workflow runs. Renders nothing when
 * there's nothing to say, or for staff who aren't admins.
 */
export function ModulesStatusBanner() {
  const { registry, ops } = useModulesAdmin();
  if (!registry) return null;

  if (!registry.opsConfigured) {
    return (
      <Banner type="info" className="kit-modules-banner">
        <strong>Module ops is off.</strong> Installing, updating and removing
        modules from here is unavailable, and paid modules are hidden. Free
        modules still install from the CLI (<code>pnpm mod add</code>).{" "}
        <Link href="/admin">Set up module ops</Link>
      </Banner>
    );
  }

  const prs = ops?.prs ?? [];
  const runs = (ops?.runs ?? []).filter(
    (r) => r.status !== "completed" || r.conclusion === "failure",
  );
  if (prs.length === 0 && runs.length === 0) return null;
  const failed = runs.some((r) => r.conclusion === "failure");

  return (
    <Banner type={failed ? "error" : "info"} className="kit-modules-banner">
      <strong>
        {failed ? "An update operation failed" : "Updates in progress"}
      </strong>
      <ul className="kit-modules-banner__list">
        {prs.map((pr) => (
          <li key={`pr-${pr.number}`}>
            <a href={pr.url} target="_blank" rel="noreferrer">
              {pr.kind === "kit" ? "Starter kit" : "Module"} PR #{pr.number}:{" "}
              {pr.title}
            </a>{" "}
            —{" "}
            {pr.conflicts
              ? "has conflicts to resolve"
              : "waiting for review and merge"}
          </li>
        ))}
        {runs.map((run) => (
          <li key={`run-${run.id}`}>
            <a href={run.url} target="_blank" rel="noreferrer">
              {run.title}
            </a>{" "}
            —{" "}
            {run.conclusion === "failure"
              ? "failed"
              : run.status.replace(/_/g, " ")}
          </li>
        ))}
      </ul>
    </Banner>
  );
}
