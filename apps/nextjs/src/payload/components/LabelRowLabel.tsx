"use client";

import { Pill, useRowLabel } from "@payloadcms/ui";

interface RowData {
  label?: unknown;
  name?: unknown;
  title?: unknown;
  key?: unknown;
  archived?: unknown;
}

const text = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/**
 * A generic array RowLabel: shows a row's `label` (or `name` / `title`), its
 * `key` muted when present, and an "archived" pill when `archived` is set,
 * instead of Payload's "Row 01". Any array field can opt in with
 * `admin.components.RowLabel: ROW_LABEL_COMPONENT` (`@acme/mod-kit/payload`);
 * it's pinned in the import map (payload.config.ts → admin.dependencies), so
 * modules can use it without a new import-map entry.
 */
export function LabelRowLabel() {
  const { data, rowNumber } = useRowLabel<RowData | undefined>();
  const title = text(data?.label) ?? text(data?.name) ?? text(data?.title);
  const key = text(data?.key);
  const fallback = `Row ${String((rowNumber ?? 0) + 1).padStart(2, "0")}`;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span>{title ?? key ?? fallback}</span>
      {title && key && key !== title ? (
        <span style={{ color: "var(--theme-elevation-500)" }}>· {key}</span>
      ) : null}
      {data?.archived === true ? (
        <Pill pillStyle="light-gray" size="small">
          archived
        </Pill>
      ) : null}
    </span>
  );
}
