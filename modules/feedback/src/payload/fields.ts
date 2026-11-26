import type { Field, TextFieldSingleValidation } from "payload";

import { slugify, TONES } from "../shared/config";

/** Tone select (the design system's semantic tones). */
export const toneField = (name = "tone", defaultValue = "neutral"): Field => ({
  name,
  type: "select",
  defaultValue,
  options: TONES.map((t) => ({
    label: t.charAt(0).toUpperCase() + t.slice(1),
    value: t,
  })),
  admin: { width: "25%" },
});

/**
 * A stable machine key for an array row (statuses, tags, categories), filled
 * from `from` on first save and read-only afterwards: it is the row's id in
 * the Supabase copy, so renaming the row never orphans posts.
 */
export const keyField = (from: string, description?: string): Field => ({
  name: "key",
  type: "text",
  index: false,
  admin: {
    readOnly: true,
    width: "25%",
    description:
      description ?? "Set automatically from the name; never changes.",
  },
  hooks: {
    beforeValidate: [
      ({ value, siblingData }): unknown => {
        if (typeof value === "string" && value.trim()) return value;
        const source = (siblingData as Record<string, unknown>)[from];
        return typeof source === "string" && source.trim()
          ? slugify(source)
          : (value as unknown);
      },
    ],
  },
});

/** Unique `key` values within an array field. */
export const uniqueKeys: (label: string) => (rows: unknown) => true | string =
  (label) => (rows) => {
    if (!Array.isArray(rows)) return true;
    const seen = new Set<string>();
    for (const row of rows as { key?: string; name?: string }[]) {
      const key = row.key ?? (row.name ? slugify(row.name) : "");
      if (!key) continue;
      if (seen.has(key))
        return `Two ${label} share the key "${key}" — rename one.`;
      seen.add(key);
    }
    return true;
  };

export const slugValidate: TextFieldSingleValidation = (value) =>
  !value || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
    ? true
    : "Use lowercase letters, numbers and dashes.";
