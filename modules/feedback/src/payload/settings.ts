import { defineModuleSettings } from "@acme/mod-kit/payload";

import type { StatusType, Tone } from "../shared/config";
import type { ScoreFactor } from "../shared/score";
import {
  DEFAULT_STATUSES,
  STATUS_TYPES,
  VOTE_MILESTONES,
} from "../shared/config";
import {
  DEFAULT_IDEA_STAGES,
  DEFAULT_SCORE_FACTORS,
  FACTOR_SCALES,
} from "../shared/score";
import { keyField, toneField, uniqueKeys } from "./fields";
import { syncSettingsAfterChange } from "./hooks/sync-config";

/**
 * Feedback settings (/admin → Modules → Feedback, also under the "Feedback"
 * admin group) — the Payload-side configuration from Canny's admin screens.
 * Statuses and tags are copied into Supabase on save (sync-config.ts) so
 * RLS and joins can use them. The portal reads the public subset through
 * GET /api/mod/feedback/config; this global itself is staff-only.
 */
export const settings = defineModuleSettings({
  slug: "feedback",
  name: "Feedback",
  group: "Feedback",
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Portal",
          description:
            "The public portal at /roadmap, /feedback and /changelog.",
          fields: [
            {
              name: "portalTabs",
              label: "Tabs",
              type: "array",
              minRows: 1,
              maxRows: 3,
              admin: {
                description:
                  "Order, labels and visibility of the portal tabs. Drag to reorder.",
              },
              defaultValue: [
                { tab: "roadmap", label: "Roadmap", enabled: true },
                { tab: "feedback", label: "Feedback", enabled: true },
                { tab: "changelog", label: "Changelog", enabled: true },
              ],
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "tab",
                      type: "select",
                      required: true,
                      options: [
                        { label: "Roadmap", value: "roadmap" },
                        { label: "Feedback", value: "feedback" },
                        { label: "Changelog", value: "changelog" },
                      ],
                      admin: { width: "33%" },
                    },
                    {
                      name: "label",
                      type: "text",
                      required: true,
                      admin: { width: "33%" },
                    },
                    {
                      name: "enabled",
                      type: "checkbox",
                      defaultValue: true,
                      admin: { width: "33%" },
                    },
                  ],
                },
              ],
            },
            {
              name: "portalTitle",
              type: "text",
              defaultValue: "Feedback",
              admin: {
                description:
                  "Shown next to your logo on the portal and in page titles.",
              },
            },
            {
              name: "feedbackIntro",
              type: "textarea",
              defaultValue: "Tell us what would make the product better.",
            },
            {
              name: "searchAllBoards",
              label: "Search across all boards",
              type: "checkbox",
              defaultValue: true,
              admin: {
                description:
                  "The portal search covers every board the visitor can see.",
              },
            },
          ],
        },
        {
          label: "Statuses",
          description:
            "Post statuses (Canny: Portal Statuses). Drag to reorder. Removing a status hides it; posts keep it until you move them.",
          fields: [
            {
              name: "statuses",
              type: "array",
              minRows: 2,
              labels: { singular: "Status", plural: "Statuses" },
              defaultValue: DEFAULT_STATUSES.map((s) => ({ ...s })),
              validate: (rows: unknown) => {
                const unique = uniqueKeys("statuses")(rows);
                if (unique !== true) return unique;
                const list = (rows ?? []) as {
                  isDefault?: boolean;
                  type?: StatusType;
                  showOnRoadmap?: boolean;
                }[];
                const defaults = list.filter((r) => r.isDefault);
                if (defaults.length !== 1) {
                  return "Mark exactly one status as the default for new posts.";
                }
                if (defaults[0]?.type !== "open") {
                  return "The default status must have the type Open.";
                }
                const columns = list.filter((r) => r.showOnRoadmap).length;
                if (columns < 1 || columns > 4) {
                  return "Show between 1 and 4 statuses on the roadmap.";
                }
                return true;
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "name",
                      type: "text",
                      required: true,
                      admin: { width: "25%" },
                    },
                    keyField("name"),
                    {
                      name: "type",
                      type: "select",
                      required: true,
                      defaultValue: "active",
                      options: STATUS_TYPES.map((t) => ({
                        label: {
                          open: "Open (initial)",
                          active: "Active",
                          complete: "Complete",
                          closed: "Closed",
                        }[t],
                        value: t,
                      })),
                      admin: { width: "25%" },
                    },
                    toneField("tone", "info"),
                  ],
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "showOnRoadmap",
                      label: "Roadmap column",
                      type: "checkbox",
                      defaultValue: false,
                      admin: { width: "33%" },
                    },
                    {
                      name: "isDefault",
                      label: "Default for new posts",
                      type: "checkbox",
                      defaultValue: false,
                      admin: { width: "33%" },
                    },
                    {
                      name: "notifyVotersByDefault",
                      label: "Notify voters by default",
                      type: "checkbox",
                      defaultValue: true,
                      admin: { width: "33%" },
                    },
                  ],
                },
              ],
            },
            {
              name: "staleAfterWeeks",
              type: "number",
              min: 1,
              max: 52,
              defaultValue: 4,
              admin: {
                description:
                  "Posts in an Active status longer than this show as stale in the staff Inbox.",
              },
            },
          ],
        },
        {
          label: "Ideas & Roadmap",
          description:
            "Ideas are the team's internal roadmap (/a/feedback → Ideas). Each stage moves the posts linked to an idea to a portal status — Canny's status mapping.",
          fields: [
            {
              name: "ideaStages",
              label: "Idea stages",
              type: "array",
              minRows: 2,
              labels: { singular: "Stage", plural: "Stages" },
              defaultValue: DEFAULT_IDEA_STAGES.map((s) => ({ ...s })),
              admin: {
                description:
                  "Drag to reorder. New ideas start in the first stage. Several stages may map to one status.",
              },
              validate: (rows: unknown, { data }: { data: unknown }) => {
                const unique = uniqueKeys("stages")(rows);
                if (unique !== true) return unique;
                const statusKeys = new Set(
                  ((data as { statuses?: StatusSetting[] }).statuses ?? []).map(
                    (st) => st.key ?? "",
                  ),
                );
                for (const row of (rows ?? []) as {
                  name?: string;
                  portalStatus?: string | null;
                }[]) {
                  if (row.portalStatus && !statusKeys.has(row.portalStatus)) {
                    return `Stage "${row.name ?? "?"}" maps to an unknown status "${row.portalStatus}". Use a status key from the Statuses tab.`;
                  }
                }
                return true;
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "name",
                      type: "text",
                      required: true,
                      admin: { width: "25%" },
                    },
                    keyField("name"),
                    {
                      name: "type",
                      type: "select",
                      required: true,
                      defaultValue: "active",
                      options: STATUS_TYPES.map((t) => ({
                        label: t.charAt(0).toUpperCase() + t.slice(1),
                        value: t,
                      })),
                      admin: { width: "25%" },
                    },
                    toneField("tone", "info"),
                  ],
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "portalStatus",
                      label: "Portal status",
                      type: "text",
                      admin: {
                        width: "50%",
                        description:
                          "Status key linked posts move to (e.g. planned). Empty = leave posts alone.",
                      },
                    },
                    {
                      name: "notifyVoters",
                      label: "Notify voters?",
                      type: "checkbox",
                      defaultValue: true,
                      admin: { width: "50%" },
                    },
                  ],
                },
              ],
            },
            {
              name: "scoreFactors",
              label: "Score factors",
              type: "array",
              labels: { singular: "Factor", plural: "Factors" },
              defaultValue: DEFAULT_SCORE_FACTORS.map((f) => ({ ...f })),
              validate: uniqueKeys("factors"),
              admin: {
                description:
                  "Score = Σ(weight × value) of impact factors ÷ Σ(weight × value) of effort factors. Weight 0 shows a factor without counting it.",
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "name",
                      type: "text",
                      required: true,
                      admin: { width: "25%" },
                    },
                    keyField("name"),
                    {
                      name: "kind",
                      type: "select",
                      required: true,
                      defaultValue: "impact",
                      options: [
                        { label: "Impact", value: "impact" },
                        { label: "Effort", value: "effort" },
                      ],
                      admin: { width: "25%" },
                    },
                    {
                      name: "weight",
                      type: "number",
                      required: true,
                      min: 0,
                      defaultValue: 1,
                      admin: { width: "25%" },
                    },
                  ],
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "source",
                      type: "select",
                      required: true,
                      defaultValue: "manual",
                      options: [
                        { label: "Set by staff", value: "manual" },
                        { label: "Number of voters", value: "votes" },
                        {
                          label:
                            "Vote priority (must 3 · important 2 · nice 1)",
                          value: "priority",
                        },
                        {
                          label: "Voters with these user tags",
                          value: "tagVoters",
                        },
                      ],
                      admin: { width: "50%" },
                    },
                    {
                      name: "scale",
                      type: "select",
                      required: true,
                      defaultValue: "0-10",
                      options: FACTOR_SCALES.map((sc) => ({
                        label: sc,
                        value: sc,
                      })),
                      admin: {
                        width: "50%",
                        condition: (_, sibling) => sibling.source === "manual",
                      },
                    },
                  ],
                },
                {
                  name: "tags",
                  label: "User tags",
                  type: "text",
                  hasMany: true,
                  admin: {
                    condition: (_, sibling) => sibling.source === "tagVoters",
                    description:
                      "e.g. your paid plan names (billing tags voters by plan).",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "etaPublicByDefault",
                  label: "Show ETAs publicly by default",
                  type: "checkbox",
                  defaultValue: false,
                },
                {
                  name: "votePriorities",
                  label: "Ask for a priority when voting on someone's behalf",
                  type: "checkbox",
                  defaultValue: true,
                },
              ],
            },
          ],
        },
        {
          label: "Changelog",
          description:
            "The public changelog at /changelog. Entries live in Feedback → Changelog.",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "changelogTitle",
                  label: "Title",
                  type: "text",
                  defaultValue: "Changelog",
                  admin: { width: "50%" },
                },
                {
                  name: "changelogSubtitle",
                  label: "Subtitle",
                  type: "text",
                  defaultValue: "Follow the latest improvements and updates.",
                  admin: { width: "50%" },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "changelogSubscriptions",
                  label: "Let people subscribe to updates (email)",
                  type: "checkbox",
                  defaultValue: true,
                  admin: { width: "50%" },
                },
                {
                  name: "changelogRss",
                  label: "Publish an RSS feed",
                  type: "checkbox",
                  defaultValue: true,
                  admin: { width: "50%" },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "changelogReactions",
                  label: "Show likes",
                  type: "checkbox",
                  defaultValue: true,
                  admin: { width: "50%" },
                },
                {
                  name: "changelogShare",
                  label: "Show share buttons",
                  type: "checkbox",
                  defaultValue: true,
                  admin: { width: "50%" },
                },
              ],
            },
            {
              name: "changelogShipStage",
              label: "On first publish, move linked ideas to stage",
              type: "text",
              defaultValue: "shipped",
              admin: {
                description:
                  "An idea stage key (Ideas & Roadmap tab). Its posts move to the mapped status; voters get one “shipped” notification. Empty = don't move ideas.",
              },
            },
          ],
        },
        {
          label: "Integrations",
          description:
            "Link ideas to issues in your project tracker and keep their status in sync both ways. GitHub works through the repository connected in /admin → Updates; Jira, Linear and Asana come as adapter modules with their own tabs.",
          fields: [
            {
              // Short names: generated table/enum names stay under Postgres's
              // 63-character limit (labels carry the readable names).
              name: "gh",
              label: "GitHub",
              type: "group",
              fields: [
                {
                  name: "enabled",
                  label: "Sync with GitHub issues",
                  type: "checkbox",
                  defaultValue: true,
                },
                {
                  name: "map",
                  label: "Status mapping",
                  type: "array",
                  labels: { singular: "Mapping", plural: "Mappings" },
                  admin: {
                    description:
                      "Each row maps an issue state to an idea stage key. Going either way, the first matching row wins; unmapped states and stages don't sync.",
                  },
                  defaultValue: [
                    { ext: "unstarted", stage: "planned", direction: "both" },
                    { ext: "started", stage: "in-progress", direction: "both" },
                    { ext: "completed", stage: "shipped", direction: "both" },
                    { ext: "canceled", stage: "wont-do", direction: "both" },
                  ],
                  fields: [
                    {
                      type: "row",
                      fields: [
                        {
                          name: "ext",
                          label: "GitHub issue",
                          type: "select",
                          required: true,
                          options: [
                            { label: "Open", value: "unstarted" },
                            {
                              label: "Open + in-progress label",
                              value: "started",
                            },
                            {
                              label: "Closed as completed",
                              value: "completed",
                            },
                            {
                              label: "Closed as not planned",
                              value: "canceled",
                            },
                          ],
                          admin: { width: "40%" },
                        },
                        {
                          name: "stage",
                          label: "Idea stage key",
                          type: "text",
                          required: true,
                          admin: { width: "30%" },
                        },
                        {
                          name: "direction",
                          type: "select",
                          required: true,
                          defaultValue: "both",
                          options: [
                            { label: "Both ways", value: "both" },
                            { label: "GitHub → idea", value: "inbound" },
                            { label: "Idea → GitHub", value: "outbound" },
                          ],
                          admin: { width: "30%" },
                        },
                      ],
                    },
                  ],
                },
                {
                  name: "inProgressLabels",
                  label: "In-progress labels",
                  type: "text",
                  hasMany: true,
                  defaultValue: ["in progress"],
                  admin: {
                    description:
                      "An open issue with one of these labels counts as started; moving an idea to a started stage adds the first one.",
                  },
                },
                {
                  name: "newIssueLabels",
                  label: "Labels for new issues",
                  type: "text",
                  hasMany: true,
                  defaultValue: ["feedback"],
                },
                {
                  name: "backlinkComment",
                  label: "Comment on the issue with a link back to the idea",
                  type: "checkbox",
                  defaultValue: true,
                },
              ],
            },
          ],
        },
        {
          label: "Tags",
          description:
            "Staff-only tags for sorting posts. Drag to reorder. Tags are shared by all boards.",
          fields: [
            {
              name: "tags",
              type: "array",
              labels: { singular: "Tag", plural: "Tags" },
              validate: uniqueKeys("tags"),
              defaultValue: [
                { key: "bug", name: "Bug", tone: "destructive" },
                { key: "feature", name: "Feature", tone: "info" },
              ],
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
                    toneField(),
                  ],
                },
              ],
            },
          ],
        },
        {
          label: "Moderation & Anonymous",
          description:
            "Global defaults; each board can override the anonymous rules.",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "anonVotes",
                  label: "Anonymous votes",
                  type: "checkbox",
                  defaultValue: true,
                  admin: {
                    width: "33%",
                    description:
                      "Visitors vote without signing up (protected by Turnstile).",
                  },
                },
                {
                  name: "anonPosts",
                  label: "Anonymous posts",
                  type: "checkbox",
                  defaultValue: false,
                  admin: { width: "33%" },
                },
                {
                  name: "anonComments",
                  label: "Anonymous comments",
                  type: "checkbox",
                  defaultValue: false,
                  admin: { width: "33%" },
                },
              ],
            },
            {
              name: "postsPerHour",
              type: "number",
              min: 1,
              max: 1000,
              defaultValue: 10,
              admin: { description: "Per person (or per IP when anonymous)." },
            },
            {
              name: "commentsPerHour",
              type: "number",
              min: 1,
              max: 1000,
              defaultValue: 30,
            },
          ],
        },
        {
          label: "Notifications",
          fields: [
            {
              name: "notifyStaffOnNewPost",
              label: "Tell staff about new posts",
              type: "checkbox",
              defaultValue: true,
            },
            {
              name: "notifyVotersOnStaffComment",
              label: "Tell voters when staff comment",
              type: "checkbox",
              defaultValue: true,
            },
            {
              name: "voteMilestones",
              type: "select",
              hasMany: true,
              defaultValue: ["10", "50", "100"],
              options: VOTE_MILESTONES.map((n) => ({
                label: `${n} votes`,
                value: String(n),
              })),
              admin: {
                description:
                  "Tell staff when a post reaches these vote counts.",
              },
            },
          ],
        },
      ],
    },
  ],
});

settings.global.hooks = {
  ...(settings.global.hooks ?? {}),
  afterChange: [
    ...(settings.global.hooks?.afterChange ?? []),
    syncSettingsAfterChange,
  ],
};

export interface PortalTabSetting {
  tab: "roadmap" | "feedback" | "changelog";
  label: string;
  enabled?: boolean | null;
}

export interface StatusSetting {
  key?: string | null;
  name: string;
  type: StatusType;
  tone?: Tone | null;
  showOnRoadmap?: boolean | null;
  isDefault?: boolean | null;
  notifyVotersByDefault?: boolean | null;
}

export interface TagSetting {
  key?: string | null;
  name: string;
  tone?: Tone | null;
}

export interface IdeaStageSetting {
  key?: string | null;
  name: string;
  type: StatusType;
  tone?: Tone | null;
  portalStatus?: string | null;
  notifyVoters?: boolean | null;
}

export interface FeedbackSettings extends Record<string, unknown> {
  ideaStages: IdeaStageSetting[];
  scoreFactors: ScoreFactor[];
  etaPublicByDefault?: boolean | null;
  changelogTitle?: string | null;
  changelogSubtitle?: string | null;
  changelogSubscriptions?: boolean | null;
  changelogRss?: boolean | null;
  changelogReactions?: boolean | null;
  changelogShare?: boolean | null;
  changelogShipStage?: string | null;
  gh?: {
    enabled?: boolean | null;
    map?:
      | {
          ext: "backlog" | "unstarted" | "started" | "completed" | "canceled";
          stage: string;
          direction: "both" | "inbound" | "outbound";
        }[]
      | null;
    inProgressLabels?: string[] | null;
    newIssueLabels?: string[] | null;
    backlinkComment?: boolean | null;
  } | null;
  votePriorities?: boolean | null;
  portalTabs: PortalTabSetting[];
  portalTitle?: string | null;
  feedbackIntro?: string | null;
  searchAllBoards?: boolean | null;
  statuses: StatusSetting[];
  staleAfterWeeks?: number | null;
  tags: TagSetting[];
  anonVotes?: boolean | null;
  anonPosts?: boolean | null;
  anonComments?: boolean | null;
  postsPerHour?: number | null;
  commentsPerHour?: number | null;
  notifyStaffOnNewPost?: boolean | null;
  notifyVotersOnStaffComment?: boolean | null;
  voteMilestones?: string[] | null;
}
