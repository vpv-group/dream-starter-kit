# Dream CRM — upgrading to full Salesforce and HubSpot compatibility

> **CRM module documentation.** This file moves to `docs/` in the private module repo
> (`vpv-group/dream-mod-crm`) when it is created. It describes how an installed MVP
> grows into the full target in [FIELDS.md](./FIELDS.md). Nothing here is built yet.
> The MVP itself is specified in [CRM-PLAN.md](../CRM-PLAN.md).

## 1. Three levels of compatibility

| Level                        | What it means                                                                            | Salesforce side                                                                                                     | HubSpot side                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **L1 — MVP (ships first)**   | Six records with Salesforce's names, picklists and field shapes. Data moves by **file**. | CSV in the shape Salesforce's Data Import Wizard and report exports use. Works on **Starter Suite**; no API needed. | CSV in the shape HubSpot's import tool uses. Works on the **Free** plan. |
| **L2 — Full Starter schema** | Every record type in Starter Suite (steps U1–U8 below). Still file-based.                | Starter Suite                                                                                                       | Free                                                                     |
| **L3 — Live sync**           | A connector module keeps records in step automatically (steps C1 and C2).                | Needs an edition with **API access** (see §5)                                                                       | Works on Free, with more on paid plans (see §6)                          |

A workspace connects to **one** external CRM at a time. Both sets of id columns exist
from the MVP on, so moving from files to live sync, or from one vendor to the other,
never needs a schema change on existing tables.

## 2. What the MVP leaves out

Each row is a deliberate shortcut in the MVP and the step that removes it.

| MVP shortcut                                  | Effect today                                                                                           | Removed by |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| No Cases                                      | Support requests aren't tracked in the CRM                                                             | U1         |
| A Contact has one Account                     | A user in several organizations is linked to the first one only                                        | U2         |
| Opportunity has a plain Primary Contact field | No other contact roles on a deal                                                                       | U2         |
| No Events                                     | Meetings can only be logged as Tasks                                                                   | U3         |
| No Products or Price Books                    | Opportunity Amount is typed in by hand                                                                 | U4         |
| No Campaigns                                  | Lead Source is the only marketing attribution                                                          | U5         |
| No Knowledge or case email                    | —                                                                                                      | U6         |
| No person accounts                            | A personal organization becomes an ordinary Account                                                    | U7         |
| Some derived fields aren't maintained         | Push Count, Last Stage Change, Unread By Owner, reminders, last-activity and fiscal roll-ups are empty | U8         |
| File-based exchange only                      | No automatic sync with Salesforce or HubSpot                                                           | C1, C2     |

## 3. Rules every upgrade step follows

1. **Additive only.** A step adds tables, or adds nullable columns to existing tables.
   It never renames, retypes or drops a column, so an MVP install upgrades in place
   and a Salesforce or HubSpot field never changes meaning.
2. **One migration file per step**, numbered in the order steps are released. The
   numbers below assume the order shown; if steps ship in another order the numbers
   change but the contents don't. Shipped migrations are never edited (kit rule).
3. **Backfills are idempotent functions**, named `mod_crm_backfill_<step>()`. The
   migration calls the function once; it is safe to run again.
4. **Every new table** gets the standard columns, the `hs_*` columns, the RLS template
   and the same-workspace composite foreign keys from the plan (§5 there).
5. **`drop.sql` is extended** in the same release so `mod remove` stays clean.
6. **The field registry gains the objects and fields** with a `since` version. Forms,
   lists, CSV headers and connector maps pick them up without other code changes.
7. **A step is released as a minor version** of the module (`1.1.0`, `1.2.0`, …) and
   installed with `pnpm mod update crm`, which applies the migration at the next
   deploy.
8. **Checks before tagging:** registry ↔ database parity test, registry ↔ vendor
   fixture parity test, RLS tests for each new table (cross-workspace isolation,
   customers can't read the operator workspace, anonymous blocked), backfill test on
   a database seeded with MVP data, and `pnpm typecheck && pnpm lint && pnpm test`.

## 4. Upgrade steps to the full Starter schema (L2)

Field lists are in [FIELDS.md](./FIELDS.md); section numbers below refer to it.

### U1 — Cases

|              |                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migration    | `006_cases.sql`                                                                                                                                        |
| New tables   | `mod_crm_cases`, `mod_crm_case_comments` (§9)                                                                                                          |
| New columns  | `case_id` on `mod_crm_tasks` and `mod_crm_notes`, added to the "Related To" check. `next_case_number` on `mod_crm_workspaces`.                         |
| Logic        | Case number from the workspace counter; `is_closed`, `closed_date`, `is_closed_on_create` from the status; saving Internal Comments inserts a comment. |
| Backfill     | None                                                                                                                                                   |
| Screens      | Cases list, record page with status path and comments, case board, "Open cases" tiles on the home page                                                 |
| External fit | Salesforce Starter ✓. HubSpot Free ✓ (tickets, default pipeline only).                                                                                 |

### U2 — Contact relationships

|              |                                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migration    | `007_relationships.sql`                                                                                                                                                                                |
| New tables   | `mod_crm_account_contact_relations` (§5), `mod_crm_opportunity_contact_roles` (§7)                                                                                                                     |
| Logic        | `is_direct` follows the contact's primary account. One primary role per opportunity. `mod_crm_opportunities.contact_id` stops being editable and follows the primary role.                             |
| Backfill     | One direct relation per existing Contact that has an Account. One relation per kit membership, with the role Owner, Admin or Member. One primary contact role per Opportunity that has a `contact_id`. |
| Sync change  | The sign-up sync starts writing a relation for every membership instead of only setting the first Account.                                                                                             |
| Screens      | "Related Contacts" and "Contact Roles" related lists                                                                                                                                                   |
| External fit | Salesforce Starter ✓. HubSpot Free: plain associations only. Roles need association labels, which HubSpot offers on Professional and Enterprise.                                                       |

### U3 — Events and calendar

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| Migration    | `008_events.sql`                                                         |
| New tables   | `mod_crm_events` (§10)                                                   |
| Backfill     | None. Tasks whose type is Meeting are left as tasks.                     |
| Screens      | "New Event" on the activity timeline, calendar view at `/a/crm/calendar` |
| External fit | Salesforce Starter ✓. HubSpot Free ✓ (meetings).                         |

### U4 — Products and price books

|              |                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration    | `009_products.sql`                                                                                                                                   |
| New tables   | `mod_crm_products`, `mod_crm_pricebooks`, `mod_crm_pricebook_entries`, `mod_crm_opportunity_line_items` (§8)                                         |
| New columns  | `pricebook_id` and `has_opportunity_line_item` on `mod_crm_opportunities`                                                                            |
| Logic        | A standard price book per workspace. A product needs a standard price before any other. Once an opportunity has line items, its Amount is their sum. |
| Backfill     | Creates the standard price book for every existing workspace. Existing Amounts are untouched.                                                        |
| Screens      | Products, Price Books, the "Products" related list on an opportunity                                                                                 |
| External fit | Salesforce Starter ✓. HubSpot: products and line items map; price books don't exist there, so only the standard price syncs.                         |

### U5 — Campaigns

|              |                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------- |
| Migration    | `010_campaigns.sql`                                                                                 |
| New tables   | `mod_crm_campaigns`, `mod_crm_campaign_members` (§11)                                               |
| New columns  | `campaign_id` on `mod_crm_opportunities`, and on `mod_crm_tasks` and `mod_crm_notes` ("Related To") |
| Logic        | `has_responded` and `first_responded_date` from the member status; campaign roll-ups as a view      |
| Backfill     | None                                                                                                |
| External fit | Salesforce Starter ✓. Not synced to HubSpot (its campaigns are a different thing).                  |

### U6 — Knowledge and case email

|              |                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Migration    | `011_knowledge_email.sql`                                                                                                      |
| Needs        | U1                                                                                                                             |
| New tables   | `mod_crm_knowledge_articles`, `mod_crm_case_articles` (§12), `mod_crm_email_messages` (§9)                                     |
| Logic        | Article versions, publish and archive, article numbers. Inbound email creates or threads onto a case through an edge function. |
| Backfill     | None                                                                                                                           |
| External fit | Salesforce Starter ✓. HubSpot: emails map; knowledge articles don't sync.                                                      |

### U7 — Person accounts

|              |                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| Migration    | `012_person_accounts.sql`                                                                              |
| New columns  | `is_person_account`, `person_contact_id` on `mod_crm_accounts`                                         |
| Backfill     | Accounts linked to a personal organization are flagged and paired with their single Contact.           |
| Sync change  | Products with organizations switched off get one person account per user.                              |
| External fit | Salesforce Starter ✓ (person accounts must be enabled in the org). HubSpot: a contact with no company. |

### U8 — Remaining derived fields

|             |                                                                                                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration   | `013_derived_fields.sql`                                                                                                                                                                                                |
| New columns | None. The columns exist from the MVP.                                                                                                                                                                                   |
| Logic       | Push Count and Last Stage Change Date on opportunities; Unread By Owner on leads; High Priority on tasks; reminders delivered through the kit's reminders module; last-activity, open-activity and fiscal-period views. |
| Backfill    | Last Stage Change Date ← `updated_at` where empty. Push Count starts at 0.                                                                                                                                              |

Steps U1–U8 are independent except where "Needs" says otherwise. The suggested order
is the one shown: Cases first because they are the most-used record after the MVP six.

## 5. C1 — Live sync with Salesforce (L3)

**Check first: API access.** A live connector needs the Salesforce org to allow API
calls. Salesforce's own pages don't state clearly whether **Starter Suite** includes
API access, and third-party sources say it does not (Pro Suite as a paid add-on,
Enterprise and above included). Confirm in the org before planning this step: Setup →
Company Information shows "API Requests, Last 24 Hours" when the API is available, and
the integration user's profile needs "API Enabled". If the org has no API access, stay
on file-based exchange or upgrade the Salesforce edition.

|                       |                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Module                | `crm-salesforce`, a separate private module (`requires: ["crm"]`)                                                       |
| Its own tables        | `mod_crm_salesforce_connections`, `mod_crm_salesforce_cursors`, `mod_crm_salesforce_user_map`, `mod_crm_salesforce_log` |
| Changes to CRM tables | None. `sf_id`, `sf_system_modstamp` and `custom_fields` exist from the MVP.                                             |
| Sign-in               | OAuth 2.0 web-server flow with PKCE through an External Client App in the customer's org                                |
| First load            | Bulk API 2.0, object by object in dependency order (accounts → contacts → leads → opportunities → activities)           |
| Ongoing               | Poll by `SystemModstamp`; later Change Data Capture                                                                     |
| Field map             | Generated from the registry's `apiName`                                                                                 |
| Conflicts             | Last write wins by modification time, per record                                                                        |

**Cut-over from files to live sync**

1. Take a database backup and switch the workspace to read-only for the first load.
2. **Match** existing Dream records to Salesforce records: by `sf_id` where a file
   import already filled it; otherwise by email (contacts, leads), by name plus website
   (accounts), and by name plus account plus close date (opportunities).
3. **Review** the match report: matched, will be created in Salesforce, will be created
   in Dream, and ambiguous. Nothing is written until an admin confirms.
4. **Write** `sf_id` on matched rows, then run the first load.
5. Read the org's describe output and refresh picklist values. Unknown values are added
   as inactive rather than rejected.
6. Turn on ongoing sync and lift read-only.

Rollback: disable the connection. `sf_id` values stay and do no harm.

## 6. C2 — Live sync with HubSpot (L3)

Built after C1. The mapping, translations and connector rules are in FIELDS.md §13.

|                       |                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Module                | `crm-hubspot`, a separate private module (`requires: ["crm"]`)                                                                                                                       |
| Its own tables        | `mod_crm_hubspot_connections`, `mod_crm_hubspot_cursors`, `mod_crm_hubspot_owner_map`, `mod_crm_hubspot_log`                                                                         |
| Changes to CRM tables | None. The `hs_*` columns exist from the MVP.                                                                                                                                         |
| Credential            | A HubSpot **Service Key**, or an existing private-app token (HubSpot stopped allowing new private apps in October 2026). Stored as `MOD_CRM_HUBSPOT_ACCESS_TOKEN` in the env schema. |
| First load            | Paged reads per object, then associations                                                                                                                                            |
| Ongoing               | Poll HubSpot's search API by last-modified time. A Service Key can't receive webhooks.                                                                                               |
| Writes                | Batches of up to 100; contacts upserted by email, companies matched by domain                                                                                                        |
| Before building       | Save HubSpot's Properties and Pipelines API responses to `fixtures/hubspot/` and resolve every ‡ in FIELDS.md §13                                                                    |

**What each HubSpot plan allows**

| Capability                                                         | Free                                        | Starter                | Professional / Enterprise             |
| ------------------------------------------------------------------ | ------------------------------------------- | ---------------------- | ------------------------------------- |
| Companies, contacts, deals, tickets, tasks, notes, calls, meetings | ✓                                           | ✓                      | ✓                                     |
| Pipelines                                                          | The default pipeline per record type only ✓ | A few custom pipelines | Many                                  |
| Association labels (contact roles, membership roles)               | — ✓                                         | —                      | ✓                                     |
| Custom properties                                                  | About 10 for the whole account ‡            | Many more              | Many more                             |
| API rate limit                                                     | 100 requests / 10 s, 250,000 a day ✓        | Same ✓                 | 190 / 10 s, 625,000–1,000,000 a day ✓ |

So the connector has two profiles:

|                   | **Free profile** (default)                                   | **Paid profile** (switched on per workspace)             |
| ----------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| Pipelines         | `hs_pipeline` is always the default pipeline                 | Maps Salesforce stages per HubSpot pipeline              |
| Roles             | Sent as plain associations; roles stay in Dream              | Sent as association labels                               |
| Custom properties | Creates none in HubSpot. Salesforce-only fields aren't sent. | May map chosen Dream fields to custom HubSpot properties |
| Records           | The six MVP records, plus tickets after U1                   | Adds products and line items after U4                    |

**A smaller first step.** A one-way push of sign-ups (company, contact, their
association, lifecycle stage) uses only Free-plan features and none of the steps
above. It can ship as `crm-hubspot` 0.1 before two-way sync exists.

**Cut-over** follows the same six steps as Salesforce, matching by `hs_object_id` first,
then by email (contacts and leads) and by domain (accounts). One extra check: a Dream
Lead and the Contact it converted into are **one** HubSpot contact, so both rows take
the same `hs_object_id` and only the Contact keeps syncing.

## 7. Recommended order

1. **MVP** (L1) — six records, files in and out.
2. **U1 Cases**, then **U2 Relationships** — the two gaps users notice first.
3. **C2 one-way HubSpot sign-up push** — small, and works on HubSpot Free.
4. **U3–U8** as needed.
5. **C1 Salesforce live sync**, once API access in the target org is confirmed.
6. **C2 HubSpot two-way sync.**

## Sources

- [Salesforce Free / Starter / Pro comparison chart](https://www.salesforce.com/en-us/wp-content/uploads/sites/4/documents/small-business/comparison-chart-starter-prosuite-features-us.pdf)
- [Salesforce editions](https://help.salesforce.com/s/articleView?language=en_US&id=xcloud.overview_edition.htm&type=5)
- [HubSpot: set up and manage object pipelines](https://knowledge.hubspot.com/object-settings/set-up-and-customize-pipelines)
- [HubSpot: create and use association labels](https://knowledge.hubspot.com/object-settings/create-and-use-association-labels)
- [HubSpot: API usage guidelines and limits](https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines)
- [HubSpot: Service Keys](https://developers.hubspot.com/blog/hubspot-service-keys-the-right-api-credential-for-data-integrations)
- [HubSpot: legacy private app creation being disabled](https://developers.hubspot.com/changelog/legacy-private-app-creation-sunset)
