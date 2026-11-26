import type { ModSeedStep } from "@acme/mod-kit/payload";

import { createAdminClient } from "../server/admin-client";
import { syncAllConfig } from "../server/full-sync";

/**
 * Demo content so /feedback and /roadmap work out of the box: two public
 * boards, the default statuses/tags (from the settings defaults), and a few
 * posts. Idempotent and scalar-only, like every kit seed step.
 */
export const seed: ModSeedStep[] = [
  {
    label: "Feedback boards",
    run: async (payload) => {
      const existing = await payload.count({
        collection: "mod-feedback-boards",
        overrideAccess: true,
      });
      if (existing.totalDocs === 0) {
        for (const board of [
          {
            name: "Feature Requests",
            slug: "feature-requests",
            description: "Ideas and improvements you'd like to see.",
            access: "public" as const,
            categories: [
              { key: "app", name: "App" },
              { key: "integrations", name: "Integrations" },
            ],
          },
          {
            name: "Bug Reports",
            slug: "bug-reports",
            description: "Something not working? Tell us here.",
            access: "public" as const,
            titlePlaceholder: "What went wrong?",
            detailsPlaceholder: "Steps to reproduce, what you expected…",
          },
        ]) {
          await payload.create({
            collection: "mod-feedback-boards",
            data: board,
            overrideAccess: true,
            context: { skipFeedbackSync: true },
          });
        }
      }
      await syncAllConfig(payload);
    },
  },
  {
    label: "Feedback demo posts",
    run: async () => {
      const db = createAdminClient();
      const { count } = await db
        .from("mod_feedback_posts")
        .select("id", { count: "exact", head: true });
      if ((count ?? 0) > 0) return;
      const { data: boards } = await db
        .from("mod_feedback_boards")
        .select("id, slug")
        .eq("archived", false);
      const board = (slug: string) => boards?.find((b) => b.slug === slug)?.id;
      const features = board("feature-requests");
      const bugs = board("bug-reports");
      const rows = [
        features && {
          board_id: features,
          title: "Dark mode for the mobile app",
          details:
            "The web app follows my system theme; I'd love the same on iOS and Android.",
          status_id: "planned",
          source: "staff",
        },
        features && {
          board_id: features,
          title: "Export my data as CSV",
          details: "A one-click export of everything in my account.",
          status_id: "under-review",
          source: "staff",
        },
        features && {
          board_id: features,
          title: "Slack notifications",
          details: "Post updates to a Slack channel when something changes.",
          status_id: "in-progress",
          source: "staff",
        },
        bugs && {
          board_id: bugs,
          title: "Avatar upload fails for large images",
          details: "Uploading a 12 MB photo shows a spinner forever.",
          source: "staff",
        },
      ].filter(Boolean) as {
        board_id: string;
        title: string;
        details: string;
        status_id?: string;
        source: string;
      }[];
      if (rows.length) {
        // `slug` is set by the insert trigger; the placeholder satisfies NOT NULL.
        const { error } = await db
          .from("mod_feedback_posts")
          .insert(rows.map((r) => ({ ...r, slug: "pending" })));
        if (error) throw new Error(`[feedback] seed posts: ${error.message}`);
      }
    },
  },
];
