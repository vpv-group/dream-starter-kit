import type { CollectionConfig } from "payload";

import { generatePreviewPath, previewBreakpoints } from "../../lib/preview";
import { isStaff, publishedOrStaff } from "../access";
import { slugField } from "../fields/slug";

/**
 * Legal documents (Terms of Service, Privacy Policy, DPA, cookie policy, …),
 * addressed by slug under the public `/legal/<slug>` route. Separate from
 * `pages` on purpose: legal docs are plain rich-text prose (no marketing
 * blocks), carry an effective date, and render inside the `/legal` shell —
 * a table-of-contents sidebar listing every published document (Upwork-style
 * legal center). Add a new document = add a row, no code.
 */
export const LegalPages: CollectionConfig = {
  slug: "legal",
  labels: { singular: "Legal Page", plural: "Legal" },
  trash: true,
  admin: {
    useAsTitle: "title",
    group: "System",
    defaultColumns: ["title", "slug", "effectiveDate", "_status"],
    // Live Preview: the admin iframe loads /next/preview, which enables draft
    // mode and renders the document's draft at /legal/<slug>.
    livePreview: {
      url: ({ data }) =>
        generatePreviewPath({
          collection: "legal",
          slug: typeof data.slug === "string" ? data.slug : undefined,
        }),
      breakpoints: previewBreakpoints,
    },
    preview: (doc) =>
      generatePreviewPath({
        collection: "legal",
        slug: typeof doc.slug === "string" ? doc.slug : undefined,
      }),
  },
  defaultSort: "order",
  versions: { drafts: { schedulePublish: true }, maxPerDoc: 25 },
  access: {
    read: publishedOrStaff,
    create: isStaff,
    update: isStaff,
    delete: isStaff,
  },
  fields: [
    { name: "title", type: "text", required: true },
    slugField(),
    {
      name: "content",
      type: "richText",
      required: true,
    },
    {
      name: "effectiveDate",
      type: "date",
      admin: {
        position: "sidebar",
        date: { pickerAppearance: "dayOnly" },
        description: "Shown under the title as “Effective <date>”.",
      },
    },
    {
      // Position in the /legal table of contents (ascending; ties break by
      // title). Also the admin list's default sort.
      name: "order",
      type: "number",
      defaultValue: 0,
      admin: { position: "sidebar" },
    },
  ],
};
