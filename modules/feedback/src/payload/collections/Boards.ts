import type { CollectionConfig } from "payload";

import { isAdmin, isStaff } from "@acme/mod-kit/payload";

import { RESERVED_BOARD_SLUGS, slugify } from "../../shared/config";
import { keyField, slugValidate, uniqueKeys } from "../fields";
import {
  syncBoardsAfterChange,
  syncBoardsAfterDelete,
} from "../hooks/sync-config";

const anonRule = (name: string, label: string) => ({
  name,
  label,
  type: "select" as const,
  defaultValue: "inherit",
  options: [
    { label: "Use the global default", value: "inherit" },
    { label: "Allow", value: "allow" },
    { label: "Don't allow", value: "deny" },
  ],
  admin: { width: "33%" },
});

const toggle = (
  name: string,
  label: string,
  defaultValue: boolean,
  description?: string,
) => ({
  name,
  label,
  type: "checkbox" as const,
  defaultValue,
  admin: description ? { description } : undefined,
});

/**
 * Feedback boards (Canny: Settings → Boards). Each board is its own feedback
 * area on the portal with its own access rules, public-view toggles, create
 * form and categories. Saving copies the board into
 * `public.mod_feedback_boards` (+ categories) for RLS; removing a board
 * archives that copy so its posts are kept.
 */
export const Boards: CollectionConfig = {
  slug: "mod-feedback-boards",
  labels: { singular: "Board", plural: "Boards" },
  orderable: true,
  admin: {
    group: "Feedback",
    useAsTitle: "name",
    defaultColumns: ["name", "slug", "access", "allowNewPosts"],
    description:
      "Feedback boards on the portal (/feedback). Drag to reorder. New boards are private (staff only) until you open them up.",
  },
  access: {
    read: isStaff,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [syncBoardsAfterChange],
    afterDelete: [syncBoardsAfterDelete],
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "General",
          fields: [
            {
              name: "name",
              type: "text",
              required: true,
              maxLength: 40,
            },
            {
              name: "slug",
              type: "text",
              required: true,
              unique: true,
              index: true,
              validate: (
                value: string | null | undefined,
                args: Parameters<typeof slugValidate>[1],
              ) => {
                if (
                  value &&
                  (RESERVED_BOARD_SLUGS as readonly string[]).includes(value)
                ) {
                  return `"${value}" is reserved by the portal.`;
                }
                return slugValidate(value, args);
              },
              admin: {
                description:
                  "The board's URL: /feedback/<slug>. Filled from the name.",
              },
              hooks: {
                beforeValidate: [
                  ({ value, siblingData }): unknown => {
                    if (typeof value === "string" && value.trim()) {
                      return slugify(value);
                    }
                    const name: unknown = (siblingData as { name?: unknown })
                      .name;
                    return typeof name === "string" ? slugify(name) : value;
                  },
                ],
              },
            },
            {
              name: "description",
              type: "textarea",
              admin: {
                description:
                  "Shown under the board name (markdown links allowed). Also shown in place of the form when new posts are off.",
              },
            },
          ],
        },
        {
          label: "Access",
          description: "Who can see this board (Canny: Privacy).",
          fields: [
            {
              name: "access",
              type: "select",
              required: true,
              defaultValue: "staff",
              options: [
                { label: "Private — staff only", value: "staff" },
                { label: "Public — anyone with the link", value: "public" },
                { label: "Members — signed-in users", value: "members" },
                {
                  label: "Segment — users with one of the tags below",
                  value: "segment",
                },
              ],
            },
            {
              name: "segmentTags",
              label: "Segment tags",
              type: "text",
              hasMany: true,
              admin: {
                condition: (_, sibling) => sibling.access === "segment",
                description:
                  "User tag names (People → Users → Tags). Users with any of them can see the board.",
              },
            },
            {
              type: "row",
              fields: [
                toggle(
                  "showOnPortalHome",
                  "Show on the portal home",
                  true,
                  "List it on /roadmap and in the board switcher. Hidden boards still open by URL.",
                ),
                toggle("searchIndexing", "Allow search engine indexing", false),
              ],
            },
          ],
        },
        {
          label: "Posting & visibility",
          description: "Canny's public-view toggles.",
          fields: [
            toggle(
              "allowNewPosts",
              "Allow new posts from end users",
              true,
              "Off hides the create form; people can still vote and comment.",
            ),
            {
              type: "row",
              fields: [
                anonRule("anonVotes", "Anonymous votes"),
                anonRule("anonPosts", "Anonymous posts"),
                anonRule("anonComments", "Anonymous comments"),
              ],
            },
            toggle(
              "requireApproval",
              "Approve new posts before they appear",
              false,
              "New posts wait in the staff Inbox (/a/feedback).",
            ),
            {
              type: "row",
              fields: [
                toggle("showVoteCounts", "Show vote counts", true),
                toggle("showVoters", "Show voters", true),
                toggle("showDates", "Show dates", true),
                toggle(
                  "showCommentsPublicly",
                  "Show comments publicly",
                  true,
                  "Off: people only see staff comments and their own.",
                ),
              ],
            },
            {
              type: "row",
              fields: [
                toggle(
                  "disableVotesWhenDone",
                  "Disable votes on completed/closed posts",
                  false,
                ),
                toggle(
                  "disableCommentsWhenDone",
                  "Disable comments on completed/closed posts",
                  false,
                ),
              ],
            },
          ],
        },
        {
          label: "Create Post Form",
          description: "Every string on the board's create form.",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "titleLabel",
                  type: "text",
                  defaultValue: "Title",
                  admin: { width: "50%" },
                },
                {
                  name: "titlePlaceholder",
                  type: "text",
                  defaultValue: "Short, descriptive title",
                  admin: { width: "50%" },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "detailsLabel",
                  type: "text",
                  defaultValue: "Details",
                  admin: { width: "50%" },
                },
                {
                  name: "detailsPlaceholder",
                  type: "text",
                  defaultValue: "Any additional details…",
                  admin: { width: "50%" },
                },
              ],
            },
            {
              name: "submitLabel",
              type: "text",
              defaultValue: "Create Post",
            },
            toggle("allowAttachments", "Allow image attachments", true),
            {
              name: "customFields",
              type: "array",
              maxRows: 3,
              labels: { singular: "Custom field", plural: "Custom fields" },
              admin: {
                description: "Up to three extra questions on the form.",
                initCollapsed: true,
              },
              validate: uniqueKeys("custom fields"),
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "label",
                      type: "text",
                      required: true,
                      admin: { width: "50%" },
                    },
                    keyField("label"),
                    {
                      name: "required",
                      type: "checkbox",
                      defaultValue: false,
                      admin: { width: "25%" },
                    },
                  ],
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "type",
                      type: "select",
                      defaultValue: "text",
                      options: [
                        { label: "Short text", value: "text" },
                        { label: "Long text", value: "textarea" },
                        { label: "Choice", value: "select" },
                      ],
                      admin: { width: "33%" },
                    },
                    {
                      name: "placeholder",
                      type: "text",
                      admin: { width: "67%" },
                    },
                  ],
                },
                {
                  name: "options",
                  type: "text",
                  hasMany: true,
                  admin: {
                    condition: (_, sibling) => sibling.type === "select",
                  },
                },
              ],
            },
          ],
        },
        {
          label: "Categories",
          description:
            "Public categories for this board; a post has one. Drag to reorder.",
          fields: [
            {
              name: "categories",
              type: "array",
              labels: { singular: "Category", plural: "Categories" },
              validate: uniqueKeys("categories"),
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "name",
                      type: "text",
                      required: true,
                      admin: { width: "50%" },
                    },
                    keyField("name"),
                  ],
                },
                {
                  name: "subcategories",
                  type: "array",
                  labels: { singular: "Subcategory", plural: "Subcategories" },
                  admin: { initCollapsed: true },
                  fields: [
                    {
                      type: "row",
                      fields: [
                        {
                          name: "name",
                          type: "text",
                          required: true,
                          admin: { width: "50%" },
                        },
                        keyField("name"),
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
