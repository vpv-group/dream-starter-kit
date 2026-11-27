import { defineModule } from "@acme/mod-kit";

/**
 * Feedback — a Canny-style feedback portal: boards where people post and
 * vote, a public roadmap, and a changelog (Roadmap · Feedback · Changelog
 * tabs at /roadmap, /feedback, /changelog). Staff triage at /a/feedback;
 * configuration (boards, statuses, tags, anonymous rules…) lives in /admin
 * under "Feedback" and is copied into the module's tables for RLS.
 *
 * Anonymous visitors may vote/post/comment when a board allows it: those
 * writes go through `publicRoutes` (service role after the settings check);
 * anonymous JWTs can't write the tables directly (golden rule #1).
 */
export default defineModule({
  slug: "feedback",
  name: "Feedback",
  version: "1.0.0",
  kitCompat: ">=2.5.0 <3",
  description:
    "Feedback boards with voting, a public roadmap and a changelog (Canny-style).",
  requires: ["notifications"],
  nav: {
    web: [
      { title: "Feedback", href: "/feedback", icon: "IconBulb", order: 60 },
      {
        title: "Feedback admin",
        href: "/a/feedback",
        icon: "IconInbox",
        order: 61,
        audience: "staff",
      },
    ],
    native: [
      { title: "Feedback", href: "/a/feedback", icon: "IconBulb", order: 60 },
    ],
  },
  routes: {
    web: [
      { path: "", component: "FeedbackAdminPage" },
      {
        path: "",
        component: "RoadmapPage",
        area: "public",
        mount: "/roadmap",
        rsc: true,
      },
      {
        path: "",
        component: "ChangelogPage",
        area: "public",
        mount: "/changelog",
        rsc: true,
      },
      {
        path: "[slug]",
        component: "ChangelogEntryPage",
        area: "public",
        mount: "/changelog",
        rsc: true,
      },
      {
        path: "",
        component: "FeedbackIndexPage",
        area: "public",
        mount: "/feedback",
        rsc: true,
      },
      {
        path: "search",
        component: "FeedbackSearchPage",
        area: "public",
        mount: "/feedback",
        rsc: true,
      },
      {
        path: "[board]",
        component: "FeedbackBoardPage",
        area: "public",
        mount: "/feedback",
        rsc: true,
      },
      {
        path: "[board]/create",
        component: "FeedbackCreatePage",
        area: "public",
        mount: "/feedback",
        rsc: true,
      },
      {
        path: "[board]/p/[post]",
        component: "FeedbackPostPage",
        area: "public",
        mount: "/feedback",
        rsc: true,
      },
    ],
    native: [{ path: "", component: "FeedbackScreen" }],
  },
  widgets: { web: "FeedbackWidget", native: "FeedbackWidget" },
  server: { routes: true, publicRoutes: true },
  database: {
    tables: [
      "mod_feedback_boards",
      "mod_feedback_categories",
      "mod_feedback_statuses",
      "mod_feedback_tags",
      "mod_feedback_posts",
      "mod_feedback_post_tags",
      "mod_feedback_votes",
      "mod_feedback_comments",
      "mod_feedback_subscriptions",
      "mod_feedback_status_changes",
      "mod_feedback_reactions",
      "mod_feedback_activity",
      "mod_feedback_idea_stages",
      "mod_feedback_ideas",
      "mod_feedback_changelog_subscribers",
      "mod_feedback_changelog_reads",
      "mod_feedback_changelog_reactions",
      "mod_feedback_integrations",
      "mod_feedback_issue_links",
      "mod_feedback_sync_outbox",
      "mod_feedback_inbox",
      "mod_feedback_api_keys",
      "mod_feedback_staff_prefs",
      "mod_feedback_digest_runs",
    ],
    dml: [
      "mod_notifications",
      "mod_notifications_push_tokens",
      "tags",
      "user_tags",
    ],
  },
  cms: {
    collections: [
      "mod-feedback-boards",
      "mod-feedback-changelog",
      "mod-feedback-changelog-labels",
    ],
    hasSettings: true,
    hasMigrations: true,
    hasSeed: true,
  },
});
