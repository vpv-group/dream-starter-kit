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
| `/a/feedback`                | Staff workspace: Inbox (approval, stale, newest) and Posts table                                                |

## Where the data lives

| Data                                                       | Store                                                              | Why                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Boards, statuses, tags, settings                           | **Payload** (`/admin` → Feedback → Boards, and Modules → Feedback) | Staff configure them in /admin. Each save is **copied** into read-only `mod_feedback_{boards,categories,statuses,tags}` rows (`src/server/config-sync.ts`) so RLS and joins can use them. Removed rows are archived, never deleted. An hourly cron and the staff **Resync** button repair the copy. |
| Posts, votes, comments, reactions, follows, status history | **Supabase** (`mod_feedback_*`, RLS on every table)                | Members write through their own RLS session. Server-controlled columns (status, counters, slug, approval) are forced by triggers.                                                                                                                                                                   |

Ids in the copy are stable keys: a board's Payload id, `<board>:<key>` for
categories, and the read-only `key` field for statuses and tags, so
renaming never orphans posts.

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
