# CRM Extension — Plan

Status: **proposal** (nothing built yet). Companion to `docs/EXTENSIONS.md`
(the framework) and `docs/EXTENSIONS-PLAN.md` (its design rationale).

Goal: ship `extensions/crm` — a basic, Attio-shaped CRM (people, companies,
deals, pipelines, notes, tasks, activity timeline, custom attributes, saved
views, CSV import, API) as a first-party extension that runs on web + Expo,
scoped per workspace under RLS, with no new host coupling.

Research date: 2026-10-17. Attio facts come from attio.com help/docs/changelog
(via search extracts — the site itself was not reachable from the research
sandbox) cross-checked against 2026 third-party reviews; open-source facts come
from each repo's README, `package.json`, LICENSE and migrations.

---

## 1. What Attio is (reference model)

Attio's model is small and worth copying almost literally.

| Concept            | Attio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Notes                                                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Objects**        | Tables of entities. Standard: **People**, **Companies**, **Deals**, plus Users/Workspaces (product-usage, off by default). **Custom objects** on Pro+ (caps: Free 3 · Plus 5 · Pro 12).                                                                                                                                                                                                                                                                                                                                                                                                       | Each record belongs to exactly one object.                                                                                                                             |
| **Attributes**     | 17 API types: `text`, `number`, `checkbox`, `currency`, `date`, `timestamp`, `rating` (1–5), `select` (single/multi), `status` (pipeline-optimized select; options carry `target_time_in_status`, `celebration_enabled`, `is_archived`), `record-reference` (1 or many records of another object), `actor-reference` (workspace member), `location`, `domain`, `email-address`, `phone-number` (E.164), `personal-name`, `interaction` (system-written, read-only). UI extras: **Relationship** (two-way), **Formula**, **AI autofill**. Flags: `is_required`, `is_unique`, `is_multiselect`. | Attribute definitions are per-workspace, member-managed.                                                                                                               |
| **Lists**          | Process layers over objects (a pipeline, a hiring funnel). Each row is an **entry** → one parent record; lists carry their own **list attributes**. "Entities → objects, processes → lists."                                                                                                                                                                                                                                                                                                                                                                                                  | A deal pipeline in Attio can be either a Deals object status or a List over People/Companies.                                                                          |
| **Views**          | Table + Kanban per object/list; nested and/or filters (incl. `was` historical operator); multi-sort; group-by; filter/sort changes are per-user until "saved for everyone".                                                                                                                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                        |
| **Record page**    | Configurable highlights (Connection strength, Last interaction…), tabs: Activity timeline (events, notes, attribute changes, list changes, tasks), Notes, Tasks, Emails, Files, Comments (@mentions, also on rows/cards).                                                                                                                                                                                                                                                                                                                                                                     |                                                                                                                                                                        |
| **Deals**          | `stage` (status: Lead / In Progress / Won / Lost, configurable), `owner` (actor), `value` (currency), `associated_people`, `associated_company`. Won/Lost are plain statuses — no built-in loss-reason. Forecasting = reports, not a feature.                                                                                                                                                                                                                                                                                                                                                 |                                                                                                                                                                        |
| **Email/calendar** | Gmail/M365 sync on all plans; auto-creates People/Companies; email bodies private by default; "communication intelligence" (first/last interaction, connection strength).                                                                                                                                                                                                                                                                                                                                                                                                                     | Big, OAuth-heavy.                                                                                                                                                      |
| **Workflows**      | Trigger (record/entry/note/form/schedule/webhook/call-ended) → logic (if/switch/loop/delay/JS) → actions (CRUD, email, Slack, HTTP, sequence enroll) + AI agent blocks. Rebuilt June 2026. **Sequences** (multi-step email) on Pro+.                                                                                                                                                                                                                                                                                                                                                          | Credit-metered.                                                                                                                                                        |
| **Integrations**   | REST `api.attio.com/v2` (objects / records `/query` / attributes / lists / entries / notes / tasks / comments / webhooks); HMAC-signed webhooks (record._, list-entry._, note._, task._, comment.\*); MCP server (Feb 2026); Chrome extension; CSV import (100k rows, upsert by unique attribute); Slack, Zapier, Make, Typeform.                                                                                                                                                                                                                                                             |                                                                                                                                                                        |
| **Permissions**    | Roles: **Admin** / **Member** (no guest). Object + List access levels (Full / Read & write / Read only / No access) at workspace → team → member granularity (Pro+). Teams Pro+, SSO/SCIM Enterprise.                                                                                                                                                                                                                                                                                                                                                                                         |                                                                                                                                                                        |
| **Reports**        | Dashboards with Insight / Funnel / Historical values / Time in stage / Stage changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |                                                                                                                                                                        |
| **AI (2026)**      | Ask Attio (search, summarize, draft, apply writes after approval), AI attributes (research / classify / summarize autofill), research agents in workflows, Call Intelligence (recorder + transcript + MEDDPICC-style templates).                                                                                                                                                                                                                                                                                                                                                              |                                                                                                                                                                        |
| **Enrichment**     | From domain/email: name, description, logo, category, socials, location (Free); employee count, ARR (Plus); funding (Pro).                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Third-party data — not something we can ship without a provider.                                                                                                       |
| **Pricing**        | Free ≤3 seats / Plus $35 / Pro $79 / Enterprise. Custom objects, relationship + formula attributes, Sequences, Call Intelligence, granular perms all Pro+.                                                                                                                                                                                                                                                                                                                                                                                                                                    | Tells us what "basic" means: **Free/Plus tier functionality** = objects, attributes, lists, views, records, notes/tasks/comments, Insight reports, CSV, API, webhooks. |

**"Basic CRM" for this plan = Attio's Free/Plus feature set**, minus email sync
and enrichment (which need third-party OAuth/data providers), plus the kit's
own strengths (mobile, Payload admin settings, AI via the gateway, MCP).

---

## 2. Vendor an open-source CRM, or build?

### Candidates

| Project                                                        | License                                          | Stack                                                                                                                     | Verdict                                                                                                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Twenty** (twentyhq/twenty, ~58k★, very active)               | **AGPL-3.0** core (`twenty-ui`/`twenty-sdk` MIT) | NestJS + React SPA (Apollo, Linaria), patched TypeORM, **one Postgres schema per workspace**, Redis/BullMQ, own auth      | **No.** The best Attio clone, but AGPL fails `pnpm license:check` and would contaminate a closed SaaS; total coupling to its own server/ORM/auth. Concepts only.                               |
| **Atomic CRM** (marmelab, MIT, active)                         | MIT                                              | **Vite SPA** on react-admin `ra-core` + shadcn-admin-kit, **Supabase** (28 SQL migrations, edge functions), Supabase Auth | **Best partial fit.** Schema + domain logic reusable; UI is react-admin/react-router, not Next; **RLS policies are `USING (true)`** (single team per install) — violates golden rule #1 as-is. |
| **NextCRM** (pdovhomilja, MIT, v0.35 Oct 2026)                 | MIT                                              | Next.js 16 App Router, shadcn, **Prisma 7** (~90 models), **Better Auth**, SWR, Inngest, MCP server                       | Closest stack, but no tenancy, no RLS, Prisma + its own auth tables, monolith pages. Schema + shadcn screens are the reusable part.                                                            |
| **wacrm** (ArnasDon, MIT)                                      | MIT                                              | Next 16 + shadcn + Supabase, 53 SQL migrations, per-user RLS                                                              | WhatsApp-centric app; cleanest small Supabase CRM schema (`pipelines → stages → deals`, `custom_fields + values`, `tags`). Schema donor.                                                       |
| **DeskcommCRM** (melgarafael, MIT)                             | MIT                                              | Next 16 + Supabase, org multi-tenant RLS (`user_organizations` + `fn_user_org_ids()`), CI isolation test                  | Portuguese, WhatsApp/AI-agent heavy; RLS pattern donor only.                                                                                                                                   |
| erxes, EspoCRM, SuiteCRM, Frappe CRM, Monica, Macro, Relaticle | AGPL-3.0                                         | Node/Mongo, PHP, Python, Rust                                                                                             | Excluded: strong copyleft and/or foreign stacks.                                                                                                                                               |
| Krayin (MIT), Odoo (LGPL)                                      | —                                                | PHP / Python                                                                                                              | Excluded: no TS code to reuse.                                                                                                                                                                 |
| open-mercato (MIT core)                                        | MIT                                              | Competing Next.js framework with own ORM/auth/DI                                                                          | Excluded.                                                                                                                                                                                      |

No open-source project combines Next.js + Supabase RLS + Payload, and none
ships an Expo app.

### Decision: **build the extension on the kit's primitives; transplant schema and UI patterns from the MIT projects.**

Why vendoring loses:

- **Every candidate owns its auth, data layer and router.** The two nearest
  (Atomic CRM, NextCRM) still need their tenancy/RLS model and data access
  rewritten (ra-core/react-router or Prisma/Better Auth → supabase-js +
  react-query + Supabase Auth), which is most of the work — and leaves us
  maintaining a fork that can never take upstream updates cleanly.
- **The extension contract is strict** (client barrel / `./web` / `./native` /
  `./server` split, `ext_crm_*` naming, dispatcher-served API, CMS-driven nav,
  `pnpm ext sync` drift test). No external codebase fits it; adapting one costs
  more than writing to it.
- **License gate.** The only Attio-class codebase (Twenty) is AGPL.

What we take anyway (MIT — copy with attribution in a `VENDOR.md`, the
precedent is `extensions/chat/VENDOR.md`):

- **Schema**: wacrm's `pipelines / pipeline_stages / deals` + `custom_fields /
custom_values` + `tags`; Atomic CRM's `*_notes` with jsonb attachments,
  `archived_at`, `security_invoker` summary views, `activity_log` view,
  `merge_contacts` RPC; NextCRM's lookup tables and polymorphic activity links.
- **RLS**: DeskcommCRM's member-scoped policies + CI isolation test (maps onto
  the kit's `is_org_member()` helpers and `pnpm test:rls`); wacrm's
  parent-join `EXISTS` policies for child tables.
- **UI**: Atomic CRM's kanban pipeline, record show pages with notes timeline,
  tag chips, CSV import dialog, global search (after replacing `ra-core` hooks
  with react-query); NextCRM's TanStack data tables and record detail tabs.
- **Concepts only (AGPL, no code)**: Twenty's metadata model
  (object/field/view/filter tables, per-object permissions) as the blueprint if
  custom objects ever need a full engine.

---

## 3. Design

### 3.1 Tenancy: workspace = core `organizations`

Attio is workspace-scoped and multi-member; a CRM that can't be shared with a
teammate isn't a CRM. The kit already ships `organizations` / `memberships`
(`owner | admin | member`) / `invitations` with `is_org_member()` /
`is_org_admin()` SECURITY DEFINER helpers — but **no app code uses them yet**.
The CRM is the first consumer.

- Every `ext_crm_*` row carries `org_id uuid not null references organizations`.
  Policies: members read/write; admins manage attributes, pipelines, views
  "saved for everyone", and members. This is the ERD's sanctioned "reachable
  via `memberships`" ownership.
- Attio roles map 1:1: Attio **Admin** = `owner | admin`; Attio **Member** =
  `member`. Object/list-level access levels are Pro-tier in Attio → **phase 3**.
- **Workspace bootstrap** lives in the extension: `useCrmWorkspace()` (client
  barrel) finds the user's memberships; if none, creates an organization
  (owner-insert policy + the `handle_new_organization` trigger enrolls the
  owner). A workspace switcher sits in the CRM pages' header; the active org id
  is persisted client-side (localStorage / AsyncStorage).
- **Members screen** (`/a/crm/settings/members`): list members, change roles
  (admin-update policy), invite by email → `invitations` row.
  **Host prerequisite (one core migration, see §6):** accepting an invite must
  insert a `memberships` row for the invitee, which the admins-only insert
  policy forbids. Add `public.accept_invitation(invitation_id)` as a
  SECURITY DEFINER RPC in a new core migration (not extension SQL — extension
  migrations may only DDL their own tables). Until then, the server route can
  use the service-role client (billing's `server/admin-client.ts` precedent,
  golden rule #2 territory).

### 3.2 Data model: concrete standard objects + per-workspace custom attributes

Two ways to get Attio's "objects + attributes": a full metadata/EAV engine
(Twenty) or fixed tables with a typed custom-field layer (wacrm, Atomic CRM).
The kit's conventions (generated Supabase types, zod validators, FK-based
RLS, PostgREST filtering) strongly favor **concrete tables**. So:

- **Standard objects are real tables** with Attio's default attributes as
  first-class columns, plus `custom jsonb not null default '{}'` for
  workspace-defined attributes.
- **Custom attributes are rows** in `ext_crm_attributes` (per org, per object,
  Attio's type list), validated server-side (zod from the definition) and
  indexed with a GIN index on `custom`.
- **Custom objects** (Attio Pro) → **phase 3**, as one generic
  `ext_crm_custom_records (object_id, org_id, values jsonb)` table using the
  same attribute definitions. Not needed for "basic".

Tables (all `public`, all RLS, all `org_id`-scoped; `created_by` where useful):

| Table                                             | Purpose / key columns                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ext_crm_people`                                  | `first_name`, `last_name`, `emails text[]`, `phones text[]`, `job_title`, `company_id → ext_crm_companies`, `linkedin_url`, `location jsonb`, `avatar_url`, `description`, `owner_id → profiles`, `custom jsonb`, `archived_at`, timestamps. Unique `(org_id, lower(primary email))` partial index.                                                                                                                                                                        |
| `ext_crm_companies`                               | `name`, `domains text[]`, `description`, `logo_url`, `categories text[]`, `location jsonb`, `linkedin_url`, `employee_count`, `owner_id`, `custom jsonb`, `archived_at`. Unique `(org_id, primary domain)`.                                                                                                                                                                                                                                                                |
| `ext_crm_pipelines`                               | Named pipelines (default "Sales"). Attio has one Deals stage attribute; multiple pipelines is a cheap generalization that lists later reuse.                                                                                                                                                                                                                                                                                                                               |
| `ext_crm_pipeline_stages`                         | `pipeline_id`, `name`, `position`, `color`, `kind check in ('open','won','lost')`, `target_days` (Attio `target_time_in_status`), `archived_at`.                                                                                                                                                                                                                                                                                                                           |
| `ext_crm_deals`                                   | `name`, `pipeline_id`, `stage_id`, `value numeric(14,2)`, `currency char(3)`, `company_id`, `owner_id`, `expected_close_date`, `closed_at`, `custom jsonb`, `archived_at`.                                                                                                                                                                                                                                                                                                 |
| `ext_crm_deal_people`                             | M:N deal ↔ person (Attio `associated_people`).                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `ext_crm_deal_stage_events`                       | `(deal_id, from_stage_id, to_stage_id, actor_id, at)` — written by a trigger; powers time-in-stage + stage-changed reports and the timeline.                                                                                                                                                                                                                                                                                                                               |
| `ext_crm_attributes`                              | `object text check in ('person','company','deal','list_entry')`, `list_id` (for list attributes), `slug`, `title`, `type` (Attio's set: text, number, checkbox, currency, date, timestamp, rating, select, status, record_reference, actor_reference, location, domain, email, phone, url), `is_required`, `is_unique`, `is_multiselect`, `config jsonb` (options, currency code, referenced object), `position`, `archived_at`. Unique `(org_id, object, list_id, slug)`. |
| `ext_crm_tags` / `ext_crm_record_tags`            | Workspace tags; polymorphic `(record_type, record_id)` link.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `ext_crm_notes`                                   | `(record_type, record_id)`, `title`, `body jsonb` (rich text, same editor as chat's text artifact) + `body_text` for search, `attachments jsonb` (Storage paths), `author_id`.                                                                                                                                                                                                                                                                                             |
| `ext_crm_tasks`                                   | `title`, `due_at`, `completed_at`, `assignee_id`, `(record_type, record_id)` links (M:N via `ext_crm_task_links`).                                                                                                                                                                                                                                                                                                                                                         |
| `ext_crm_comments`                                | Threaded comments on records/notes/entries; `mentions uuid[]`.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ext_crm_activities`                              | The **timeline**: `(org_id, record_type, record_id, kind, actor_id, data jsonb, at)`. Written by triggers on the tables above (created / attribute changed with old→new diff / stage changed / note added / task done / list entry added / tag added). Append-only; members read, nobody updates.                                                                                                                                                                          |
| `ext_crm_lists` / `ext_crm_list_entries`          | Attio Lists: `object`, `name`, `icon`; entries `(list_id, record_type, record_id, position, custom jsonb)`, unique per parent record.                                                                                                                                                                                                                                                                                                                                      |
| `ext_crm_views`                                   | `object`/`list_id`, `name`, `type check in ('table','kanban')`, `filters jsonb` (nested and/or tree), `sorts jsonb`, `group_by`, `columns jsonb`, `is_shared` (admins can set), `created_by`. Personal views visible to creator only.                                                                                                                                                                                                                                      |
| `ext_crm_webhooks` + `ext_crm_webhook_deliveries` | Phase 2: `url`, `secret` (hashed display, raw encrypted via `EXT_CRM_WEBHOOK_KEY`), `events text[]`, `filter jsonb`; delivery log with retries.                                                                                                                                                                                                                                                                                                                            |
| `ext_crm_imports`                                 | Phase 1: CSV import jobs (`object`, `mapping jsonb`, `status`, counts, error rows).                                                                                                                                                                                                                                                                                                                                                                                        |

RLS shape (every table):

```sql
alter table public.ext_crm_people enable row level security;
create policy "ext_crm_people: members" on public.ext_crm_people
  for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));
-- admin-only tables (attributes, pipelines, shared views, webhooks):
--   select → is_org_member(org_id); insert/update/delete → is_org_admin(org_id)
-- personal views: using (is_shared or created_by = (select auth.uid()))
```

A RESTRICTIVE `no anon` policy (as on chat tables) is AND-ed onto every CRM
table — anonymous sessions never touch CRM data. The `pnpm test:rls` suite
gets a `crm` case: two orgs, cross-org read/write denied, member vs admin.

Search: a `tsvector` generated column on people/companies/deals/notes
(`name + emails + domains + body_text`) with a GIN index; `/a/crm` ⌘K
searches across objects (Atomic CRM's global-search pattern).

### 3.3 Extension layout (`extensions/crm`)

```
extensions/crm/
  extension.config.ts      slug "crm", requires ["notifications"], server.routes,
                           cms.hasSettings, database.tables [ext_crm_*],
                           database.dml ["ext_notifications","ext_notifications_push_tokens"]
  src/
    index.ts               barrel: validators (zod/v4 per object + attribute-typed
                           custom values), hooks (usePeople, useCompanies, useDeals,
                           useRecord, useAttributes, useViews, useTimeline, useTasks,
                           useNotes, useLists, useCrmWorkspace), filter→PostgREST
                           query builder, currency/format utils
    web/                   client pages + components (see §3.4)
    web-server/            (none in v1; maybe reports RSC later)
    native/                Expo screens (see §3.5)
    server/                import "server-only"; routes table (see §3.6)
    payload/settings.ts    defineExtensionSettings: default currency, default
                           pipeline stages, enrichment provider toggle, AI toggles
  supabase/
    migrations/001_initial.sql … (local sequence; triggers for activities +
                           stage events + updated_at; search tsvector)
    drop.sql
  tests/                   validators, filter builder, CSV mapper, attribute
                           coercion, pipeline math (weighted value)
  VENDOR.md                attribution for MIT code transplanted (Atomic CRM, wacrm)
```

Manifest nav/routes (web `/a/crm/…`, native the same):

| Route                                                                                                   | Web component                                | Native                                                          |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| `` (index)                                                                                              | `CrmHomePage` → redirects to `/a/crm/people` | `CrmHomeScreen` (segmented: People · Companies · Deals · Tasks) |
| `people`, `companies`, `deals`                                                                          | `ObjectPage` (table/kanban views)            | `ObjectListScreen`                                              |
| `people/[id]`, `companies/[id]`, `deals/[id]`                                                           | `RecordPage`                                 | `RecordScreen`                                                  |
| `lists`, `lists/[listId]`                                                                               | `ListsPage`, `ListPage`                      | phase 2                                                         |
| `tasks`                                                                                                 | `TasksPage` (my tasks / all)                 | `TasksScreen`                                                   |
| `settings/attributes`, `settings/pipelines`, `settings/members`, `settings/import`, `settings/webhooks` | `CrmSettingsPage`                            | —                                                               |
| `reports`                                                                                               | `ReportsPage` (phase 2)                      | —                                                               |

Widget: `CrmWidget` (web + native) — pipeline value by stage, deals closing
this week, my open tasks.

### 3.4 Web UI (shadcn, `@acme/ui` + app-local shadcn components)

- **Object page**: view switcher (table ⇄ kanban), saved views dropdown
  (personal / shared), filter builder (nested and/or; operators per attribute
  type: is / is not / contains / is empty / before / after / between / in),
  sort chips, group-by, column picker, bulk actions (tag, assign owner, move
  stage, archive, export CSV), "New" dialog, ⌘K global search.
  Table = **TanStack Table** (add `@tanstack/react-table` to the catalog) with
  virtualized rows (`@tanstack/react-virtual`) and PostgREST range pagination.
  Kanban = **dnd-kit** columns per stage/status, cards show value/owner/company,
  drag = stage change (optimistic, writes `ext_crm_deal_stage_events` via trigger).
- **Record page** (Attio layout): left header (name, avatar/logo, highlights:
  owner, stage, value, last activity), tabs **Activity · Notes · Tasks ·
  Comments · Files**; right sidebar = attribute panel (core + custom, inline
  edit per attribute type, Attio-style cell editors) and related records
  (company's people, person's deals, lists the record is in).
  Rich-text notes reuse the ProseMirror editor already vendored in
  `extensions/chat/src/vendor/lib/editor` (lift it into a shared piece rather
  than importing chat; chat is not a `requires` dependency).
- **Settings**: attributes CRUD (type picker, options editor for select/status),
  pipelines + stages (drag reorder, won/lost kinds, colors), members + invites,
  CSV import wizard (upload → map columns → dedupe key → preview → run),
  webhooks (phase 2).
- Theme: inherits the shadcn tokens (`tooling/tailwind/theme.css`) — no new
  tokens. Stage colors come from a fixed palette keyed by name.

### 3.5 Native (Expo, `react-native-reusables`)

Phase 1 ships read + light write: object lists with search and a stage
segmented control for deals (no kanban), record screen with attribute panel,
timeline, add note, add/complete task, change stage, call/email/open-LinkedIn
actions, my-tasks screen, the dashboard widget, push notifications for
@mentions and task assignment via `notify()`. Attribute/pipeline/member
settings stay web-only (Attio's mobile app is similarly read-first).

### 3.6 Server routes (`/api/ext/crm/…`, dispatcher-authed + rate-limited)

The client reads/writes most data directly through supabase-js under RLS
(the kit pattern). Server routes exist where RLS alone is not enough:

| Route                                                   | Why server-side                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /records/:object` · `PATCH /records/:object/:id`  | Validate `custom` against `ext_crm_attributes` definitions (required / unique / type coercion) before write. Direct supabase-js writes stay allowed for core columns; custom values go through here.                                                                                                                                                      |
| `POST /records/:object/query`                           | Attio-style JSON filter → PostgREST translation server-side for complex nested filters and `custom->>` JSONB paths (also used by views).                                                                                                                                                                                                                  |
| `POST /import` · `GET /import/:id`                      | CSV parse (papaparse), mapping, batched upserts by unique attribute, error rows. Runs in chunks under Vercel limits; `ext_crm_imports` tracks state.                                                                                                                                                                                                      |
| `GET /export/:object.csv`                               | Streamed CSV of the current view.                                                                                                                                                                                                                                                                                                                         |
| `POST /records/:object/merge`                           | Merge duplicates (Atomic CRM `merge_contacts` pattern) — repoints notes/tasks/deals/entries in one transaction via an RPC.                                                                                                                                                                                                                                |
| `POST /workspace/invite` · `POST /workspace/accept`     | Invitation email (Supabase invite via `lib/supabase/admin.ts` pattern) and acceptance (§3.1).                                                                                                                                                                                                                                                             |
| `POST /ai/summarize` · `POST /ai/draft-email` (phase 3) | `DEFAULT_AI_MODEL` via the gateway; authed, rate-limited, token-capped (golden rule #6); rejects anon.                                                                                                                                                                                                                                                    |
| `POST /webhooks/dispatch` (phase 2)                     | `CRON_SECRET`-guarded worker draining `ext_crm_webhook_deliveries` (HMAC-SHA256 signature header, retries with backoff). Same shape as the notifications dispatch cron.                                                                                                                                                                                   |
| `GET /api` surface for third parties (phase 2)          | Attio-compatible-ish REST (`/objects`, `/objects/:o/records/query`, `/attributes`, `/lists/:l/entries`, `/notes`, `/tasks`) behind **per-workspace API keys** (`ext_crm_api_keys`, hashed) — the dispatcher authenticates sessions; an API-key path needs a small dispatcher hook or a `publicRoutes` entry that verifies the key itself. Decision in §6. |

Notifications: `notify()` from `@acme/ext-notifications/server` on task
assignment, @mention, deal won (celebration), and stage target-time overdue
(a scheduled check — reuse the reminders pattern or the dispatch cron).

### 3.7 Payload (CMS) footprint — deliberately small

CRM data is member-managed, per-workspace, security-relevant → Supabase + RLS,
not Payload (golden rule #1, and the CMS bridge is staff-only today). Payload
holds only the **extension settings screen** (`ext-crm-settings`): default
currency, default pipeline template, enrichment provider on/off, AI features
on/off, webhook retry policy. No collections, no Payload migrations in v1.

### 3.8 MCP

`@acme/mcp` runs tools through the Payload Local API only, so CRM tables are
invisible to it today. Phase 3 adds CRM tools (`crm_search`, `crm_read_record`,
`crm_create_record`, `crm_update_record`, `crm_create_task`, `crm_add_note`)
that run as the OAuth'd user through their RLS session — the first
Supabase-backed MCP tools in the kit (a small `packages/mcp` extension point;
tracked in §6).

### 3.9 AI (phase 3, all behind the settings toggle)

- **Ask CRM** in the record page: summarize timeline, "what's the next step",
  draft follow-up email (copy to clipboard / mailto — no sending in v1).
- **AI attributes**: "autofill from the web" for a company description/category
  via a web-search tool call — only if a search provider is configured; else
  classify/summarize from existing record data.
- Reuses `DEFAULT_AI_MODEL`, `AI_MAX_OUTPUT_TOKENS`, and the chat extension's
  gateway checks. Never exposed to anon sessions.

---

## 4. Attio feature → plan mapping

| Attio feature                                                                | Phase                                    | Notes                                                                                                                                                      |
| ---------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| People, Companies, Deals objects                                             | **1**                                    | Concrete tables.                                                                                                                                           |
| Custom attributes (all Free-tier types)                                      | **1**                                    | `ext_crm_attributes` + `custom jsonb`; `interaction`/`personal-name` not needed; `record_reference` (single/many) phase 2.                                 |
| Status attributes / pipelines with won/lost + target time                    | **1**                                    | Pipelines + stages tables; target-time overdue notification phase 2.                                                                                       |
| Table views, filter/sort/group, column picker                                | **1**                                    |                                                                                                                                                            |
| Kanban views                                                                 | **1** (deals) · 2 (any status attribute) |                                                                                                                                                            |
| Saved views, personal vs shared                                              | **1** basic · **2** full                 | v1: per-user saved views + admin "share".                                                                                                                  |
| Record page: attributes, related, timeline                                   | **1**                                    |                                                                                                                                                            |
| Notes (rich text), Tasks, @mention comments                                  | **1** notes+tasks · **2** comments       |                                                                                                                                                            |
| Attribute change history on timeline                                         | **1**                                    | Trigger-written diffs. `was` filter operator → phase 3.                                                                                                    |
| Tags                                                                         | **1**                                    |                                                                                                                                                            |
| CSV import / export (upsert by unique attr)                                  | **1**                                    |                                                                                                                                                            |
| Global search                                                                | **1**                                    | tsvector.                                                                                                                                                  |
| Dashboard widget / Insight reports                                           | **1** widget · **2** reports page        | Reports = Insight + Funnel + Time-in-stage from `ext_crm_deal_stage_events`.                                                                               |
| Lists + list attributes + entries                                            | **2**                                    |                                                                                                                                                            |
| Relationship (two-way) attributes                                            | **2**                                    | Implemented as `record_reference` with an inverse flag.                                                                                                    |
| Webhooks (signed, filtered)                                                  | **2**                                    |                                                                                                                                                            |
| REST API + API keys                                                          | **2**                                    |                                                                                                                                                            |
| Members/roles (Admin/Member), invites                                        | **1**                                    | On core `memberships`.                                                                                                                                     |
| Object/list access levels, Teams                                             | **3**                                    | Attio Pro.                                                                                                                                                 |
| Custom objects                                                               | **3**                                    | Generic records table.                                                                                                                                     |
| Formula attributes                                                           | **3** (maybe never)                      | Postgres generated columns can't read jsonb siblings cheaply; compute in app.                                                                              |
| MCP tools                                                                    | **3**                                    |                                                                                                                                                            |
| Ask-AI, AI attributes                                                        | **3**                                    |                                                                                                                                                            |
| Enrichment                                                                   | **3** optional                           | Needs a provider (Clearbit-style); ship the hook + a free logo fallback.                                                                                   |
| Email/calendar sync, communication intelligence                              | **4 / out of scope**                     | Gmail + MS Graph OAuth, mailbox sync workers, privacy model. A separate extension (`crm-email`) that `requires: ["crm"]` is the right shape when it comes. |
| Workflows, Sequences, Call Intelligence, Chrome extension, Slack/Zapier apps | **out of scope**                         | Webhooks + the API give Zapier/Make/n8n parity for automation.                                                                                             |

---

## 5. Delivery phases

Every phase ends green: `pnpm ext sync && pnpm typecheck && pnpm lint && pnpm test && pnpm test:rls`, plus Playwright for the critical flows, and regenerated `pnpm db:gen-types`.

### Phase 0 — Foundations (≈2–3 days)

1. Decide the §6 open questions (defaults below are the recommendation).
2. `pnpm ext create crm`; set manifest (`requires: ["notifications"]`, settings).
3. Core migration: `accept_invitation()` RPC (or decide on the service-role route).
4. Add `@tanstack/react-table`, `@tanstack/react-virtual`, `@dnd-kit/*`,
   `papaparse` to the pnpm catalog; run `pnpm license:check`.
5. `001_initial.sql`: workspaces-scoped tables, RLS, triggers (activities,
   stage events, updated_at), tsvector; `drop.sql`; `test:rls` crm case.
6. `useCrmWorkspace()` + workspace switcher + members screen.

### Phase 1 — Basic CRM (MVP) (≈3–4 weeks)

People / Companies / Deals CRUD · attributes settings + typed custom values
(server-validated) · table view with filters/sort/group/columns + saved views ·
deals kanban · record page (attributes, related, timeline, notes, tasks) · tags ·
tasks page · CSV import/export · global search · dashboard widget · native
lists/record/tasks/widget · notifications for assignment/mentions · unit +
RLS + e2e (`tooling/web-e2e/src/crm.spec.ts`: create company → person → deal,
move stage, note, import CSV) · `docs/CMS.md` settings entry · README blurb.

### Phase 2 — Attio parity for "Plus" (≈2–3 weeks)

Lists + entries + list attributes · comments with @mentions · shared views
permissions · kanban on any status attribute · `record_reference` attributes ·
reports page (Insight / Funnel / Time in stage; load the `dataviz` skill when
building charts) · webhooks + dispatch worker · REST API + API keys · merge
duplicates · stage target-time overdue nudges.

### Phase 3 — Pro-tier extras (pick by demand)

Custom objects · object/list access levels · MCP tools · Ask-CRM + AI
attributes · enrichment provider hook · `was` historical filters.

### Phase 4 — Email/calendar (separate extension, if ever)

---

## 6. Open decisions (recommendation first)

1. **Tenancy**: org-scoped from day one (recommended) vs per-user `user_id`
   only. Retrofitting tenancy is the most expensive change later; the helpers
   already exist. Single-user founders get an auto-created personal workspace
   and never see the difference.
2. **Invitation acceptance**: add a core `accept_invitation()` SECURITY DEFINER
   RPC migration (recommended — keeps the service role out of the request path
   and benefits future extensions) vs a service-role server route inside the
   extension.
3. **Custom attribute storage**: `custom jsonb` on concrete tables
   (recommended) vs a generic EAV engine now. Revisit only if custom objects
   become a day-one requirement.
4. **Third-party API auth**: add an optional API-key authenticator to the
   extension dispatcher (small host change, reusable) vs CRM-only
   `publicRoutes` that verify keys themselves. Recommended: the dispatcher hook,
   in phase 2.
5. **Rich-text notes**: lift chat's vendored ProseMirror editor into
   `packages/ui` (recommended, shared) vs a lighter markdown textarea for v1.
6. **Payload or Supabase for attribute definitions**: Supabase (recommended) —
   per-workspace and member-managed; Payload settings stay staff-global.
7. **Name**: slug `crm`, package `@acme/ext-crm`, nav title "CRM"
   (staff can rename in `/admin` → nav-items).

---

## 7. Risks

- **Filter builder complexity**: nested and/or across core columns and JSONB
  custom attributes is the hardest piece of v1; do it server-side once
  (`/records/:object/query`) and have views + exports + the API share it.
- **Bundle safety**: TanStack Table / dnd-kit live in `./web` only; the barrel
  stays zod + react-query. The CI `expo export` smoke check is the backstop.
- **RLS cost**: `is_org_member()` per row is cheap (indexed memberships), but
  add `(org_id, …)` composite indexes on every list-sorted column and keep
  `(select auth.uid())` wrapping.
- **Timeline volume**: attribute-diff triggers on bulk CSV imports can write
  one activity per row; batch imports mark `pg_setting('ext_crm.silent')` to
  write a single "imported N records" event instead.
- **Scope creep toward Attio Pro**: the phase table is the contract; email
  sync and workflows are explicitly out.
