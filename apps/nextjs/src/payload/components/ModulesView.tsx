"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * /admin/modules — manage installed modules (docs/MODULES-PLAN.md
 * §6): installed list from the BUNDLED lock, a curated catalog
 * (MOD_CATALOG_URL), install-from-GitHub and zip-upload forms, and the live
 * operations panel. Every mutation dispatches module-ops.yml and lands as
 * a PR; without GITHUB_OPS_TOKEN the page is read-only with CLI instructions.
 *
 * Uses Payload's admin chrome class names so it inherits the admin theme.
 */

interface RegistryResponse {
  installed: { slug: string; name: string; version: string; system: boolean }[];
  lock: {
    modules: Record<
      string,
      { version: string; source: unknown; pinned?: boolean }
    >;
  };
  opsConfigured: boolean;
  /** Paid modules need module ops (GITHUB_OPS_TOKEN); off until then. */
  paidModulesEnabled: boolean;
  catalogUrl: string | null;
  /** Is DREAM_LICENSE_KEY set (paid modules — docs/MODULES.md)? */
  licenseConfigured: boolean;
}

interface CatalogEntry {
  slug: string;
  name: string;
  description?: string;
  /** Free modules install from a repo; paid ones from the Dream registry. */
  repo?: string;
  latest?: string;
  kitCompat?: string;
  paid?: boolean;
  /** Dream registry catalog (schema 2) says "paid" | "free". */
  access?: "paid" | "free";
  /** "Included in <plan>" on paid cards. */
  plan?: string;
  /** Where to buy access when not entitled. */
  pricingUrl?: string;
}

interface EntitlementsState {
  configured: boolean;
  status: "none" | "active" | "inactive" | "error" | "disabled";
  code?: string;
  entitlements: { slug: string; plan?: string }[];
}

/** Paid modules come from the Dream registry, free ones from a public repo. */
const isPaidEntry = (entry: CatalogEntry): boolean =>
  entry.paid ?? (entry.access ? entry.access === "paid" : !entry.repo);

/** Tiny semver-ish "is b newer than a" for update badges (no prereleases). */
const isNewer = (a: string, b: string): boolean => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const [x = 0, y = 0] = [pa[i], pb[i]];
    if (x !== y) return y > x;
  }
  return false;
};

interface OpsResponse {
  runs: {
    id: number;
    status: string;
    conclusion: string | null;
    url: string;
    title: string;
  }[];
  prs: { number: number; title: string; url: string }[];
}

const sourceLabel = (source: unknown): string => {
  if (typeof source === "string") return source;
  if (source && typeof source === "object" && "type" in source) {
    return String((source as { type: string }).type);
  }
  return "unknown";
};

export function ModulesView() {
  const [registry, setRegistry] = useState<RegistryResponse | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [entitlements, setEntitlements] = useState<EntitlementsState | null>(
    null,
  );
  const [ops, setOps] = useState<OpsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [installUrl, setInstallUrl] = useState("");

  const refresh = useCallback(async () => {
    const reg = (await fetch("/api/modules/registry").then((r) =>
      r.ok ? r.json() : null,
    )) as RegistryResponse | null;
    setRegistry(reg);
    if (reg?.catalogUrl) {
      try {
        const cat = (await fetch(reg.catalogUrl).then((r) => r.json())) as {
          modules?: CatalogEntry[];
        };
        setCatalog(cat.modules ?? []);
      } catch {
        setCatalog([]);
      }
    }
    // License/entitlement state for paid modules — proxied server-side so the
    // key never reaches the browser.
    const ent = (await fetch("/api/modules/entitlements").then((r) =>
      r.ok ? r.json() : null,
    )) as EntitlementsState | null;
    setEntitlements(ent);
    if (reg?.opsConfigured) {
      const o = (await fetch("/api/modules/ops").then((r) =>
        r.ok ? r.json() : null,
      )) as OpsResponse | null;
      setOps(o);
    }
  }, []);

  useEffect(() => {
    // Initial data load; every setState in `refresh` runs after an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function dispatchOp(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/modules/ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      setMessage(
        res.ok
          ? "Dispatched — a PR will open shortly (see Operations below). Merging it deploys; migrations apply automatically when the new version deploys."
          : (json.error ?? "Dispatch failed"),
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onUploadZip(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem(
      "zip",
    ) as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/modules/upload", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as {
        url?: string;
        sha256?: string;
        error?: string;
      };
      if (!res.ok || !json.url || !json.sha256) {
        setMessage(json.error ?? "Upload failed");
        return;
      }
      await dispatchOp({ op: "add", source: json.url, sha256: json.sha256 });
    } finally {
      setBusy(false);
    }
  }

  if (!registry) {
    return (
      <div className="gutter--left gutter--right" style={{ paddingTop: 40 }}>
        <h1>Modules</h1>
        <p>Loading…</p>
      </div>
    );
  }

  const installedSlugs = new Set(registry.installed.map((i) => i.slug));

  // Paid-module state (docs/MODULES.md → Paid modules). The license key lives
  // server-side only; `entitlements` is the proxied, derived state.
  const licenseActive = entitlements?.status === "active";
  const entitledPlans = new Map(
    (entitlements?.entitlements ?? []).map((e) => [e.slug, e.plan]),
  );
  const isEntitled = (slug: string) => licenseActive && entitledPlans.has(slug);
  const catalogBySlug = new Map(catalog.map((e) => [e.slug, e]));
  // No module ops → no paid modules: only free catalog entries are shown.
  const visibleCatalog = registry.paidModulesEnabled
    ? catalog
    : catalog.filter((e) => !isPaidEntry(e));
  /** Per-module license label for installed registry modules. */
  const licenseLabel = (slug: string): string => {
    if (!registry.paidModulesEnabled)
      return "paid modules off — set up module ops (top of /admin)";
    if (!registry.licenseConfigured) return "no license key — updates paused";
    if (entitlements?.status === "error") return "license status unavailable";
    if (!isEntitled(slug)) return "license inactive — updates paused";
    return "license active";
  };

  return (
    <div
      className="gutter--left gutter--right"
      style={{ paddingTop: 40, paddingBottom: 80, maxWidth: 900 }}
    >
      <h1>Modules</h1>
      {!registry.opsConfigured && (
        <p style={{ opacity: 0.8 }}>
          Read-only, and paid modules are off: set up module ops (the{" "}
          <code>MOD_OPS_TOKEN</code> repo secret and the{" "}
          <code>GITHUB_OPS_TOKEN</code> env — steps at the top of{" "}
          <Link href="/admin">the dashboard</Link>) to install, update and
          remove from here. Until then, free modules work with the CLI:{" "}
          <code>pnpm mod add &lt;url&gt;</code>,{" "}
          <code>pnpm mod update &lt;slug&gt;</code>,{" "}
          <code>pnpm mod remove &lt;slug&gt;</code>.
        </p>
      )}
      {message && (
        <p
          style={{ padding: "8px 12px", border: "1px solid", borderRadius: 4 }}
        >
          {message}
        </p>
      )}

      <h2 style={{ marginTop: 32 }}>Installed</h2>
      <table cellPadding={6} style={{ width: "100%", textAlign: "left" }}>
        <thead>
          <tr>
            <th>Module</th>
            <th>Version</th>
            <th>Origin</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {registry.installed.map((mod) => {
            const entry = registry.lock.modules[mod.slug];
            const origin = sourceLabel(entry?.source);
            const fromRegistry = origin === "registry";
            const catalogLatest = catalogBySlug.get(mod.slug)?.latest;
            const registryUpdate =
              fromRegistry &&
              isEntitled(mod.slug) &&
              catalogLatest &&
              isNewer(mod.version, catalogLatest)
                ? catalogLatest
                : null;
            return (
              <tr key={mod.slug}>
                <td>
                  {mod.name} {mod.system ? "· system" : ""}
                  {entry?.pinned ? " · pinned" : ""}
                </td>
                <td>
                  {mod.version}
                  {registryUpdate ? (
                    <>
                      {" "}
                      <em>→ {registryUpdate} available</em>
                    </>
                  ) : fromRegistry && isEntitled(mod.slug) ? (
                    " · up to date"
                  ) : (
                    ""
                  )}
                </td>
                <td>
                  {origin}
                  {fromRegistry && (
                    <>
                      {" · "}
                      <em>{licenseLabel(mod.slug)}</em>
                    </>
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <a href={`/admin/collections/kit-modules`}>enable/disable</a>
                  {" · "}
                  <a href={`/admin/collections/nav-items`}>menu</a>
                  {registry.opsConfigured &&
                    (origin === "github" ||
                      (fromRegistry && isEntitled(mod.slug))) && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void dispatchOp({ op: "update", slug: mod.slug })
                          }
                        >
                          update
                        </button>
                      </>
                    )}
                  {registry.opsConfigured && !mod.system && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove ${mod.name}? Its tables are DROPPED by the generated migration unless the PR is edited (--keep-data). This PR never auto-merges.`,
                            )
                          ) {
                            void dispatchOp({ op: "remove", slug: mod.slug });
                          }
                        }}
                      >
                        remove
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {visibleCatalog.length > 0 && (
        <>
          <h2 style={{ marginTop: 32 }}>Catalog</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {visibleCatalog.map((entry) => {
              // Paid modules distribute through the Dream registry
              // (`dream:<slug>`), free ones from their public repo.
              const paid = isPaidEntry(entry);
              const entitled = isEntitled(entry.slug);
              const source = paid ? `dream:${entry.slug}` : entry.repo;
              const installable = !paid || entitled;
              return (
                <div
                  key={entry.slug}
                  style={{ border: "1px solid", borderRadius: 6, padding: 12 }}
                >
                  <strong>{entry.name}</strong> {entry.latest ?? ""}
                  {paid && entry.plan && (
                    <em style={{ marginLeft: 8 }}>Included in {entry.plan}</em>
                  )}
                  <p style={{ margin: "4px 0" }}>{entry.description}</p>
                  {installedSlugs.has(entry.slug) ? (
                    <em>Installed</em>
                  ) : !installable ? (
                    entry.pricingUrl ? (
                      <a
                        href={entry.pricingUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Get access
                      </a>
                    ) : (
                      <em>
                        {registry.licenseConfigured
                          ? "Not included in your plan"
                          : "Needs a license key (DREAM_LICENSE_KEY)"}
                      </em>
                    )
                  ) : registry.opsConfigured && source ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void dispatchOp({ op: "add", source })}
                    >
                      Install
                    </button>
                  ) : (
                    <code>pnpm mod add {source}</code>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <h2 style={{ marginTop: 32 }}>Install from GitHub</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (installUrl) void dispatchOp({ op: "add", source: installUrl });
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          style={{ flex: 1, padding: 6 }}
          placeholder="https://github.com/you/dream-mod-thing[#v1.2.3]"
          value={installUrl}
          onChange={(e) => setInstallUrl(e.target.value)}
        />
        <button type="submit" disabled={busy || !registry.opsConfigured}>
          Install
        </button>
      </form>

      <h2 style={{ marginTop: 32 }}>Upload ZIP</h2>
      <form
        onSubmit={(e) => void onUploadZip(e)}
        style={{ display: "flex", gap: 8 }}
      >
        <input type="file" name="zip" accept=".zip" />
        <button type="submit" disabled={busy || !registry.opsConfigured}>
          Upload &amp; install
        </button>
      </form>

      {ops && (
        <>
          <h2 style={{ marginTop: 32 }}>Operations</h2>
          <ul>
            {ops.prs.map((pr) => (
              <li key={pr.number}>
                <a href={pr.url} target="_blank" rel="noreferrer">
                  PR #{pr.number}: {pr.title}
                </a>
              </li>
            ))}
            {ops.runs.map((run) => (
              <li key={run.id}>
                <a href={run.url} target="_blank" rel="noreferrer">
                  {run.title}
                </a>{" "}
                — {run.conclusion ?? run.status}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
