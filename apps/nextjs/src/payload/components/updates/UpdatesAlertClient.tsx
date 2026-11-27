"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "@payloadcms/ui";
import { ArrowUpCircle, X } from "lucide-react";

import type { OutdatedState, UpdateOp } from "~/lib/mod/outdated-core";
import { Button } from "~/components/ui/button";
import { refreshModulesAdmin } from "../modules/use-modules-admin";

/**
 * The banner itself (see UpdatesAlert). Lists what is behind, then:
 * - Update / Update all: one module-ops dispatch per item that has no update
 *   PR yet (the kit first). Like Update on the Modules screen, the click is
 *   the approval: module PRs merge once their checks pass; the kit PR follows
 *   "Merge updates automatically" (/admin → Updates).
 * - a module whose newest release needs the newer kit waits for the kit PR;
 *   the daily check opens its PR after that merges.
 * - GitHub not connected: a link to connect it instead.
 * Dismissing hides the banner until a newer version shows up.
 */

type Outdated = OutdatedState & { githubConnected: boolean; ops: UpdateOp[] };

const CACHE_MS = 60_000;
const DISMISS_KEY = "dream:updates-alert-dismissed";
// One fetch per minute across admin page navigations.
let cached: { at: number; data: Outdated } | null = null;

async function loadOutdated(force = false): Promise<Outdated | null> {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.data;
  try {
    const res = await fetch("/api/modules/outdated", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as Outdated;
    cached = { at: Date.now(), data };
    return data;
  } catch {
    return null;
  }
}

/** What's on offer, as one string: a new version re-shows a dismissed banner. */
const signature = (d: Outdated) =>
  [
    d.kit ? `kit@${d.kit.to}` : "",
    ...d.modules.map((m) => `${m.slug}@${m.to}`),
  ].join(",");

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function UpdatesAlertClient() {
  const [data, setData] = useState<Outdated | null>(null);
  // Nothing renders before the data loads, so server and client agree.
  const [dismissed, setDismissed] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readDismissed(),
  );
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadOutdated().then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data || (!data.kit && data.modules.length === 0)) return null;
  const sig = signature(data);
  if (dismissed === sig) return null;

  const items = [
    ...(data.kit
      ? [
          {
            key: "kit",
            label: `Dream Starter Kit ${data.kit.from} → ${data.kit.to}`,
            pr: data.kit.pr,
            note: null as string | null,
          },
        ]
      : []),
    ...data.modules.map((m) => ({
      key: m.slug,
      label: `${m.name} ${m.from} → ${m.to}`,
      pr: m.pr,
      note: m.needsKit ? "after the kit update" : null,
    })),
  ];

  const updateAll = async () => {
    setBusy(true);
    let failed = 0;
    // The kit first: modules that need it wait for its PR anyway.
    for (const op of data.ops) {
      try {
        const res = await fetch("/api/modules/ops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(op),
        });
        if (!res.ok) {
          failed++;
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          toast.error(
            body.error ??
              `Couldn't start the ${op.op === "kit-update" ? "kit" : op.slug} update (HTTP ${res.status}).`,
          );
        }
      } catch {
        failed++;
        toast.error("Request failed. Check your connection and try again.");
      }
    }
    if (failed < data.ops.length) {
      setStarted(true);
      toast.success(
        "Update started. Pull requests open in a minute or two and merge once their checks pass.",
      );
    }
    cached = null;
    void refreshModulesAdmin(true);
    setBusy(false);
  };

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, sig);
    } catch {
      // Private window: hide it for this page only.
    }
    setDismissed(sig);
  };

  const action = !data.githubConnected ? (
    <Button asChild size="sm" variant="outline">
      <Link href="/admin/updates">Connect GitHub to update</Link>
    </Button>
  ) : started || data.running ? (
    <Button asChild size="sm" variant="outline">
      <Link href="/admin/updates">
        {started
          ? "Update started · View progress"
          : "Updating · View progress"}
      </Link>
    </Button>
  ) : data.ops.length > 0 ? (
    <Button size="sm" disabled={busy} onClick={() => void updateAll()}>
      {busy ? "Starting…" : data.ops.length === 1 ? "Update" : "Update all"}
    </Button>
  ) : (
    <Button asChild size="sm" variant="outline">
      <Link href="/admin/updates">Review updates</Link>
    </Button>
  );

  return (
    <div
      role="status"
      className="updates-alert bg-primary/10 text-foreground border-b px-4 py-2.5 text-sm"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ArrowUpCircle className="text-primary size-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <strong className="font-medium">
            {items.length === 1 ? "Update available" : "Updates available"}
          </strong>
          <span className="text-muted-foreground">: </span>
          {items.map((item, i) => (
            <span key={item.key}>
              {i > 0 ? (
                <span className="text-muted-foreground"> · </span>
              ) : null}
              {item.label}
              {item.pr ? (
                <>
                  {" "}
                  <a
                    href={item.pr.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground underline"
                  >
                    (PR #{item.pr.number})
                  </a>
                </>
              ) : item.note ? (
                <span className="text-muted-foreground"> ({item.note})</span>
              ) : null}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {action}
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label="Dismiss until the next update"
            onClick={dismiss}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
