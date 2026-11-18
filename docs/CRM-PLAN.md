# Dream CRM — implementation plan (`@acme/mod-crm`)

> Status: **plan**, nothing built yet. Dream CRM is the first **non-bundled, private**
> module: it lives in its own private repo (`vpv-group/dream-mod-crm`) and is installed
> into a kit-based product with `pnpm mod add`, mounting at **`/a/crm`**. Its data model
> follows **Salesforce standard objects** (labels, API names, picklists, relationships)
> so that adding a Salesforce connector later is a mapping exercise, not a migration.
> Its web UI is built from the **shadcn-ui-kit dashboard** (`shadcn-ui-kit-dashboard-main`)
> and styled with the host's shadcn theme.
>
> Sections 1–5 are the module spec. When Phase 2 creates the private repo, they move into
> that repo's `docs/`. Section 6 lists the **kit-side** changes, which stay here.

**Sources used:** the Salesforce Starter org `flow-force-4450` in the screenshots of
the Sales app (Leads · Contacts · Accounts · Opportunities · Products · Price Books ·
Calendar · Analytics) and the Service app (Cases · Contacts · Accounts · Messaging
Sessions · Analytics · Knowledge); the _New Case_ and _New Knowledge_ modals; the
Analytics standard-report list; Salesforce's standard object reference; and the UI kit
zip.

---

## 0. Decisions in this plan (please confirm)

| #   | Decision             | Recommendation                                                                                                                                                                                                                                     | Why                                                                                                                                                                              |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Tenancy**          | **Org-scoped**: every record has `org_id`, uses the kit's existing `organizations` / `memberships` and `is_org_member()`                                                                                                                           | A CRM holds team data. This matches Salesforce, where one org is shared by users, and the kit already includes these tables and helpers (docs/ERD.md).                           |
| D2  | **Where data lives** | Supabase `mod_crm_*` tables under **RLS**, not Payload                                                                                                                                                                                             | Golden rule #1: RLS clients (web and native) read and write this data directly, and a sync engine will write to it later. Payload is used only for the module's settings screen. |
| D3  | **v1 object scope**  | Account, Contact, Lead (with Convert), Opportunity (with pipeline board), Case, Task, Note                                                                                                                                                         | This is the smallest set that covers both the Sales and Service apps in the screenshots. Products, Price Books, Events/Calendar and Knowledge follow in v1.1 and v1.2 (§5).      |
| D4  | **Naming**           | Labels and picklist values match Salesforce exactly. Columns are `snake_case(ApiName)`. Every field's Salesforce API name is stored in a typed **field registry**                                                                                  | The registry is the single map a connector will use (§2).                                                                                                                        |
| D5  | **Distribution**     | Private GitHub repo with semver tags. You install with `pnpm mod add <git-url>#vX.Y.Z` using your own git credentials. The kit gets a `MOD_SOURCE_TOKEN` so `/admin/modules` and auto-update can reach private sources (§6)                        | `mod add` already clones by git URL. Only the CI and admin path need credentials.                                                                                                |
| D6  | **UI primitives**    | Generic shadcn primitives the CRM needs (table, dialog, sheet, tabs, popover, command, …) move into **`@acme/ui`** in a public kit PR. CRM-specific composites (data table, filters, kanban, record form) stay in the module                       | Other modules can reuse the primitives, and the private repo stays small and focused on the CRM.                                                                                 |
| D7  | **UI kit licence**   | ⚠️ **Check before Phase 2.** shadcnuikit.com is a paid template and the zip has no LICENSE file. Confirm your licence tier allows distributing derived components inside a module you ship to other people (not only inside your own end product). | Distributing a module counts as redistribution.                                                                                                                                  |

---

## 1. Salesforce object and field map (v1)

### 1.1 Naming rules (applied mechanically, so the connector map is generated, not hand-written)

| Salesforce                         | Dream CRM                                                                   | Example                                                        |
| ---------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Object API name                    | table `mod_crm_<plural_snake>`                                              | `Opportunity` → `mod_crm_opportunities`                        |
| Field API name                     | column `snake_case(ApiName)`                                                | `AnnualRevenue` → `annual_revenue`, `StageName` → `stage_name` |
| `…Id` lookup                       | `…_id uuid` FK, composite with `org_id`                                     | `AccountId` → `account_id`                                     |
| Compound address                   | prefixed columns                                                            | `BillingPostalCode` → `billing_postal_code`                    |
| `Id`                               | `id uuid` (Dream) + `sf_id text` (18-char Salesforce Id, null until synced) |                                                                |
| `OwnerId`                          | `owner_id uuid` → `auth.users` (default `auth.uid()`)                       |                                                                |
| `CreatedDate` / `LastModifiedDate` | `created_at` / `updated_at` (kit convention)                                |                                                                |
| `CreatedById` / `LastModifiedById` | `created_by` / `updated_by`                                                 |                                                                |
| `IsDeleted` (Recycle Bin)          | `deleted_at timestamptz` (soft delete)                                      |                                                                |
| `SystemModstamp`                   | `sf_system_modstamp timestamptz` (reserved for sync)                        |                                                                |
| Custom fields `Foo__c`             | `custom_fields jsonb`, keyed by API name                                    | `{"Region__c": "EMEA"}`                                        |
| Object URL slug                    | plural kebab label                                                          | `/a/crm/opportunities`, `/a/crm/price-books`                   |

**Every table has these columns:** `id, org_id, owner_id, created_at, created_by,
updated_at, updated_by, deleted_at, sf_id, sf_system_modstamp, custom_fields`. There is
a unique index on `(org_id, sf_id) where sf_id is not null`.

### 1.2 Picklists are data, not enums

Salesforce picklists can be edited per org, and some values carry extra metadata (a
stage has a probability, a forecast category and closed/won flags; a case status has
`IsClosed`; a lead status has `IsConverted`). These are stored in
**`mod_crm_picklist_values`**:

```
(org_id nullable, object, field, value, label, sort_order, is_default, is_active, meta jsonb)
```

- `org_id is null` rows hold the **global Salesforce defaults**. Every authenticated
  member can read them.
- When an org admin edits a picklist, the defaults are copied into org-owned rows
  first. Reads prefer org rows and fall back to the defaults, so no per-org seeding
  step is needed.
- `meta` mirrors Salesforce's metadata objects: `OpportunityStage`
  (`{probability, forecastCategory, isClosed, isWon}`), `CaseStatus` (`{isClosed}`),
  `LeadStatus` (`{isConverted}`) and `TaskStatus` (`{isClosed}`).
- A row is only _valid_ for its field. Columns stay `text`, and a trigger checks each
  value against the active picklist. This keeps sync from failing hard on unknown
  values (Salesforce "restricted picklist" behaviour is optional).

> **Phase 0 confirms the values below** against your actual org with
> `sf sobject describe`. The values marked † are the Salesforce defaults for
> Enterprise and Professional orgs. Starter orgs sometimes ship a shorter list, and
> whatever your org's describe output says wins. Values marked ✓ come from the
> screenshots.

### 1.3 Account — `Account` → `mod_crm_accounts` → `/a/crm/accounts`

| Label            | API name                                        | Column                | Type                     | Notes                                                                                                                          |
| ---------------- | ----------------------------------------------- | --------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Account Name     | `Name`                                          | `name`                | text                     | **required**                                                                                                                   |
| Account Owner    | `OwnerId`                                       | `owner_id`            | user                     |                                                                                                                                |
| Parent Account   | `ParentId`                                      | `parent_id`           | → accounts               |                                                                                                                                |
| Account Number   | `AccountNumber`                                 | `account_number`      | text                     |                                                                                                                                |
| Type             | `Type`                                          | `type`                | picklist                 | Prospect, Customer - Direct, Customer - Channel, Channel Partner / Reseller, Installation Partner, Technology Partner, Other † |
| Industry         | `Industry`                                      | `industry`            | picklist                 | the 32 standard values (Agriculture … Utilities) †                                                                             |
| Rating           | `Rating`                                        | `rating`              | picklist                 | Hot, Warm, Cold †                                                                                                              |
| Account Source   | `AccountSource`                                 | `account_source`      | picklist                 | Web, Phone Inquiry, Partner Referral, Purchased List, Other †                                                                  |
| Annual Revenue   | `AnnualRevenue`                                 | `annual_revenue`      | currency `numeric(18,2)` |                                                                                                                                |
| Employees        | `NumberOfEmployees`                             | `number_of_employees` | int                      |                                                                                                                                |
| Phone / Fax      | `Phone` / `Fax`                                 | `phone` / `fax`       | phone                    |                                                                                                                                |
| Website          | `Website`                                       | `website`             | url                      |                                                                                                                                |
| Billing Address  | `Billing{Street,City,State,PostalCode,Country}` | `billing_*`           | address                  |                                                                                                                                |
| Shipping Address | `Shipping{…}`                                   | `shipping_*`          | address                  |                                                                                                                                |
| Description      | `Description`                                   | `description`         | long text                |                                                                                                                                |

### 1.4 Contact — `Contact` → `mod_crm_contacts` → `/a/crm/contacts`

| Label              | API name                | Column                   | Type       | Notes                                                         |
| ------------------ | ----------------------- | ------------------------ | ---------- | ------------------------------------------------------------- |
| Salutation         | `Salutation`            | `salutation`             | picklist   | Mr., Ms., Mrs., Dr., Prof., Mx. †                             |
| First Name         | `FirstName`             | `first_name`             | text       |                                                               |
| Last Name          | `LastName`              | `last_name`              | text       | **required**                                                  |
| Name               | `Name`                  | `name`                   | generated  | `concat_ws(' ', first_name, last_name)`                       |
| Account Name       | `AccountId`             | `account_id`             | → accounts |                                                               |
| Title / Department | `Title` / `Department`  | `title` / `department`   | text       |                                                               |
| Reports To         | `ReportsToId`           | `reports_to_id`          | → contacts |                                                               |
| Lead Source        | `LeadSource`            | `lead_source`            | picklist   | Web, Phone Inquiry, Partner Referral, Purchased List, Other † |
| Email              | `Email`                 | `email`                  | email      |                                                               |
| Phone / Mobile     | `Phone` / `MobilePhone` | `phone` / `mobile_phone` | phone      |                                                               |
| Birthdate          | `Birthdate`             | `birthdate`              | date       |                                                               |
| Mailing Address    | `Mailing{…}`            | `mailing_*`              | address    |                                                               |
| Email Opt Out      | `HasOptedOutOfEmail`    | `has_opted_out_of_email` | bool       |                                                               |
| Do Not Call        | `DoNotCall`             | `do_not_call`            | bool       |                                                               |
| Description        | `Description`           | `description`            | long text  |                                                               |

### 1.5 Lead — `Lead` → `mod_crm_leads` → `/a/crm/leads`

| Label                                     | API name                                      | Column                            | Type      | Notes                                                                                                                           |
| ----------------------------------------- | --------------------------------------------- | --------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Salutation / First / Last Name            | as Contact                                    |                                   |           | `last_name` **required**, `name` generated                                                                                      |
| Company                                   | `Company`                                     | `company`                         | text      | **required**                                                                                                                    |
| Title                                     | `Title`                                       | `title`                           | text      |                                                                                                                                 |
| Email / Phone / Mobile / Website          | `Email` / `Phone` / `MobilePhone` / `Website` | …                                 |           |                                                                                                                                 |
| Lead Status                               | `Status`                                      | `status`                          | picklist  | **required.** Open - Not Contacted (default), Working - Contacted, Closed - Converted (`isConverted`), Closed - Not Converted † |
| Lead Source                               | `LeadSource`                                  | `lead_source`                     | picklist  | as Contact                                                                                                                      |
| Industry / Rating                         | `Industry` / `Rating`                         | `industry` / `rating`             | picklist  | as Account                                                                                                                      |
| Annual Revenue / No. of Employees         | `AnnualRevenue` / `NumberOfEmployees`         | …                                 |           |                                                                                                                                 |
| Address                                   | `Street, City, State, PostalCode, Country`    | `street`, `city`, …               | address   |                                                                                                                                 |
| Email Opt Out                             | `HasOptedOutOfEmail`                          | `has_opted_out_of_email`          | bool      |                                                                                                                                 |
| Converted                                 | `IsConverted` / `ConvertedDate`               | `is_converted` / `converted_date` | system    | set only by Convert                                                                                                             |
| Converted Account / Contact / Opportunity | `Converted{Account,Contact,Opportunity}Id`    | `converted_*_id`                  | system    |                                                                                                                                 |
| Description                               | `Description`                                 | `description`                     | long text |                                                                                                                                 |

**Convert Lead** is a Postgres function, `mod_crm_convert_lead(lead_id, account_id?,
create_opportunity bool, opportunity_name?)`. It runs as `SECURITY INVOKER`, so RLS
applies, and in one transaction it creates or reuses the Account, creates the Contact,
optionally creates the Opportunity, re-parents the lead's Tasks and Notes, and stamps
the `converted_*` fields. This matches Salesforce's `convertLead` behaviour.

### 1.6 Opportunity — `Opportunity` → `mod_crm_opportunities` → `/a/crm/opportunities`

| Label             | API name               | Column                   | Type       | Notes                                                                                                       |
| ----------------- | ---------------------- | ------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------- |
| Opportunity Name  | `Name`                 | `name`                   | text       | **required**                                                                                                |
| Account Name      | `AccountId`            | `account_id`             | → accounts |                                                                                                             |
| Primary Contact   | `ContactId`            | `contact_id`             | → contacts |                                                                                                             |
| Amount            | `Amount`               | `amount`                 | currency   |                                                                                                             |
| Close Date        | `CloseDate`            | `close_date`             | date       | **required**                                                                                                |
| Stage             | `StageName`            | `stage_name`             | picklist   | **required** — values below                                                                                 |
| Probability (%)   | `Probability`          | `probability`            | percent    | defaults from the stage; can be overridden                                                                  |
| Forecast Category | `ForecastCategoryName` | `forecast_category_name` | picklist   | Pipeline, Best Case, Commit, Omitted, Closed. Defaults from the stage.                                      |
| Type              | `Type`                 | `type`                   | picklist   | Existing Customer - Upgrade, Existing Customer - Replacement, Existing Customer - Downgrade, New Customer † |
| Lead Source       | `LeadSource`           | `lead_source`            | picklist   |                                                                                                             |
| Next Step         | `NextStep`             | `next_step`              | text       |                                                                                                             |
| Closed / Won      | `IsClosed` / `IsWon`   | `is_closed` / `is_won`   | system     | a trigger derives them from the stage `meta`                                                                |
| Description       | `Description`          | `description`            | long text  |                                                                                                             |

Default stages †, as `value (probability %, forecast category)`: Prospecting (10, Pipeline) ·
Qualification (10, Pipeline) · Needs Analysis (20, Pipeline) · Value Proposition (50,
Pipeline) · Id. Decision Makers (60, Pipeline) · Perception Analysis (70, Pipeline) ·
Proposal/Price Quote (75, Pipeline) · Negotiation/Review (90, Pipeline) · Closed Won
(100, Closed, won) · Closed Lost (0, Omitted, closed).

### 1.7 Case — `Case` → `mod_crm_cases` → `/a/crm/cases`

| Label                              | API name                                  | Column                      | Type             | Notes                                                                                       |
| ---------------------------------- | ----------------------------------------- | --------------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| Case Number                        | `CaseNumber`                              | `case_number`               | auto-number      | per-org counter, `00001000` format. Kept in a `mod_crm_counters` table.                     |
| Status                             | `Status`                                  | `status`                    | picklist         | **required.** New (default), Working, Waiting on Customer, Escalated, Closed (`isClosed`) ✓ |
| Priority                           | `Priority`                                | `priority`                  | picklist         | High, Medium (default), Low ✓                                                               |
| Case Origin                        | `Origin`                                  | `origin`                    | picklist         | Phone, Email, Web † (the screenshot shows `--None--` as the default)                        |
| Type / Case Reason                 | `Type` / `Reason`                         | `type` / `reason`           | picklist         | values come from Phase 0 describe                                                           |
| Case Owner                         | `OwnerId`                                 | `owner_id`                  | user             | ✓                                                                                           |
| Contact Name / Account Name        | `ContactId` / `AccountId`                 | `contact_id` / `account_id` | lookup           | ✓                                                                                           |
| Subject / Description              | `Subject` / `Description`                 | `subject` / `description`   | text / long text | ✓                                                                                           |
| Parent Case                        | `ParentId`                                | `parent_id`                 | → cases          |                                                                                             |
| Closed / Escalated                 | `IsClosed` / `ClosedDate` / `IsEscalated` | …                           | system           | `is_closed` and `closed_date` are set by a trigger                                          |
| Web Name / Email / Phone / Company | `Supplied{Name,Email,Phone,Company}`      | `supplied_*`                | text             | for web-to-case later                                                                       |

The modal's _Send notification email to contact_ checkbox is a save-time option, not a
field. In v1 it renders disabled with a "coming soon" tooltip, and it is wired up once
an email service exists.

### 1.8 Activities and notes

**Task** — `Task` → `mod_crm_tasks` → `/a/crm/tasks`. Fields: Subject (`Subject`,
**required**, combobox suggesting Call · Send Letter · Send Quote · Other), Status
(`Status`, **required**: Not Started (default), In Progress, Completed (`isClosed`),
Waiting on someone else, Deferred †), Priority (`Priority`: High, Normal (default),
Low †), Due Date (`ActivityDate` → `activity_date`), Comments (`Description`), Assigned
To (`OwnerId`), `TaskSubtype` (Task · Email · Call), `IsClosed` (derived) and
`CompletedDateTime`.

**Polymorphic `WhoId` / `WhatId`** become real foreign-key columns, so referential
integrity and RLS stay simple: `lead_id | contact_id` for Who and
`account_id | opportunity_id | case_id` for What. A `CHECK` allows at most one of each
group. The connector maps them by Salesforce key prefix (`00Q` = Lead, `003` = Contact,
`001` = Account, `006` = Opportunity, `500` = Case).

**Note** → `mod_crm_notes`: `title` and `body`, with the same parent columns. It maps
to `ContentNote` + `ContentDocumentLink` on sync.

**Recently Viewed** → `mod_crm_recent_items (user_id, object, record_id, viewed_at)`
with own-row RLS. It backs the "Recently Viewed" list view that every object home
shows by default, as in the Accounts screenshot.

---

## 2. Field registry — the single source of truth

The client-safe barrel `@acme/mod-crm` exports **`CRM_OBJECTS`**. It is pure data, so
it is safe for web, native and the future connector:

```ts
export const Account = defineCrmObject({
  apiName: "Account", label: "Account", labelPlural: "Accounts",
  table: "mod_crm_accounts", slug: "accounts", icon: "IconBuilding",
  nameField: "name",
  fields: {
    name:           { apiName: "Name", label: "Account Name", type: "text", required: true },
    type:           { apiName: "Type", label: "Type", type: "picklist" },
    annual_revenue: { apiName: "AnnualRevenue", label: "Annual Revenue", type: "currency" },
    parent_id:      { apiName: "ParentId", label: "Parent Account", type: "lookup", to: "Account" },
    // …
  },
  layout: [            // mirrors the Salesforce page-layout sections in the modals
    { section: "Account Information", fields: ["name", "owner_id", "type", "industry", …] },
    { section: "Address Information", fields: ["billing_*", "shipping_*"] },
    { section: "Description Information", fields: ["description"] },
  ],
  listColumns: ["name", "type", "phone", "owner_id"],
  compactLayout: ["type", "phone", "website", "owner_id"],   // highlights panel
});
```

These all come from the registry: **zod validators** (forms and server), **form
dialogs** (the section layout, the `*` = Required Information legend, the two-column
grid), **list columns and filters**, **record detail pages**, **CSV import headers**
(Salesforce API names are accepted as column headers) and the **connector field map**.

The SQL migrations are still written by hand, which keeps them reviewable. A vitest
**parity test** checks that every registry column exists in the generated Supabase
types with a compatible type, and the other way round, so the two cannot drift apart.

---

## 3. Database (module migrations)

`modules/crm/supabase/migrations/`:

| File                | Contents                                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `001_core.sql`      | `mod_crm_picklist_values` (+ Salesforce default seed rows), `mod_crm_counters`, the six v1 object tables plus notes and recent items, generated `name` columns, composite same-org FKs, indexes     |
| `002_triggers.sql`  | `updated_at` / `updated_by` stamping, picklist validation, stage → probability, forecast category and closed/won, case `is_closed` / `closed_date` and case number, task `is_closed`                |
| `003_functions.sql` | `mod_crm_convert_lead()`, `mod_crm_search(q)` (name/email `ilike` in v1, `tsvector` in v1.1), `mod_crm_set_owner(object, ids[], owner)` for bulk Change Owner                                       |
| `004_views.sql`     | dashboard views created with **`security_invoker = true`** so RLS applies: `mod_crm_pipeline_by_stage`, `mod_crm_leads_by_source`, `mod_crm_open_cases_by_priority`, `mod_crm_closed_won_by_period` |
| `drop.sql`          | drops everything above, for `mod remove`                                                                                                                                                            |

**RLS template** (every object table):

```sql
alter table mod_crm_accounts enable row level security;
-- read: org members; soft-deleted rows only for org admins (Recycle Bin)
create policy "read" on mod_crm_accounts for select to authenticated
  using (public.is_org_member(org_id) and (deleted_at is null or public.is_org_admin(org_id)));
create policy "insert" on mod_crm_accounts for insert to authenticated
  with check (public.is_org_member(org_id) and created_by = (select auth.uid()));
create policy "update" on mod_crm_accounts for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "delete" on mod_crm_accounts for delete to authenticated
  using (owner_id = (select auth.uid()) or public.is_org_admin(org_id));
-- anonymous sessions never touch CRM data
create policy "no_anon" on mod_crm_accounts as restrictive for all to authenticated
  using (not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false));
```

This is the same as Salesforce Starter's "Public Read/Write" org-wide default. A
per-object sharing model (Private / Read Only / Read/Write) is a v2 setting.
**Same-org integrity** comes from composite FKs: `(account_id, org_id) references
mod_crm_accounts (id, org_id)`. This makes it impossible to link a contact to another
org's account, with no trigger needed.

**Workspace bootstrap.** The CRM requires an org. If a user who belongs to no org
opens `/a/crm`, they see a "Create your CRM workspace" empty state. It inserts into
`public.organizations` through the user's own RLS session, and the kit's existing
trigger creates the owner membership. If the user belongs to several orgs, an **org
switcher** in the CRM header picks the active one, which is kept in a cookie and sent
with every query.

---

## 4. UI — Salesforce screen → UI kit source → module component

The UI kit runs the same stack as the host (Next 16, React 19, Tailwind v4, shadcn,
zod 4, react-hook-form), so porting is mostly re-pointing imports. **Rules:** copy
_composites_ only; take primitives from `@acme/ui` (D6); remove the kit's
`theme-customizer`, `active-theme` and promo/layout chrome; keep the semantic tokens
(`--chart-1…5`, `bg-muted`, …) so the host's `theme-settings` global themes the CRM
too.

| Salesforce screen                                                       | UI kit source (`app/dashboard/(auth)/…`)                                              | Module component                                                                                                                                                                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App nav bar (Leads · Contacts · Accounts · …)                           | `components/layout/header` tabs                                                       | `CrmAppNav`: object tabs inside `/a/crm`. Order and visibility come from module settings (the equivalent of Salesforce App Manager). The kit sidebar shows one **CRM** entry.                                     |
| CRM home (Analytics: My Pipeline, Opportunities Won, Open Cases…)       | `crm/page.tsx` + `crm/components/*`                                                   | `CrmHomePage` (below)                                                                                                                                                                                             |
| Object home / list view ("Recently Viewed", "All Open Cases" ▾)         | `pages/users/data-table.tsx` + `components/ui/filters/*` + `table-filter-helpers.tsx` | `ObjectListView`: list-view picker (Recently Viewed · All · My · Open), column visibility, Filters builder, sorting, pagination, bulk select                                                                      |
| List actions (New · Import · Change Owner · Add to list · Assign Label) | `button-group.tsx`                                                                    | New · Import · Export · Change Owner · Delete (button group plus overflow menu)                                                                                                                                   |
| _New Case_ / _New Knowledge_ modal                                      | `dialog.tsx` + `field.tsx` + react-hook-form                                          | `RecordFormDialog`: generated from `layout`, with grey section bars, two-column grid, `*` required legend, Cancel / **Save & New** / Save                                                                         |
| Lookup ("Search Accounts…", "Search Contacts…")                         | `combobox.tsx` / `command.tsx`                                                        | `LookupField`: debounced search over the target object, plus "+ New Account" inline                                                                                                                               |
| Record page (`/lightning/r/…/view`)                                     | `pages/orders/[id]/page.tsx` + `pages/user-profile`                                   | `RecordPage`: highlights panel (icon, name, compact layout fields, actions), **Path** (stage/status chevrons for Opportunity, Lead and Case), tabs **Details · Related · Activity**                               |
| Activity timeline                                                       | `components/ui/timeline.tsx`                                                          | `ActivityTimeline`: tasks and notes for the record, with quick "New Task" and "New Note"                                                                                                                          |
| Opportunity pipeline / Case board                                       | `apps/kanban` + `components/ui/kanban.tsx` (dnd-kit)                                  | `PipelineBoard` grouped by `stage_name` (or case `status`). Each column shows the sum of `amount`. Dragging a card updates the stage, and the trigger recomputes probability. Shown as `?view=board` on the list. |
| Tasks                                                                   | `apps/tasks/components/task-list.tsx`                                                 | `TasksPage`: My Tasks · Overdue · Today · All                                                                                                                                                                     |
| Global search                                                           | `command.tsx` (⌘K)                                                                    | `CrmCommandMenu` → `mod_crm_search`                                                                                                                                                                               |
| Convert Lead                                                            | `dialog.tsx`                                                                          | `ConvertLeadDialog` (new or existing account, contact, optional opportunity)                                                                                                                                      |

**`CrmHomePage` (`/a/crm`)**: the kit's CRM dashboard cards, re-bound to real data and
Salesforce report semantics:

| Kit card             | Data (Salesforce standard report it imitates)                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `TargetCard`         | Closed Won this quarter vs. a quarterly target set in module settings ("My Forecast")                             |
| `TotalCustomersCard` | Accounts where `type like 'Customer%'` ("Top Accounts")                                                           |
| `TotalDeals`         | open Opportunities count ("My Pipeline")                                                                          |
| `TotalRevenueCard`   | Closed Won amount for the period ("Opportunities Won")                                                            |
| `LeadBySourceCard`   | `mod_crm_leads_by_source` (Lead Source)                                                                           |
| `RecentTasks`        | my open Tasks by due date ("My Open Tasks")                                                                       |
| `SalesPipeline`      | `mod_crm_pipeline_by_stage`, with stages and colours from the stage picklist instead of the kit's hard-coded list |
| `LeadsCard`          | latest Leads, using the `ObjectListView` compact mode                                                             |
| _(new)_ Service row  | Open Cases by Priority · Cases Closed MTD (from the Service analytics list)                                       |

The date-range picker (`custom-date-range-picker.tsx`) drives every card. **Export**
downloads CSV.

**Routes** (manifest `routes.web`; stubs come from `mod sync`):

```
""                      CrmHomePage
"[object]"              ObjectListPage     accounts|contacts|leads|opportunities|cases|tasks
"[object]/[id]"         RecordPage
"r/[sfId]"              SalesforceIdRedirect   (→ /a/crm/<object>/<id>; useful once synced)
"settings"              CrmSettingsPage    (picklist editor for org admins)
```

A single `[object]` segment, validated against `CRM_OBJECTS`, keeps the route table
small and makes new objects registry-only changes. Phase 1 confirms that `mod sync`
supports multi-segment dynamic paths.

**Native (Expo, v1 minimal, react-native-reusables):** `CrmHomeScreen` (pipeline
summary and my tasks), `ObjectListScreen` and `RecordScreen` for Accounts, Contacts,
Leads, Opportunities and Cases. You can read records, change stage or status, and
quick-create a Lead, Task or Note. Full editing, the pipeline board and import are
web-only in v1. The validators and hooks come from the shared barrel, so both platforms
use the same logic.

**Dashboard widget:** `CrmWidget` (web and native) shows pipeline value and my open
tasks count on the kit's dashboard module.

---

## 5. Module manifest, server, settings and roadmap

```ts
export default defineModule({
  slug: "crm",
  name: "Dream CRM",
  version: "1.0.0",
  kitCompat: ">=2.1.0 <3",
  description:
    "Salesforce-compatible CRM: accounts, contacts, leads, opportunities, cases.",
  nav: {
    web: [{ title: "CRM", href: "/a/crm", icon: "IconBriefcase", order: 25 }],
    native: [
      { title: "CRM", href: "/a/crm", icon: "IconBriefcase", order: 25 },
    ],
  },
  routes: { web: [/* §4 */], native: [/* … */] },
  database: { tables: [/* every mod_crm_* table */] },
  widgets: { web: "CrmWidget", native: "CrmWidget" },
  server: { routes: true },
  cms: { hasSettings: true },
});
```

**Server routes** (served by the dispatcher at `/api/mod/crm/…`; authed and
rate-limited by the kit):

| Route                  | Purpose                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /import/:object` | CSV import (like Salesforce's Data Import Wizard): header auto-map by label or API name, dry-run preview, upsert by `email` or `sf_id` |
| `GET /export/:object`  | CSV export of the current list view, with Salesforce API names as headers so it re-imports into Salesforce                             |

Everything else goes **direct to Supabase under RLS** through the shared react-query
hooks (`useCrmList`, `useCrmRecord`, `useCrmMutation`, `usePicklist`).

**Module settings** (`defineModuleSettings`, Modules admin group): visible object tabs
and their order, default currency (ISO), fiscal-year start month, and the quarterly
sales target used by the Target card. Picklists are **not** here, because they are
per-org data edited in `/a/crm/settings`.

**Roadmap after v1:**

| Version | Adds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | UI kit source                               |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| v1.1    | `Product2` → `mod_crm_products`, `Pricebook2` → `mod_crm_pricebooks`, `PricebookEntry`, `OpportunityLineItem` (Products related list on Opportunity, amount roll-up); `Event` → `mod_crm_events` + `/a/crm/calendar`                                                                                                                                                                                                                                                                                                 | `pages/products/*`, `apps/calendar`         |
| v1.2    | `Knowledge__kav` → `mod_crm_knowledge_articles`: Title, URL Name (`UrlName`, auto-slugged from the title and unique), Summary, Article Body, Visible In Internal App (`IsVisibleInApp`, default ✓), Visible to Customer (`IsVisibleInCsp`), `PublishStatus` (Draft / Online / Archived), `ArticleNumber`, Article Created/Archived dates, all as in the screenshot; Case ↔ Article link                                                                                                                              | `components/ui/custom/tiptap` (rich editor) |
| v2      | **`crm-salesforce` connector** as a separate module (`requires: ["crm"]`, tables `mod_crm_salesforce_*`, following the `chat-adapter-*` pattern): OAuth 2.0 web-server flow with PKCE via an External Client App; initial load through Bulk API 2.0; incremental sync by `SystemModstamp` (later Change Data Capture / Pub/Sub API); field map from `CRM_OBJECTS`; `custom_fields` round-trips `__c`; conflicts resolved last-write-wins by modstamp. Also: per-object sharing settings, reports builder, Campaigns. | `sales/`, `website-analytics/` charts       |

_Messaging Sessions_ is left out on purpose: the kit's chat module already owns
messaging.

---

## 6. Private distribution and kit-side changes

### 6.1 The private repo

- **Repo:** `vpv-group/dream-mod-crm` (private). The package is `@acme/mod-crm` with
  `"license": "UNLICENSED"`, and a proprietary `LICENSE` / EULA file goes at the root.
  Confirm `pnpm license:check` accepts `UNLICENSED` for a vendored module, and if not,
  allowlist first-party proprietary modules.
- **Created with the kit's own tools:** in a scratch branch of a kit clone, run
  `pnpm mod create crm`, build the module, then run
  `pnpm mod eject crm --repo git@github.com:vpv-group/dream-mod-crm.git`. The repo
  keeps the template module CI, where tag = package.json = manifest version.
- **Releases:** semver tags (`v1.0.0`). CHANGELOG entries list any new migrations.
- **⚠️ The public kit never lists `crm`** in `modules.lock`. Development and testing
  happen in a private host repo, either your product repo or a private
  `dream-crm-sandbox` fork of the kit.
- **⚠️ Vendoring copies the source into the host repo.** Installing the CRM into a
  **public** product repo publishes it. `mod add` should warn when the source is
  private and the host remote is public (see 6.2).

### 6.2 Kit changes (public PR, kit minor bump → `kitCompat >=2.1.0`)

| #   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Where                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| K1  | **Private git sources.** Local `pnpm mod add https://github.com/vpv-group/dream-mod-crm#v1.0.0` already works with the developer's git credentials (verify `ls-remote` and `clone`). For CI and `/admin`: a new optional **`MOD_SOURCE_TOKEN`** repo secret, which needs contents:read on the private module repos. `module-ops.yml` then runs `git config --global url."https://x-access-token:${MOD_SOURCE_TOKEN}@github.com/".insteadOf "https://github.com/"` before `mod add` / `mod update`, and the daily update job's `ls-remote` does the same. Document it in MODULES.md → Founder setup. | `.github/workflows/module-ops.yml`, `tooling/mod/src/lifecycle.ts` (clearer error when auth fails), `docs/MODULES.md` |
| K2  | **Catalog flags:** `"private": true` and `"license": "commercial"` in catalog entries. `/admin/modules` shows a lock badge and "requires access" copy. Add the schema to `docs/module-catalog.example.json`.                                                                                                                                                                                                                                                                                                                                                                                        | admin modules view, catalog schema                                                                                    |
| K3  | **`@acme/ui` primitives** (D6): `table`, `dialog`, `sheet`, `tabs`, `popover`, `command`, `checkbox`, `avatar`, `tooltip`, `skeleton`, `progress`, `calendar`, `textarea`, `scroll-area`, `chart`, `button-group`. Most already exist in `apps/nextjs/src/components/ui` and only need to move into the package with subpath exports.                                                                                                                                                                                                                                                               | `packages/ui`                                                                                                         |
| K4  | **Route stubs:** confirm (and fix if needed) multi-segment dynamic paths like `[object]/[id]` in `mod sync` for both web and Expo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `tooling/mod`                                                                                                         |
| K5  | **Module-owned RLS and e2e tests:** have the RLS runner and Playwright config also pick up `modules/*/tests/rls/**` and `modules/*/e2e/**`. A private module cannot add files to `tooling/`. (This is the "per-module RLS test relocation" follow-up already noted in CLAUDE.md.)                                                                                                                                                                                                                                                                                                                   | `tooling/rls-tests`, `tooling/web-e2e`                                                                                |
| K6  | _(Optional, for selling to other teams)_ **Licensed zip channel.** `module-ops` already accepts a signed zip URL, so a small licence-key service could return short-lived signed URLs to release assets. This avoids handing out GitHub access to the private repo, which fine-grained PATs can't do across organisations anyway.                                                                                                                                                                                                                                                                   | separate service; decide later                                                                                        |

---

## 7. Phases and checkpoints

Every phase ends green on `pnpm typecheck && pnpm lint && pnpm test`, plus
`pnpm test:rls` whenever the schema changes.

| Phase                                  | Work                                                                                                                                                                                                                                                                                                                                                                   | Done when                                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **0. Ground truth**                    | Install the `sf` CLI. For each v1 object, run `sf sobject describe -s <Object> -o flow-force-4450 --json` and commit the output to `fixtures/salesforce/*.describe.json` in the private repo. Reconcile picklists, required fields and Starter-specific fields (the Knowledge body field's API name, Case Type/Reason). Confirm the UI kit licence (D7) and D1–D5.     | The fixtures are committed, and every † in §1 is resolved.                                                            |
| **1. Kit prerequisites**               | K1–K5 as one public kit PR, then a kit minor version bump.                                                                                                                                                                                                                                                                                                             | `mod add` of a private test repo works locally and through `module-ops`.                                              |
| **2. Scaffold and data**               | `mod create crm` → the registry (§2) → migrations 001–004 → RLS → `pnpm db:reset && pnpm db:gen-types` → parity test, RLS tests (cross-org isolation, anon blocked, delete rules, same-org FKs), convert-lead test → `mod eject` to the private repo.                                                                                                                  | `pnpm test:rls` passes with the module installed.                                                                     |
| **3. Web UI**                          | Port the composites (data table, filters, kanban, timeline, combobox) into `src/web/components`. Then build `ObjectListView`, `RecordFormDialog`, `RecordPage`, `PipelineBoard`, `CrmHomePage`, `ConvertLeadDialog`, ⌘K search, and the org switcher with the workspace empty state. Check each screen with Playwright screenshots against the Salesforce screenshots. | Every v1 object can be created, edited, viewed, deleted and found in a list on the web.                               |
| **4. Native**                          | The minimal screens from §4 plus the widget.                                                                                                                                                                                                                                                                                                                           | The CI `expo export` smoke check is green.                                                                            |
| **5. Import/export, settings, polish** | CSV routes, the module settings screen, the picklist editor, empty states, seed demo data (optional "Load sample data" button).                                                                                                                                                                                                                                        | Module e2e: sign up → create workspace → lead → convert → move the opportunity to Closed Won → the dashboard updates. |
| **6. Release**                         | Docs (README, field reference generated from the registry), tag `v1.0.0`, catalog entry, install into the real product via `pnpm mod add`.                                                                                                                                                                                                                             | Installed from the tag in a clean kit clone, with the full suite green.                                               |

---

## 8. Risks

- **Picklist drift between orgs:** solved by making picklists data plus Phase 0
  describe snapshots. The connector will later sync picklist values from describe
  output.
- **Salesforce Id ↔ uuid:** both are kept. URLs use the uuid, and `/a/crm/r/<sfId>`
  redirects.
- **Polymorphic Who/What:** explicit FK columns trade a little flexibility for
  integrity. Adding a new What target means adding a column, which is acceptable.
- **The CRM requires orgs:** a single-user product that dropped the org layer (per
  docs/ERD.md) can't install the CRM. `mod add` should fail with a clear message: add a
  `requiresCore: ["organizations"]` manifest check, or let the migration fail fast.
- **Bundle size:** dnd-kit, TanStack Table and Recharts load only under `/a/crm` route
  chunks and stay out of `./native`.
