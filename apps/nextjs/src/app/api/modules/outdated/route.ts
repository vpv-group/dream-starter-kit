import { KIT_VERSION } from "@acme/config";

import type { GithubPr } from "~/lib/mod/ops-core";
import type { OutdatedInput } from "~/lib/mod/outdated-core";
import { githubApi, githubConnected, requireAdmin } from "~/lib/mod/admin-ops";
import { catalogUrl, fetchEntitlements } from "~/lib/mod/dream-registry";
import { latestKitRelease } from "~/lib/mod/kit-release";
import { toOpsPrs } from "~/lib/mod/ops-core";
import { planOutdated, updateOps } from "~/lib/mod/outdated-core";
import { getUpdates } from "~/lib/mod/updates";
import { modulesLock } from "~/mod/lock.generated";
import { modInstalled } from "~/mod/registry.data.generated";

/**
 * The "Updates available" banner at the top of /admin
 * (payload/components/updates/UpdatesAlert.tsx): is the kit or any installed
 * module behind its newest release, is an update PR already open for it, and
 * which module-ops dispatches "Update all" should send (lib/mod/
 * outdated-core.ts decides). The buttons POST /api/modules/ops, like the
 * Modules screen. Staff-gated; every outside call fails soft to "unknown".
 */

interface CatalogBody {
  modules?: { slug: string; latest?: string; kitCompat?: string }[];
}

async function catalog(): Promise<OutdatedInput["catalog"]> {
  try {
    const res = await fetch(catalogUrl(), { next: { revalidate: 300 } });
    return res.ok ? (((await res.json()) as CatalogBody).modules ?? []) : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const connected = await githubConnected();
  const [latest, entries, entitlements, updates, prs, runs] = await Promise.all(
    [
      latestKitRelease(),
      catalog(),
      fetchEntitlements(),
      getUpdates(),
      connected
        ? githubApi("/pulls?state=open&per_page=50").then(async (res) =>
            res.ok ? toOpsPrs((await res.json()) as GithubPr[]) : [],
          )
        : Promise.resolve([]),
      connected
        ? githubApi("/actions/workflows/module-ops.yml/runs?per_page=10").then(
            async (res) =>
              res.ok
                ? ((
                    (await res.json()) as {
                      workflow_runs?: { status: string }[];
                    }
                  ).workflow_runs ?? [])
                : [],
          )
        : Promise.resolve([]),
    ],
  );

  const state = planOutdated({
    kit: { current: KIT_VERSION, latest },
    installed: modInstalled,
    lock: modulesLock.modules,
    catalog: entries,
    entitled: new Set(
      entitlements.status === "active"
        ? entitlements.entitlements.map((e) => e.slug)
        : [],
    ),
    settings:
      updates.status === "ok" ? updates.settings : { paused: [], skipped: [] },
    prs,
    runs,
  });

  return Response.json({
    ...state,
    githubConnected: connected,
    ops: connected ? updateOps(state) : [],
  });
}
