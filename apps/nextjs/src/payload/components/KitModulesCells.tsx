"use client";

import type { DefaultCellComponentProps } from "payload";
import { Button, ConfirmationModal, Pill, useModal } from "@payloadcms/ui";

import {
  describeModule,
  dispatchModuleOp,
  useModulesState,
} from "./kit-modules-store";

/**
 * List-table cells for the Modules page (`kit-modules`), see KitModules.ts.
 * The row is the CMS mirror of an installed module; install state (origin,
 * updates, license) comes from the shared store (kit-modules-store.ts).
 */

interface ModuleRow {
  slug?: string;
  name?: string;
  version?: string;
  system?: boolean;
}

const rowOf = (props: DefaultCellComponentProps): ModuleRow => props.rowData;

/** Version, with "update available" / "up to date" for registry modules. */
export function KitModuleVersionCell(props: DefaultCellComponentProps) {
  const state = useModulesState();
  const row = rowOf(props);
  const version = row.version ?? "";
  const info = row.slug ? describeModule(state, row.slug, version) : null;
  return (
    <span className="kit-modules-cell">
      {version}
      {info?.updateAvailable ? (
        <Pill pillStyle="warning" size="small">
          {info.updateAvailable} available
        </Pill>
      ) : info?.upToDate ? (
        <Pill pillStyle="light-gray" size="small">
          Up to date
        </Pill>
      ) : null}
    </span>
  );
}

/** Where the module came from, plus system / pinned / license status. */
export function KitModuleSourceCell(props: DefaultCellComponentProps) {
  const state = useModulesState();
  const row = rowOf(props);
  if (!state.registry || !row.slug) return <span>…</span>;
  const info = describeModule(state, row.slug, row.version ?? "");
  return (
    <span className="kit-modules-cell">
      {info.origin}
      {info.system || row.system ? (
        <Pill pillStyle="light-gray" size="small">
          System
        </Pill>
      ) : null}
      {info.pinned ? (
        <Pill pillStyle="light-gray" size="small">
          Pinned
        </Pill>
      ) : null}
      {info.licenseLabel ? (
        <Pill
          pillStyle={
            info.licenseLabel === "License active" ? "success" : "warning"
          }
          size="small"
        >
          {info.licenseLabel}
        </Pill>
      ) : null}
    </span>
  );
}

/**
 * Update / Remove, when module ops is set up (read-only otherwise, see the
 * notice above the table). System modules can't be removed.
 */
export function KitModuleActionsCell(props: DefaultCellComponentProps) {
  const state = useModulesState();
  const { openModal } = useModal();
  const row = rowOf(props);
  if (!row.slug) return null;
  const slug = row.slug;
  const name = row.name ?? slug;
  const info = describeModule(state, slug, row.version ?? "");
  const removeModal = `remove-module-${slug}`;

  if (!info.canUpdate && !info.canRemove) {
    return <span className="kit-modules-page__muted">—</span>;
  }

  return (
    <span className="kit-modules-cell kit-modules-actions">
      {info.canUpdate ? (
        <Button
          buttonStyle="secondary"
          disabled={state.busy}
          margin={false}
          onClick={() => void dispatchModuleOp({ op: "update", slug })}
          size="small"
        >
          Update
        </Button>
      ) : null}
      {info.canRemove ? (
        <>
          <Button
            buttonStyle="secondary"
            className="kit-modules-remove"
            disabled={state.busy}
            margin={false}
            onClick={() => openModal(removeModal)}
            size="small"
          >
            Remove
          </Button>
          <ConfirmationModal
            body={
              <p>
                Its tables are dropped by the generated migration unless the PR
                is edited (<code>--keep-data</code>). This PR never auto-merges.
              </p>
            }
            confirmLabel="Remove"
            heading={`Remove ${name}?`}
            modalSlug={removeModal}
            onConfirm={async () => {
              await dispatchModuleOp({ op: "remove", slug });
            }}
          />
        </>
      ) : null}
    </span>
  );
}
