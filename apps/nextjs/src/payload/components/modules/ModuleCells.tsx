"use client";

import type { DefaultCellComponentProps } from "payload";
import { Button, Pill } from "@payloadcms/ui";

import {
  dispatchModuleOp,
  sourceLabel,
  useModulesAdmin,
} from "./use-modules-admin";

/**
 * List cells for the Modules table (/admin/collections/kit-modules). They
 * share one store (use-modules-admin.ts), so every row reads the same
 * registry/catalog/license fetch.
 */

const rowSlug = (rowData: DefaultCellComponentProps["rowData"]): string => {
  const slug = (rowData as { slug?: unknown }).slug;
  return typeof slug === "string" ? slug : "";
};

/**
 * Version, plus an "Update to x.y.z" button when a newer version is available
 * and module ops can dispatch the update (it opens a pull request, like the
 * button on the module's page). Without module ops it stays a plain pill.
 */
export function ModuleVersionCell({
  cellData,
  rowData,
}: DefaultCellComponentProps) {
  const { statusFor, busy } = useModulesAdmin();
  const slug = rowSlug(rowData);
  const status = statusFor(slug);
  return (
    <span className="kit-modules-cell">
      <span>{typeof cellData === "string" ? cellData : ""}</span>
      {status?.updateTo && status.canUpdate ? (
        <Button
          buttonStyle="primary"
          size="xsmall"
          margin={false}
          disabled={busy}
          tooltip="Opens a pull request that updates this module"
          onClick={() => void dispatchModuleOp({ op: "update", slug })}
        >
          Update to {status.updateTo}
        </Button>
      ) : status?.updateTo ? (
        <Pill pillStyle="warning" size="small">
          Update: {status.updateTo}
        </Pill>
      ) : null}
    </span>
  );
}

/** Where the module came from (+ pinned, + license state for registry). */
export function ModuleSourceCell({ rowData }: DefaultCellComponentProps) {
  const { statusFor } = useModulesAdmin();
  const status = statusFor(rowSlug(rowData));
  if (!status) return <span className="kit-modules-cell__muted">—</span>;
  return (
    <span className="kit-modules-cell">
      <span>{sourceLabel(status.source)}</span>
      {status.pinned ? (
        <Pill pillStyle="light-gray" size="small">
          Pinned
        </Pill>
      ) : null}
      {status.license ? (
        <span
          className={
            status.license.ok
              ? "kit-modules-cell__muted"
              : "kit-modules-cell__warning"
          }
        >
          {status.license.label}
        </span>
      ) : null}
    </span>
  );
}

/** Enabled/Disabled pill, plus "System" for modules the shell depends on. */
export function ModuleEnabledCell({
  cellData,
  rowData,
}: DefaultCellComponentProps) {
  const system = Boolean((rowData as { system?: unknown }).system);
  return (
    <span className="kit-modules-cell">
      {cellData ? (
        <Pill pillStyle="success" size="small">
          Enabled
        </Pill>
      ) : (
        <Pill pillStyle="warning" size="small">
          Disabled
        </Pill>
      )}
      {system ? (
        <Pill pillStyle="light" size="small">
          System
        </Pill>
      ) : null}
    </span>
  );
}
