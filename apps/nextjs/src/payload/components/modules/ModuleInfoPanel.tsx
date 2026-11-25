"use client";

import Link from "next/link";
import {
  Button,
  ConfirmationModal,
  Pill,
  useDocumentInfo,
  useModal,
} from "@payloadcms/ui";

import {
  dispatchModuleOp,
  sourceLabel,
  useModulesAdmin,
} from "./use-modules-admin";

interface ModuleDoc {
  slug?: string;
  name?: string;
  version?: string;
  system?: boolean;
}

/**
 * Sidebar panel on a module's page (/admin/collections/kit-modules/<id>):
 * version + update, where it came from, license, a link to its menu items,
 * and — at the bottom, behind a confirmation — removal. Update and removal
 * dispatch module-ops and land as PRs; they show only for admins with module
 * ops set up. Removal isn't offered for system modules.
 */
export function ModuleInfoPanel() {
  const { data, initialData } = useDocumentInfo();
  const doc = (data ?? initialData ?? {}) as ModuleDoc;
  const slug = doc.slug ?? "";
  const { registry, statusFor, busy } = useModulesAdmin();
  const { openModal } = useModal();
  const status = slug ? statusFor(slug) : null;
  const removeSlug = `remove-module-${slug}`;
  const name = doc.name ?? slug;

  return (
    <div className="kit-module-info">
      <div className="field-label">Module</div>
      <dl className="kit-module-info__list">
        <dt>Version</dt>
        <dd>
          <span>{doc.version ?? "—"}</span>
          {status?.updateTo ? (
            <Pill pillStyle="warning" size="small">
              {status.updateTo} available
            </Pill>
          ) : null}
        </dd>
        {status ? (
          <>
            <dt>Source</dt>
            <dd>
              <span>{sourceLabel(status.source)}</span>
              {status.pinned ? (
                <Pill pillStyle="light-gray" size="small">
                  Pinned
                </Pill>
              ) : null}
            </dd>
          </>
        ) : null}
        {status?.license ? (
          <>
            <dt>License</dt>
            <dd
              className={
                status.license.ok ? undefined : "kit-module-info__warning"
              }
            >
              {status.license.label}
            </dd>
          </>
        ) : null}
        <dt>Slug</dt>
        <dd>
          <code>{slug}</code>
        </dd>
      </dl>

      {doc.system ? (
        <p className="kit-module-info__note">
          System module — the app shell depends on it. Disabling it breaks core
          navigation, and it can&apos;t be removed.
        </p>
      ) : null}

      {status?.canUpdate ? (
        <Button
          buttonStyle={status.updateTo ? "primary" : "secondary"}
          size="small"
          margin={false}
          disabled={busy}
          className="kit-module-info__button"
          onClick={() => void dispatchModuleOp({ op: "update", slug })}
        >
          {status.updateTo
            ? `Update to ${status.updateTo}`
            : "Check for updates"}
        </Button>
      ) : null}

      <p className="kit-module-info__link">
        <Link href="/admin/collections/nav-items">Edit menu items</Link>
      </p>

      {registry && !registry.opsConfigured ? (
        <p className="kit-module-info__note">
          Updating and removing modules from here needs module ops.{" "}
          <Link href="/admin">Set it up</Link>
        </p>
      ) : null}

      {status?.canRemove ? (
        <>
          <Button
            buttonStyle="subtle"
            size="small"
            margin={false}
            disabled={busy}
            className="kit-module-info__remove"
            onClick={() => openModal(removeSlug)}
          >
            Remove module…
          </Button>
          <ConfirmationModal
            modalSlug={removeSlug}
            heading={`Remove ${name}?`}
            body={
              <p>
                This opens a pull request that uninstalls {name}. Its database
                tables are <strong>dropped</strong> by the generated migration
                unless you edit the pull request to keep data (
                <code>--keep-data</code>). Removal pull requests never merge on
                their own.
              </p>
            }
            confirmLabel="Remove module"
            confirmingLabel="Requesting…"
            onConfirm={async () => {
              await dispatchModuleOp({ op: "remove", slug });
            }}
          />
        </>
      ) : null}
    </div>
  );
}

/** Main column placeholder for modules that have no settings of their own. */
export function NoModuleSettings() {
  return (
    <p className="kit-module-no-settings">
      This module has no settings. Turn it on or off with{" "}
      <strong>Enabled</strong> in the sidebar.
    </p>
  );
}
