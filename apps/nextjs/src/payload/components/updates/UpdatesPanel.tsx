"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@payloadcms/ui";

import type { OpsPr } from "~/lib/mod/ops-core";
import type {
  UpdateSettings,
  UpdatesProblem,
  UpdatesState,
} from "~/lib/mod/updates-core";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Switch } from "~/components/ui/switch";

/**
 * The /admin/updates page body (UpdatesView). Shopify-style: one place for
 * the starter kit and module updates, two switches, and the GitHub
 * connection. Every action goes through the staff-gated routes; the site key
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

function prStatus(pr: OpsPr, autoMerge: boolean) {
  if (pr.conflicts) return { label: "Needs attention", tone: "destructive" };
  if (pr.needsReview) return { label: "Ready to review", tone: "secondary" };
  if (pr.approved || autoMerge) {
    return { label: "Merges when checks pass", tone: "default" };
  }
  return { label: "Ready to review", tone: "secondary" };
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

  if (!data) {
    return <p className="text-muted-foreground py-8">Loading updates…</p>;
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

  return (
    <div className="flex max-w-3xl flex-col gap-6 py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Updates</h1>
          <p className="text-muted-foreground text-sm">
            Dream Starter Kit {data.kitVersion}
          </p>
        </div>
        {ok?.connected ? (
          <Button
            variant="outline"
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
        <Alert>
          <AlertTitle>Updates aren&apos;t available yet</AlertTitle>
          <AlertDescription>{updates.message}</AlertDescription>
        </Alert>
      ) : null}

      {ok?.hold ? (
        <Alert>
          <AlertTitle>Automatic merging is paused by Meet Dream</AlertTitle>
          <AlertDescription>
            {ok.hold} Pull requests still open; nothing merges itself until this
            is lifted.
          </AlertDescription>
        </Alert>
      ) : null}

      {ok?.settings.pausedReason ? (
        <Alert variant="destructive">
          <AlertTitle>Automatic merging is paused</AlertTitle>
          <AlertDescription>
            <p>{ok.settings.pausedReason}</p>
            <Button
              size="sm"
              className="mt-2"
              disabled={busy}
              onClick={() =>
                void save({ resume: true }, "Automatic merging resumed.")
              }
            >
              Resume automatic merging
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {connectError ? (
        <Alert variant="destructive">
          <AlertTitle>GitHub didn&apos;t connect</AlertTitle>
          <AlertDescription>{connectError}</AlertDescription>
        </Alert>
      ) : null}

      {ok ? (
        <Card>
          <CardHeader>
            <CardTitle>GitHub</CardTitle>
            <CardDescription>
              {ok.connected
                ? `Connected to ${ok.repo}. Updates arrive as pull requests on this repository.`
                : "Connect the repository this app was deployed from. Updates then arrive as pull requests there; nothing is stored in your repository."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ok.connected && ok.repo ? (
              <a
                className="text-sm underline"
                href={`https://github.com/${ok.repo}`}
                target="_blank"
                rel="noreferrer"
              >
                Open on GitHub
              </a>
            ) : ok.brokerConfigured ? (
              <Button
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
              <p className="text-muted-foreground text-sm">
                Meet Dream hasn&apos;t switched on automatic updates yet.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {ok?.connected ? (
        <Card>
          <CardHeader>
            <CardTitle>Automatic updates</CardTitle>
            <CardDescription>
              Each update pull request runs your full checks first (about 25
              minutes of GitHub Actions time, estimate).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <label className="flex items-start justify-between gap-6">
              <span>
                <span className="block font-medium">Automatic updates</span>
                <span className="text-muted-foreground block text-sm">
                  Open a pull request when the starter kit or a module has an
                  update.
                </span>
              </span>
              <Switch
                checked={ok.settings.autoUpdate}
                disabled={busy}
                aria-label="Automatic updates"
                onCheckedChange={(checked) =>
                  void save(
                    { autoUpdate: checked },
                    checked
                      ? "Automatic updates are on."
                      : "Automatic updates are off.",
                  )
                }
              />
            </label>
            <label className="flex items-start justify-between gap-6">
              <span>
                <span className="block font-medium">
                  Merge updates automatically
                </span>
                <span className="text-muted-foreground block text-sm">
                  Merge those pull requests once every check passes and there
                  are no conflicts. Removals, major versions, database changes
                  that remove data and workflow changes always wait for you.
                </span>
              </span>
              <Switch
                checked={ok.settings.autoMerge}
                disabled={busy || !ok.settings.autoUpdate}
                aria-label="Merge updates automatically"
                onCheckedChange={(checked) =>
                  void save(
                    { autoMerge: checked },
                    checked
                      ? "Clean updates will merge themselves."
                      : "Every update now waits for you.",
                  )
                }
              />
            </label>
          </CardContent>
        </Card>
      ) : null}

      {ok?.connected ? (
        <Card>
          <CardHeader>
            <CardTitle>Pending updates</CardTitle>
          </CardHeader>
          <CardContent>
            {data.prs.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Everything is up to date.
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {data.prs.map((pr) => {
                  const status = prStatus(
                    pr,
                    // Paused after a failed deploy, or held by Meet Dream:
                    // only what an admin approves merges.
                    ok.settings.autoMerge &&
                      !ok.settings.pausedReason &&
                      !ok.hold,
                  );
                  return (
                    <li
                      key={pr.number}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <span className="flex flex-col gap-1">
                        <span className="font-medium">{pr.title}</span>
                        <span className="flex gap-2">
                          <Badge variant="outline">
                            {pr.kind === "kit" ? "Starter kit" : "Module"}
                          </Badge>
                          <Badge
                            variant={
                              status.tone as
                                "default" | "secondary" | "destructive"
                            }
                          >
                            {status.label}
                          </Badge>
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-2">
                        <Button asChild variant="outline" size="sm">
                          <a href={pr.url} target="_blank" rel="noreferrer">
                            Review changes
                          </a>
                        </Button>
                        {!pr.conflicts ? (
                          <Button
                            size="sm"
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
                            variant="ghost"
                            size="sm"
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
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>License</CardTitle>
          <CardDescription>
            {data.licensePrefix
              ? `Free site license ${data.licensePrefix}… Starter kit updates and free modules, for life.`
              : "This site gets its free license after setup on a public domain."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            className="text-sm underline"
            href="https://www.meetdream.com/pricing"
            target="_blank"
            rel="noreferrer"
          >
            See plans
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
