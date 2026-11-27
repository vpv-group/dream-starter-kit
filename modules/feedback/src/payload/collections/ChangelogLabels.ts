import type { CollectionConfig } from "payload";

import { anyone, isStaff } from "@acme/mod-kit/payload";

import { toneField } from "../fields";

/** Changelog labels (Canny: product areas readers can filter by). */
export const ChangelogLabels: CollectionConfig = {
  slug: "mod-feedback-changelog-labels",
  labels: { singular: "Changelog label", plural: "Changelog labels" },
  orderable: true,
  admin: {
    group: "Feedback",
    useAsTitle: "name",
    defaultColumns: ["name", "tone"],
    description:
      "Labels for changelog entries; readers filter by them on /changelog.",
  },
  access: { read: anyone, create: isStaff, update: isStaff, delete: isStaff },
  fields: [
    { name: "name", type: "text", required: true, unique: true },
    toneField("tone", "neutral"),
  ],
};
