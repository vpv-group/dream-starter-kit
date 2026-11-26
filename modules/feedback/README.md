# Feedback (`@acme/mod-feedback`)

A Canny-style feedback portal for the app's own users: boards where people
post and vote, a public roadmap and a changelog, behind three portal tabs
(**Roadmap · Feedback · Changelog**). Staff triage at `/a/feedback`;
configuration lives in `/admin` under **Feedback**.

| URL                          | What                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/feedback`                  | Redirects to the first board on the portal home                                                                 |
| `/feedback/<board>`          | Board: BOARDS sidebar, create card with "Similar feedback", Trending/Top/New + status filter, search, post list |
| `/feedback/<board>/create`   | Full-page create form (phones)                                                                                  |
| `/feedback/<board>/p/<post>` | Post: voters, status, activity feed (comments + status changes), staff controls                                 |
| `/feedback/search?search=`   | Search across every board the visitor can see                                                                   |
| `/roadmap`                   | Public roadmap: board cards, Filters, one column per roadmap status (posts, as in Canny)                        |
| `/a/feedback`                | Staff workspace: Inbox, Ideas (score table + record sheet), Roadmap (ideas kanban), Posts                       |

## Where the data lives

| Data                                                       | Store                                                              | Why                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Boards, statuses, tags, settings                           | **Payload** (`/admin` → Feedback → Boards, and Modules → Feedback) | Staff configure them in /admin. Each save is **copied** into read-only `mod_feedback_{boards,categories,statuses,tags}` rows (`src/server/config-sync.ts`) so RLS and joins can use them. Removed rows are archived, never deleted. An hourly cron and the staff **Resync** button repair the copy. |
| Posts, votes, comments, reactions, follows, status history | **Supabase** (`mod_feedback_*`, RLS on every table)                | Members write through their own RLS session. Server-controlled columns (status, counters, slug, approval) are forced by triggers.                                                                                                                                                                   |

Ids in the copy are stable keys: a board's Payload id, `<board>:<key>` for
categories, and the read-only `key` field for statuses and tags, so
renaming never orphans posts.

## Ideas and the roadmap

Ideas (`mod_feedback_ideas`, staff only) are the team's internal roadmap,
Canny's "Ideas". Many posts link to one idea, from a post's sidebar (pick an
idea, or **Create idea from this post**). Each idea **stage** (Settings →
Ideas & Roadmap) maps to a portal status with its own **Notify voters?**
flag. Moving an idea (Ideas table, record sheet or kanban drag) runs
`mod_feedback_set_idea_stage`, which moves every linked post's status and
records the history in **one transaction**, then voters are notified. A
linked post's status follows its idea; changing it directly is refused.
The public `/roadmap` shows posts in the statuses marked **Roadmap column**.

Score = Σ(weight × value) of impact factors ÷ Σ(weight × value) of effort
factors (Settings → Ideas & Roadmap → Score factors). Factors can be set by
staff, or come from votes, vote priority, or voters carrying given user tags
(e.g. paid plans).

## Changelog

Entries are Payload docs (**/admin → Feedback → Changelog**): rich text,
a type (New / Improved / Fixed), labels (Feedback → Changelog labels), an
optional hero image, drafts, **scheduled publishing** and versions. The
portal renders `/changelog` (date gutter, type + label badges, collapse,
likes, copy link, share) and `/changelog/<slug>`; the **RSS 2.0** feed is
`/api/mod/feedback/changelog/rss.xml` (published, everyone-audience
entries only, with autodiscovery links on the pages).

Link the ideas an entry announces from **Feedback admin → Ideas → idea →
Changelog**. On the entry's **first publish** (`announcedAt` unset), the
publish hook:

1. moves each linked idea to the stage in Settings → Changelog (default
   `shipped`), which moves their posts without a per-post notification;
2. tells each voter and follower of those posts **once** that it shipped,
   plus every changelog subscriber (`feedback.changelog.published`);
3. emails subscribers through Payload's mailer.

Signed-in people can subscribe on `/changelog`; the dashboard widget shows
What's new with an unread dot (`mod_feedback_changelog_reads`).

## Issue trackers (GitHub; Jira, Linear, Asana as adapters)

An idea links to at most one issue per tracker (idea sheet → **Issue
tracker**: search or `#number`, or **Create issue**, which writes the idea,
its posts and vote total into the issue and adds a back-link comment).
Status syncs **both ways** through Settings → Integrations → GitHub →
**Status mapping**: one row per issue state (Open · Open + in-progress label ·
Closed as completed · Closed as not planned) ↔ an idea stage key, with a
direction. The first matching row wins each way; unmapped states don't sync.

- **Outbound:** moving an idea writes `mod_feedback_sync_outbox` rows
  (trigger); the 2-minute cron (`GET /cron/integrations-sync`) or **Sync
  now** applies them. `setState` reads the issue first and only writes when
  it differs.
- **Inbound:** the same cron polls GitHub for issues updated since the last
  cursor and moves the idea's stage (which moves its posts and notifies
  voters), unless the idea is **locked**.
- **Loop guard:** a move that came from a provider never enqueues a sync back
  to it (`mod_feedback.origin`), and both directions are no-ops when nothing
  differs.

GitHub uses the repository connected with the Meet Dream AI GitHub App
(`ctx.host.github`). The module never sees the token, and the host only
allows issue and label endpoints. Without it, the panel shows **Connect
GitHub** and everything else works.

**Adapters.** A `feedback-adapter-<tool>` module (`requires: ["feedback"]`)
implements `IssueTrackerProvider` from `@acme/mod-feedback/integrations`,
exports `createIssueTrackerRoutes({ provider, base: "", loadSettings })` as
its `routes` / `publicRoutes`, and registers in a migration with
`select public.mod_feedback_register_provider('linear', 'Linear',
'/api/mod/feedback-adapter-linear', '{"search":true,"create":true}')`.
It schedules its `GET /cron/sync`, adds a settings tab with
`defineAdapterSettings({ target: "feedback" })`, and runs
`runProviderContractTests()` from `@acme/mod-feedback/integrations/testing`.

## Anonymous visitors

Each board decides whether anonymous visitors may **vote**, **post** and
**comment** (Boards → Posting & visibility), falling back to the global
defaults (Modules → Feedback → Moderation & Anonymous; votes on, posts and
comments off). An allowed action signs the visitor in anonymously
(Supabase anonymous auth behind Turnstile) and goes through the module's
**public routes**, which check the rule and then write with the service
role. Anonymous JWTs can never write the tables directly (a RESTRICTIVE
policy per command, golden rule #1). When the visitor later signs up or in,
`kit_register_anon_data` moves their votes, posts and comments to the
account. Otherwise the portal opens a "Sign up for …" prompt.

## Server routes (`/api/mod/feedback/…`)

- Public (members + anonymous): `GET /config`, `GET /similar`,
  `POST /vote`, `POST /posts`, `POST /comments`, `POST /reactions`,
  `POST /subscribe`, plus `GET /cron/config-sync` (cron secret).
- Staff (`routes`, authed; staff-checked again in SQL):
  `POST /staff/status` (message + notify voters), `POST /staff/update`
  (owner, category, tags, ETA, pin, approval, delete), `POST /staff/merge`,
  `POST /staff/unmerge`, `POST /staff/vote` (vote on behalf + priority),
  `POST /staff/comment`, `GET /staff/voters`, `GET /staff/people`,
  `GET /staff/posts`, `GET /staff/inbox`, `POST /staff/resync`.

## Notifications

Categories (registered in `001_initial.sql`): `feedback.post.status_changed`,
`feedback.post.comment` (followers and repliers), and the staff categories
`feedback.post.created`, `feedback.post.milestone` and
`feedback.post.assigned`. Voting, posting or commenting follows a post
automatically. Merges notify nobody, as in Canny.

## Tests

- `pnpm test`: mapping of the copied config, milestones, validators.
- `pnpm test:rls` (`tests/rls/`): board visibility, anonymous JWTs can't
  write, members vote only as themselves, forced columns, staff-only status
  and merge, internal notes, and the anonymous-data handlers.
