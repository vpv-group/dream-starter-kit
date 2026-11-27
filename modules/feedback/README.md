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
| `/a/feedback`                | Staff workspace: Inbox, Ideas (score table + record sheet), Roadmap (ideas kanban), Posts, Changelog, Insights  |
| `/embed/feedback…`           | The embeddable widget (iframe pages: feedback, post, roadmap, changelog)                                        |

## Install

Dream Feedback is a **paid add-on** for the Dream Starter Kit, included in
Meet Dream plans (see meetdream.com/pricing). With your plan on the site:

```bash
pnpm mod add dream:feedback
pnpm install && pnpm db:reset && pnpm db:gen-types
```

Or **Modules → Install module** in `/admin`. Requires kit ≥ 2.6.0 and the
pre-installed `notifications` module; the `chat` module is optional (feedback
from AI chat). Licensed under [LICENSE.commercial.md](LICENSE.commercial.md).

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

## Autopilot (AI triage)

Modules → Feedback → **Autopilot**. Everything runs from a cron
(`GET /cron/autopilot`, every 5 minutes, daily cap) or a staff action, and
only when `AI_GATEWAY_API_KEY` is set (models from `@acme/config`, output
token-capped; golden rules #5 and #6). Without AI the portal works as before
and API feedback still lands in the inbox for manual review.

- **New posts** are processed once: embedded (`DEFAULT_EMBEDDING_MODEL`,
  pgvector + HNSW), filed into a board category, and compared with older
  posts. A duplicate over the threshold becomes an inbox suggestion
  (**Manual review**), or, in **Automated** mode, a portal post is merged as
  votes into the original and logged in the inbox with **Undo** (unmerge).
- **Smart replies** (off by default) post one follow-up question on vague
  posts as the chosen staff user.
- **Similar feedback** for signed-in members adds meaning-based matches to
  the full-text + trigram ones every visitor gets; anonymous typing never
  calls the AI.
- **Discussion summary** (staff, post page) and **Draft with AI** (staff,
  Changelog tab) create a summary or a Payload draft to edit.
- **Sources.** Other feedback enters through `ingestFeedback()`
  (`@acme/mod-feedback/server`) into `mod_feedback_inbox`: the inbound API
  (`POST /api/mod/feedback/ingest` with `Authorization: Bearer fbk_…`; the
  key is shown once in the inbox and only its hash is stored) and **AI
  chat** (below). Autopilot titles each message, drops
  non-feedback and suggests a matching post; staff then **Create post**
  (on the API board, author matched by email), **Add to that post** (an
  internal note + the author's vote) or **Dismiss**. Nothing reaches the
  portal until staff accept it.

`mod_feedback_inbox` and `mod_feedback_api_keys` are staff-only under RLS;
keys are minted server-side only.

## Feedback from AI chat

Settings → **Chat** (off by default; needs the kit's `chat` module, which
feedback doesn't require). Every 15 minutes (`GET /cron/chat-scan`) the
scan reads users' new chat messages — web, mobile and the channel adapters
alike — keeps the ones that read like feedback (a phrase prefilter with an
editable list and a minimum length; anonymous accounts and unlinked channel
contacts are skipped) and sends them to the Autopilot inbox as
`source: "chat"`. The cursor lives in `mod_feedback_chat_scan_state`
(server-only); the first run starts at "now", so history isn't back-filled.
Without the chat module the route answers `{ skipped: "chat not installed" }`.
Turning it on shares chat snippets and the sender's email with staff, so
mention it in your privacy policy.

## Insights and the staff digest

`/a/feedback` → **Insights** shows the last 7/30/90/365 days, for all boards
or one: new posts, votes, voters and shipped posts against the previous
period, one bar chart per measure (with a table view), all posts by
status, top requests by votes gained, where posts came from, posts by
board, the median time to a first status update and changelog readers.
Everything comes from one SQL call, `mod_feedback_insights()`
(`006_insights.sql`; staff only).

The **staff digest** (Settings → Notifications → "Staff digest email";
weekly on Mondays by default, daily, or off) emails staff a summary of the
same numbers plus what needs attention (approvals, Autopilot suggestions,
stale posts) and links to the most-voted and new posts. A daily cron
(`GET /cron/digest`, 14:17 UTC) sends it only when something happened,
claims the period first so a retry never sends twice, and skips staff who
turned off "Email me the digest" in `/a/feedback`. It uses
`payload.sendEmail`, so it needs SMTP (Mailpit locally).

## Embeddable widget

Settings → **Widget**: turn it on and list the sites that may show it
(`https://…`, or `http://localhost` for testing). `/a/feedback` → **Embed**
gives the snippets:

```html
<div data-dream-feedback data-tab="feedback"></div>
<script
  src="https://your-app.example.com/api/mod/feedback/embed.js"
  async
></script>
```

- `data-tab`: `feedback`, `roadmap` or `changelog`; `data-board`: a board
  slug; `data-theme`: `light` or `dark`.
- `DreamFeedback.open({ tab })` opens a side panel;
  `<button data-dream-changelog-badge>` gets an unread dot and opens the
  changelog.
- The iframe pages live at `/embed/feedback…` (the kit's `area: "embed"`):
  no site chrome, and they report their height so the frame never scrolls.
  The proxy only lets the listed sites frame them (`frame-ancestors`, from
  `kit_embed_origins`, synced on save).
- Inside the frame, browsers block the main site's cookies, so the widget
  keeps its own session: people vote anonymously where the board allows it,
  or log in with an emailed code (existing accounts; "Sign up" opens the
  portal, which applies the sign-up rules). Anything done anonymously in
  the frame moves to the account on log-in (`POST /claim-anon`, which needs
  both sessions).

## MCP tools

With the kit's remote MCP server on (docs/MCP.md), staff can triage
feedback from Claude, ChatGPT or Cursor: `feedback_search_posts`,
`feedback_get_post`, `feedback_set_status`, `feedback_comment`,
`feedback_list_ideas`, `feedback_create_idea`, `feedback_set_idea_stage`,
`feedback_inbox`, `feedback_inbox_resolve`, `feedback_changelog_draft` and
`feedback_insights`. The changelog collection also appears in the generic
content tools. Each tool checks that the caller is feedback staff
(`profiles.is_staff`), then uses the same RPCs, cascades and notifications
as the workspace, attributed to the caller.

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
- Autopilot: `GET /cron/autopilot` (cron secret), `POST /ingest` (API key);
  staff `GET /staff/autopilot`, `POST /staff/autopilot/resolve`,
  `POST /staff/summary`, `POST /staff/changelog/draft`,
  `GET /staff/api-keys`, `POST /staff/api-keys/rotate`.
- Insights, digest and widget: staff `GET /staff/insights`,
  `GET|POST /staff/prefs`, `GET /staff/widget`; `GET /cron/digest` (cron
  secret); public `GET /embed.js` and `GET /embed/latest` (CORS-open);
  authed `POST /claim-anon`.

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
  and merge, internal notes, and the anonymous-data handlers;
  `autopilot.test.ts` runs the triage against the live database with a
  deterministic fake AI (dedupe, automated merge, ingest → accept/merge,
  summary caching, staff-only inbox and keys); `insights.test.ts`,
  `digest.test.ts` (one email per period, opt-outs) and `mcp.test.ts`
  (staff-only tools, attribution).
