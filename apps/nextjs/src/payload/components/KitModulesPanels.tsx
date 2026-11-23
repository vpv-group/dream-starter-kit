"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Banner,
  Button,
  Dropzone,
  Gutter,
  Pill,
  TextInput,
} from "@payloadcms/ui";

import {
  dispatchModuleOp,
  isEntitled,
  isPaidEntry,
  refreshModules,
  uploadModuleZip,
  useModulesState,
} from "./kit-modules-store";

/**
 * The Modules page (`/admin/collections/kit-modules`, docs/MODULES.md) is
 * Payload's own list of installed modules (enable/disable, search, columns)
 * with module management added through the list slots (KitModules.ts):
 *
 * - KitModulesNotices (beforeListTable): the read-only notice when module ops
 *   isn't set up, and the result of the last action.
 * - KitModulesExtras (afterList): the catalog and the operations panel below
 *   the table, and a right sidebar with Install from GitHub and Upload ZIP.
 *
 * Install state per row (origin, updates, Update/Remove) is in the table
 * cells (KitModulesCells.tsx). Layout: `.collection-list--kit-modules` in
 * app/(payload)/custom.css.
 */

export function KitModulesNotices() {
  const { registry, message } = useModulesState();

  useEffect(() => {
    void refreshModules();
  }, []);

  return (
    <>
      {registry && !registry.opsConfigured ? (
        <Banner type="info">
          Read-only, and paid modules are off: set up module ops (the{" "}
          <code>MOD_OPS_TOKEN</code> repo secret and the{" "}
          <code>GITHUB_OPS_TOKEN</code> env — steps at the top of{" "}
          <Link href="/admin">the dashboard</Link>) to install, update and
          remove from here. Until then, free modules work with the CLI:{" "}
          <code>pnpm mod add &lt;url&gt;</code>,{" "}
          <code>pnpm mod update &lt;slug&gt;</code>,{" "}
          <code>pnpm mod remove &lt;slug&gt;</code>.
        </Banner>
      ) : null}
      {message ? (
        <Banner type={message.kind === "success" ? "success" : "error"}>
          {message.text}
        </Banner>
      ) : null}
    </>
  );
}

export function KitModulesExtras() {
  return (
    <>
      <Gutter className="kit-modules-page__main">
        <Catalog />
        <Operations />
      </Gutter>
      <aside className="kit-modules-page__sidebar">
        <InstallFromGitHub />
        <UploadZip />
        <AppMenu />
      </aside>
    </>
  );
}

function Catalog() {
  const state = useModulesState();
  const { registry, catalog, busy } = state;
  if (!registry) return null;

  const installedSlugs = new Set(registry.installed.map((mod) => mod.slug));
  // No module ops → no paid modules: only free catalog entries are shown.
  const visible = registry.paidModulesEnabled
    ? catalog
    : catalog.filter((entry) => !isPaidEntry(entry));
  if (visible.length === 0) return null;

  return (
    <section className="kit-modules-page__section">
      <h3>Catalog</h3>
      <div className="kit-modules-catalog">
        {visible.map((entry) => {
          // Paid modules distribute through the Dream registry
          // (`dream:<slug>`), free ones from their public repo.
          const paid = isPaidEntry(entry);
          const source = paid ? `dream:${entry.slug}` : entry.repo;
          const installable = !paid || isEntitled(state, entry.slug);
          return (
            <div className="kit-modules-catalog__card" key={entry.slug}>
              <div className="kit-modules-catalog__title">
                <strong>{entry.name}</strong>
                {entry.latest ? <span>{entry.latest}</span> : null}
                {paid && entry.plan ? (
                  <Pill pillStyle="light-gray" size="small">
                    Included in {entry.plan}
                  </Pill>
                ) : null}
              </div>
              {entry.description ? <p>{entry.description}</p> : null}
              <div className="kit-modules-catalog__action">
                {installedSlugs.has(entry.slug) ? (
                  <Pill pillStyle="success" size="small">
                    Installed
                  </Pill>
                ) : !installable ? (
                  entry.pricingUrl ? (
                    <Button
                      buttonStyle="secondary"
                      el="anchor"
                      margin={false}
                      newTab
                      size="small"
                      url={entry.pricingUrl}
                    >
                      Get access
                    </Button>
                  ) : (
                    <em>
                      {registry.licenseConfigured
                        ? "Not included in your plan"
                        : "Needs a license key (DREAM_LICENSE_KEY)"}
                    </em>
                  )
                ) : registry.opsConfigured && source ? (
                  <Button
                    buttonStyle="secondary"
                    disabled={busy}
                    margin={false}
                    onClick={() => void dispatchModuleOp({ op: "add", source })}
                    size="small"
                  >
                    Install
                  </Button>
                ) : (
                  <code>pnpm mod add {source}</code>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Operations() {
  const { ops } = useModulesState();
  if (!ops) return null;
  return (
    <section className="kit-modules-page__section">
      <h3>Operations</h3>
      {ops.prs.length === 0 && ops.runs.length === 0 ? (
        <p className="kit-modules-page__muted">No recent module operations.</p>
      ) : (
        <ul className="kit-modules-ops">
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
              </a>
              <Pill
                pillStyle={
                  run.conclusion === "success"
                    ? "success"
                    : run.conclusion
                      ? "error"
                      : "warning"
                }
                size="small"
              >
                {run.conclusion ?? run.status}
              </Pill>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function InstallFromGitHub() {
  const { registry, busy } = useModulesState();
  const [url, setUrl] = useState("");
  const disabled = busy || !registry?.opsConfigured;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!url || disabled) return;
    if (await dispatchModuleOp({ op: "add", source: url })) setUrl("");
  };

  return (
    <form
      className="kit-modules-page__sidebar-section"
      onSubmit={(e) => void onSubmit(e)}
    >
      <h4>Install from GitHub</h4>
      <TextInput
        description="Append #v1.2.3 to install a specific tag."
        label="Repository URL"
        onChange={(e: ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
        path="kitModulesInstallUrl"
        placeholder="https://github.com/you/dream-mod-thing"
        value={url}
      />
      <Button
        buttonStyle="primary"
        disabled={disabled || !url}
        margin={false}
        size="medium"
        type="submit"
      >
        Install
      </Button>
      {registry && !registry.opsConfigured ? <CliHint /> : null}
    </form>
  );
}

function UploadZip() {
  const { registry, busy } = useModulesState();
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const disabled = busy || !registry?.opsConfigured;

  const pick = (files: FileList | null) => {
    const picked = files?.[0];
    if (picked) setFile(picked);
  };

  const onUpload = async () => {
    if (!file || disabled) return;
    if (await uploadModuleZip(file)) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="kit-modules-page__sidebar-section">
      <h4>Upload ZIP</h4>
      <Dropzone className="kit-modules-dropzone" onChange={pick}>
        <div className="kit-modules-dropzone__inner">
          <span>{file ? file.name : "Drop a module .zip here, or"}</span>
          <Button
            buttonStyle="pill"
            margin={false}
            onClick={() => inputRef.current?.click()}
            size="small"
          >
            {file ? "Choose another" : "Select a file"}
          </Button>
          <input
            accept=".zip"
            hidden
            name="zip"
            onChange={(e) => pick(e.target.files)}
            ref={inputRef}
            type="file"
          />
        </div>
      </Dropzone>
      <Button
        buttonStyle="primary"
        disabled={disabled || !file}
        margin={false}
        onClick={() => void onUpload()}
        size="medium"
      >
        Upload &amp; install
      </Button>
      {registry && !registry.opsConfigured ? (
        <p className="kit-modules-page__muted">
          Installing needs module ops — see the notice above the table.
        </p>
      ) : null}
    </div>
  );
}

/** Modules add their menu entries to Nav Items; staff edit them there. */
function AppMenu() {
  return (
    <div className="kit-modules-page__sidebar-section">
      <h4>App menu</h4>
      <p className="kit-modules-page__muted">
        Each module adds its entries to the app menu. Reorder, rename or hide
        them in Nav Items.
      </p>
      <Button
        buttonStyle="secondary"
        el="link"
        margin={false}
        size="medium"
        url="/admin/collections/nav-items"
      >
        Edit the menu
      </Button>
    </div>
  );
}

function CliHint() {
  return (
    <p className="kit-modules-page__muted">
      Needs module ops. Until then, use the CLI:{" "}
      <code>pnpm mod add &lt;url&gt;</code>
    </p>
  );
}
