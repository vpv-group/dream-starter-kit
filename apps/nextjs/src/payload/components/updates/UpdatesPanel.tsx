"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Banner,
  Button,
  CheckboxInput,
  Pill,
  SetStepNav,
  toast,
} from "@payloadcms/ui";

import type { OpsPr } from "~/lib/mod/ops-core";
import type {
  UpdateSettings,
  UpdatesProblem,
  UpdatesState,
} from "~/lib/mod/updates-core";

/**
 * The /admin/updates page body (UpdatesView), in Payload's own components
 * (Banner, Button, Pill, CheckboxInput): one place for the starter kit and
 * module updates, two settings, and the GitHub connection. Every action goes through the staff-gated routes; the site key
 * and GitHub tokens never reach the browser.
 */

interface UpdatesResponse {
  kitVersion: string;
  licensePrefix: string | null;
  updates: UpdatesState | UpdatesProblem;
  prs: OpsPr[];
}

const CONNECT_ERRORS: Record<string, string> = {
  no_repository: "Pick one repository when you install the app on GitHub.",
  too_many_repositories:
    "Install the app on just this app's repository, not all of them.",
  repo_mismatch:
    "That repository isn't the one this site was deployed from. Pick the right one.",
  invalid_state: "That link expired. Try connecting again.",
};

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      (typeof json.message === "string" && json.message) ||
      (typeof json.error === "string" && json.error) ||
      `Request failed (HTTP ${res.status}).`;
    throw new Error(message);
  }
  return json;
}

function prStatus(
  pr: OpsPr,
  autoMerge: boolean,
): { label: string; pill: "error" | "warning" | "success" } {
  if (pr.conflicts) return { label: "Needs attention", pill: "error" };
  if (pr.needsReview) return { label: "Ready to review", pill: "warning" };
  if (pr.approved || autoMerge) {
    return { label: "Merges when checks pass", pill: "success" };
  }
  return { label: "Ready to review", pill: "warning" };
}

export function UpdatesPanel() {
  const [data, setData] = useState<UpdatesResponse | null>(null);
  const [busy, setBusy] = useState(false);
  // ?github=<code> after GitHub sends the owner back (connect callback).
  const [connectError] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const github = new URLSearchParams(window.location.search).get("github");
    if (!github || github === "connected") return null;
    return CONNECT_ERRORS[github] ?? "GitHub didn't connect. Try again.";
  });

  const load = useCallback(async () => {
    try {
      setData((await send("/api/modules/updates", "GET")) as never);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, []);

  useEffect(() => {
    const github = new URLSearchParams(window.location.search).get("github");
    if (github === "connected") toast.success("GitHub is connected.");
    let cancelled = false;
    send("/api/modules/updates", "GET")
      .then((json) => {
        if (!cancelled) setData(json as never);
      })
      .catch((err: unknown) => toast.error((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const crumb = <SetStepNav nav={[{ label: "Updates" }]} />;

  if (!data) {
    return (
      <div className="kit-updates">
        {crumb}
        <p className="kit-updates__muted">Loading updates…</p>
      </div>
    );
  }

  const { updates } = data;
  const ok = updates.status === "ok" ? updates : null;

  const save = (
    next: Partial<UpdateSettings> & { resume?: boolean },
    message: string,
  ) =>
    run(async () => {
      if (!ok) return;
      const { pausedReason: _ignored, ...current } = ok.settings;
      await send("/api/modules/updates", "PUT", { ...current, ...next });
      toast.success(message);
      await load();
    });

  const dispatch = (body: Record<string, unknown>, message: string) =>
    run(async () => {
      await send("/api/modules/ops", "POST", body);
      toast.success(message);
    });

  const autoMergeNow =
    // Paused after a failed deploy, or held by Meet Dream: only what an
    // admin approves merges.
    Boolean(ok?.settings.autoMerge && !ok.settings.pausedReason && !ok.hold);

  return (
    <div className="kit-updates">
      {crumb}
      <header className="kit-updates__header">
        <div>
          <h1>Updates</h1>
          <p className="kit-updates__muted">
            Dream Starter Kit {data.kitVersion}
          </p>
        </div>
        {ok?.connected ? (
          <Button
            buttonStyle="secondary"
            size="small"
            margin={false}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await send("/api/modules/ops", "POST", { op: "kit-update" });
                await send("/api/modules/ops", "POST", { op: "check" });
                toast.success(
                  "Checking for updates. Pull requests open shortly for anything new.",
                );
              })
            }
          >
            Check now
          </Button>
        ) : null}
      </header>

      {updates.status !== "ok" ? (
        <Banner type="info">
          <strong>Updates aren&apos;t available yet.</strong> {updates.message}
        </Banner>
      ) : null}

      {ok?.hold ? (
        <Banner type="info">
          <strong>Automatic merging is paused by Meet Dream.</strong> {ok.hold}{" "}
          Pull requests still open; nothing merges itself until this is lifted.
        </Banner>
      ) : null}

      {ok?.settings.pausedReason ? (
        <Banner type="error">
          <strong>Automatic merging is paused.</strong>{" "}
          {ok.settings.pausedReason}
          <div className="kit-updates__banner-action">
            <Button
              size="small"
              margin={false}
              disabled={busy}
              onClick={() =>
                void save({ resume: true }, "Automatic merging resumed.")
              }
            >
              Resume automatic merging
            </Button>
          </div>
        </Banner>
      ) : null}

      {connectError ? (
        <Banner type="error">
          <strong>GitHub didn&apos;t connect.</strong> {connectError}
        </Banner>
      ) : null}

      {ok ? (
        <section className="kit-updates__section">
          <h3>GitHub</h3>
          <p className="kit-updates__muted">
            {ok.connected
              ? `Connected to ${ok.repo}. Updates arrive as pull requests on this repository.`
              : "Connect the repository this app was deployed from. Updates then arrive as pull requests there; nothing is stored in your repository."}
          </p>
          {ok.connected && ok.repo ? (
            <a
              href={`https://github.com/${ok.repo}`}
              target="_blank"
              rel="noreferrer"
            >
              Open on GitHub
            </a>
          ) : ok.brokerConfigured ? (
            <Button
              size="small"
              margin={false}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = await send(
                    "/api/modules/updates/connect",
                    "POST",
                    { returnTo: "/admin/updates" },
                  );
                  if (typeof res.url === "string") {
                    window.location.assign(res.url);
                  }
                })
              }
            >
              Connect GitHub
            </Button>
          ) : (
            <p className="kit-updates__muted">
              Meet Dream hasn&apos;t switched on automatic updates yet.
            </p>
          )}
        </section>
      ) : null}

      {ok?.connected ? (
        <section className="kit-updates__section">
          <h3>Automatic updates</h3>
          <p className="kit-updates__muted">
            Each update pull request runs your full checks first (about 25
            minutes of GitHub Actions time, estimate).
          </p>
          <div className="kit-updates__setting">
            <CheckboxInput
              id="kit-updates-auto-update"
              label="Automatic updates"
              checked={ok.settings.autoUpdate}
              readOnly={busy}
              onToggle={(e) => {
                const checked = e.target.checked;
                void save(
                  { autoUpdate: checked },
                  checked
                    ? "Automatic updates are on."
                    : "Automatic updates are off.",
                );
              }}
            />
            <p className="kit-updates__muted">
              Open a pull request when the starter kit or a module has an
              update.
            </p>
          </div>
          <div className="kit-updates__setting">
            <CheckboxInput
              id="kit-updates-auto-merge"
              label="Merge updates automatically"
              checked={ok.settings.autoMerge}
              readOnly={busy || !ok.settings.autoUpdate}
              onToggle={(e) => {
                const checked = e.target.checked;
                void save(
                  { autoMerge: checked },
                  checked
                    ? "Clean updates will merge themselves."
                    : "Every update now waits for you.",
                );
              }}
            />
            <p className="kit-updates__muted">
              Merge those pull requests once every check passes and there are no
              conflicts. Removals, major versions, database changes that remove
              data and workflow changes always wait for you.
            </p>
          </div>
        </section>
      ) : null}

      {ok?.connected ? (
        <section className="kit-updates__section">
          <h3>Pending updates</h3>
          {data.prs.length === 0 ? (
            <p className="kit-updates__muted">Everything is up to date.</p>
          ) : (
            <ul className="kit-updates__list">
              {data.prs.map((pr) => {
                const status = prStatus(pr, autoMergeNow);
                return (
                  <li key={pr.number} className="kit-updates__row">
                    <span className="kit-updates__row-main">
                      <strong>{pr.title}</strong>
                      <span className="kit-updates__pills">
                        <Pill pillStyle="light" size="small">
                          {pr.kind === "kit" ? "Starter kit" : "Module"}
                        </Pill>
                        <Pill pillStyle={status.pill} size="small">
                          {status.label}
                        </Pill>
                      </span>
                    </span>
                    <span className="kit-updates__actions">
                      <Button
                        el="anchor"
                        url={pr.url}
                        newTab
                        buttonStyle="secondary"
                        size="small"
                        margin={false}
                      >
                        Review changes
                      </Button>
                      {!pr.conflicts ? (
                        <Button
                          size="small"
                          margin={false}
                          disabled={busy}
                          onClick={() =>
                            void dispatch(
                              { op: "merge", pr: pr.number },
                              "Merging it as soon as its checks pass.",
                            )
                          }
                        >
                          Merge now
                        </Button>
                      ) : null}
                      {pr.slug && pr.to ? (
                        <Button
                          buttonStyle="subtle"
                          size="small"
                          margin={false}
                          disabled={busy}
                          onClick={() =>
                            void save(
                              {
                                skipped: [
                                  ...ok.settings.skipped,
                                  `${pr.slug}@${pr.to}`,
                                ],
                              },
                              `Skipping ${pr.slug} ${pr.to}. Close the pull request on GitHub.`,
                            )
                          }
                        >
                          Skip this version
                        </Button>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <section className="kit-updates__section">
        <h3>License</h3>
        <p className="kit-updates__muted">
          {data.licensePrefix
            ? `Free site license ${data.licensePrefix}… Starter kit updates and free modules, for life.`
            : "This site gets its free license after setup on a public domain."}
        </p>
        <a
          href="https://www.meetdream.com/pricing"
          target="_blank"
          rel="noreferrer"
        >
          See plans
        </a>
      </section>
    </div>
  );
}
