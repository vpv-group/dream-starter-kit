import type { Access, CollectionConfig, Where } from "payload";

import { isStaff } from "@acme/mod-kit/payload";

import { CHANGELOG_TYPE_META, CHANGELOG_TYPES } from "../../shared/changelog";
import { slugify } from "../../shared/config";
import { changelogAfterChange } from "../hooks/changelog-publish";

const PUBLIC_ENTRIES: Where = {
  and: [
    { _status: { equals: "published" } },
    { audience: { equals: "everyone" } },
  ],
};

/** Published + everyone-audience entries for the public; staff see all. */
const readEntries: Access = (args) => (isStaff(args) ? true : PUBLIC_ENTRIES);

/**
 * Changelog entries (Canny's changelog): rich text, a type (New / Improved
 * / Fixed), labels, and the ideas they shipped. Drafts → publish, with
 * scheduled publishing and versions. The first publish moves linked ideas
 * to the "shipped" stage (Settings → Changelog), tells their voters once,
 * and emails changelog subscribers (hooks/changelog-publish.ts).
 */
export const Changelog: CollectionConfig = {
  slug: "mod-feedback-changelog",
  labels: { singular: "Changelog entry", plural: "Changelog" },
  admin: {
    group: "Feedback",
    useAsTitle: "title",
    defaultColumns: ["title", "type", "publishedAt", "_status"],
    listSearchableFields: ["title", "excerpt"],
    description: "Product updates shown on /changelog (and its RSS feed).",
  },
  versions: { drafts: { schedulePublish: true }, maxPerDoc: 25 },
  access: {
    read: readEntries,
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  hooks: { afterChange: [changelogAfterChange] },
  fields: [
    { name: "title", type: "text", required: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: {
        position: "sidebar",
        description: "/changelog/<slug>. Filled from the title.",
      },
      hooks: {
        beforeValidate: [
          ({ value, siblingData }): unknown => {
            if (typeof value === "string" && value.trim())
              return slugify(value);
            const title: unknown = (siblingData as { title?: unknown }).title;
            return typeof title === "string" ? slugify(title) : value;
          },
        ],
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "type",
          type: "select",
          required: true,
          defaultValue: "new",
          options: CHANGELOG_TYPES.map((t) => ({
            label: CHANGELOG_TYPE_META[t].label,
            value: t,
          })),
          admin: { width: "33%" },
        },
        {
          name: "labels",
          type: "relationship",
          relationTo: "mod-feedback-changelog-labels",
          hasMany: true,
          admin: { width: "67%" },
        },
      ],
    },
    {
      name: "excerpt",
      type: "textarea",
      admin: {
        description:
          "One or two sentences: shown in RSS, emails and the What's new widget.",
      },
    },
    { name: "body", type: "richText" },
    { name: "heroImage", type: "upload", relationTo: "media" },
    {
      name: "audience",
      type: "select",
      required: true,
      defaultValue: "everyone",
      options: [
        { label: "Everyone", value: "everyone" },
        { label: "Signed-in members", value: "members" },
      ],
      admin: {
        position: "sidebar",
        description: "Members-only entries skip RSS and sharing.",
      },
    },
    {
      name: "notifySubscribers",
      type: "checkbox",
      defaultValue: true,
      admin: {
        position: "sidebar",
        description:
          "On first publish: email changelog subscribers and tell voters of linked ideas.",
      },
    },
    {
      name: "publishedAt",
      type: "date",
      admin: {
        position: "sidebar",
        description: "Shown as the entry's date. Set on first publish.",
      },
    },
    {
      name: "linkedIdeas",
      type: "text",
      hasMany: true,
      admin: {
        position: "sidebar",
        readOnly: true,
        description:
          "Ideas this entry shipped — link them in Feedback admin → Ideas → idea → Changelog.",
      },
    },
    {
      name: "announcedAt",
      type: "date",
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "When subscribers and voters were told.",
      },
    },
  ],
};
