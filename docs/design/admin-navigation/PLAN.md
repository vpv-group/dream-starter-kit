# Admin navigation, pages and theme: a Shopify-style, module-driven `/admin`

Status: **plan v2, ready for wireframes** · Kit 2.7.2 · Payload 3.94 · Owner: kit core (Vincent)

This is the handoff to **Claude Design** for wireframes of the Payload `/admin`
panel, and the build brief that follows them. It covers:

- the **site map and menu**, built from the modules that are installed and
  enabled, ready for the whole 127-module catalogue;
- **URL slugs** that match what each page is called;
- **nesting**: which collections live inside another page, and the **tab menus**
  on every page;
- a **page-by-page UX spec**, including the Users page;
- **one rule set for overlays**: popup, modal, drawer, side panel;
- **one theme** that drives both the shadcn app (`/a`) and the Payload admin;
- **mobile and tablet** parity;
- the **admin home** and a module API for urgent content;
- the **Payload features and best practices** the kit should adopt.

It takes Shopify's information architecture and behavior (75 reference
screenshots, Nov 28, 2026), never its look: every screen is a standard Payload
component, styled by Payload and colored and typed by the site's theme.

### What changed since v1

- Sections now cover the whole module catalogue (`vpvg-context`
  `brands/meet-dream/module-catalogue.md`, 127 modules, Nov 27, 2026): new
  **Sales**, **Support**, **Operations** and **Insights** sections, and
  **System** split from **Settings**.
- **Connectors** (Stripe, Slack, Sendblue, Intercom, GitHub, …) follow the
  naming decision of Nov 17, 2026 (`org/decisions/2026-11-17-module-feature-extension-naming.md`):
  they're never nav items; they live in Settings › Connections and on their
  parent module's settings.
- **Slug alignment** (§16): labels and URL slugs match.
- **Families and tabs** (§9, §10): child collections move into their parent's
  page (Lessons in Series, Enrollments and Private Feeds in Users).
- **Page-by-page UX** (§11) and the **overlay rules** (§12).
- **One theme for app and admin** (§13), replacing the fixed admin palette.
- **Mobile** (§15).
- Facts from Payload's docs at v3.94.2 corrected several v1 details (for
  example `admin.group: false` versus `admin.hidden`, §17.2).
- Mislabeled field labels on Users and five other entities are **already fixed**
  (commit "fix(cms): correct mislabeled admin field labels").

---

## Contents

1. [What we took from Shopify](#1-what-we-took-from-shopify)
2. [The admin today and what's wrong with it](#2-the-admin-today-and-whats-wrong-with-it)
3. [Design principles](#3-design-principles)
4. [Payload-only rules](#4-payload-only-rules)
5. [Navigation model](#5-navigation-model)
6. [Sections and the module catalogue](#6-sections-and-the-module-catalogue)
7. [Full site map](#7-full-site-map)
8. [Section-by-section menu spec](#8-section-by-section-menu-spec)
9. [Families: nesting related collections](#9-families-nesting-related-collections)
10. [Page anatomy and tab menus](#10-page-anatomy-and-tab-menus)
11. [Page-by-page UX spec](#11-page-by-page-ux-spec)
12. [Overlays: popup, modal, drawer, side panel](#12-overlays-popup-modal-drawer-side-panel)
13. [One theme for the app and the admin](#13-one-theme-for-the-app-and-the-admin)
14. [Global styling and consistency rules](#14-global-styling-and-consistency-rules)
15. [Mobile and tablet](#15-mobile-and-tablet)
16. [URL slugs that match names](#16-url-slugs-that-match-names)
17. [How the menu is built](#17-how-the-menu-is-built)
18. [Admin home and urgent content](#18-admin-home-and-urgent-content)
19. [Alerts: header bar, bell, Alerts page](#19-alerts-header-bar-bell-alerts-page)
20. [Settings and System](#20-settings-and-system)
21. [Module pages and connectors](#21-module-pages-and-connectors)
22. [Content collections become modules](#22-content-collections-become-modules)
23. [Payload features to adopt](#23-payload-features-to-adopt)
24. [Payload best-practice alignment](#24-payload-best-practice-alignment)
25. [Roles, permissions and visibility](#25-roles-permissions-and-visibility)
26. [States and edge cases](#26-states-and-edge-cases)
27. [Wireframe brief for Claude Design](#27-wireframe-brief-for-claude-design)
28. [Implementation phases](#28-implementation-phases)
29. [Open questions](#29-open-questions)

---

## 1. What we took from Shopify

Screenshot numbers refer to the 75 screenshots sorted by time (00–74). 00–60
are Shopify; 61–74 are the current Dream `/admin` (meet-dream).

| #   | Shopify pattern                                                                                                                                                | Where             | What we adopt                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Short, fixed top-level list of business objects (Home, Orders 16, Products, Customers, Growth, Discounts, Content, Markets, Finance, Analytics)                | 24–31             | A fixed list of **sections** in a fixed order; a section shows only when something is in it                                                   |
| S2  | Children show only for the active section (Products › Collections, Inventory, Purchase orders, Transfers, Gift cards)                                          | 22, 24, 26, 28–31 | Payload nav groups as an **accordion**, one open at a time (the kit's `AdminNav` already does this)                                           |
| S3  | Collapsed icon rail with fly-out menus on narrow windows                                                                                                       | 00–23             | **Not adopted.** Payload's nav has no icon rail; we keep its open/closed nav and mobile menu                                                  |
| S4  | "Sales channels" divider: Online Store (Pages, Preferences), Point of Sale (Devices, Register sessions, Settings), Inbox, Agentic                              | 32–36, 57         | A **Channels** section: website, app and AI-agent surfaces                                                                                    |
| S5  | "Apps" divider: each installed app gets an entry that expands into its own sub-menu (Instafeed › Settings, Custom media, Analytics, Channels, Plans, Partners) | 47–49, 57–60      | A **Modules zone** for module tools, each with its own pages and **Settings** last                                                            |
| S6  | An app's data of a core type lives in the core section (app discounts are under Discounts)                                                                     | 25                | Module collections go into the **domain section** they belong to                                                                              |
| S7  | Count badge on a nav item for work to do (Orders 16)                                                                                                           | 24–31             | Optional **count pill** per nav link, for actionable work only                                                                                |
| S8  | Home is an action feed: KPI strip, task pills ("Fulfill orders 9", "Capture payments 5"), then cards                                                           | 00–09, 12–13      | Home on **Payload's modular dashboard**: attention items, KPIs, setup guide, module cards. No charts, no AI prompt in v1                      |
| S9  | Alerts bell with a popover                                                                                                                                     | 60                | **Alerts** button in Payload's header `actions` slot, a `Popup` list and an Alerts page                                                       |
| S10 | In-app banners: info ("v20.2.0 is available · Apply update"), warning ("Action required")                                                                      | 47                | Payload `Banner` for module notices; one critical bar in the `header` slot                                                                    |
| S11 | Settings as a separate mode: gear at the bottom, own sidebar, single-column card pages                                                                         | 50–56             | **Settings** and **System** sections at the bottom, admins only, plus an **All Settings** overview page of cards                              |
| S12 | Greyed-out items and "You need permission" pages                                                                                                               | 24, 34, 53, 58    | Payload **hides** what a role can't read; no greyed links                                                                                     |
| S13 | Scoped global search (⌘K) with filters: Apps, Customers, Orders, Products, Sales channels                                                                      | 14–19             | The catalogue's **Search** module (#64) with Payload's search plugin: a header search drawer with scope pills (§23.7)                         |
| S14 | Store switcher and account menu at the bottom                                                                                                                  | 59                | Payload's account view and logout; no store switcher (one site per deploy)                                                                    |
| S15 | List views: KPI strip, saved tabs, search and filter, columns, status pills, Export                                                                            | 10–11, 20–25      | Payload list views + **query presets** (saved views) + `groupBy` + the **Data Export** module (#49) + an optional `beforeListTable` stats row |
| S16 | App sub-pages each reachable from the app's own sub-menu                                                                                                       | 47–49             | **In-page tab menus** on every family and module page, so pages work without the sidebar (mobile)                                             |
| S17 | App-store prompts (recommendation cards, "Picked for you")                                                                                                     | 38–46             | Only inside **System › Modules** (Install Module drawer). No promotions on Home                                                               |

**Not taken:** Shopify's black sidebar, icons, illustrations, charts and promo
cards (Shopify Credit, cashback, shipping offers). Dream's Home shows work,
health and setup, never ads.

---

## 2. The admin today and what's wrong with it

### 2.1 Current nav (screenshots 61–74, meet-dream)

```
Browse by Folder
People ▾        Users · Feed Tokens · Enrollments · Reviews
Content ▾       Media · Posts · Videos · Audio · Photos · Series · Lessons ·
                Locations · Events · Categories · Ideas · Idea Categories ·
                Idea Shares · Tag Groups · Documentation
Community ▾     Space Groups · Community Posts · Comments · Reports
Marketing ▾     Pages · Onboardings · Banners · Notifications · Forms
System ▾        Legal · Site Settings · Theme · Image Generation ·
                Profile Fields · Authentication · Site License
Modules ▾       Modules · Navigation
Commerce ▾      Billing Plans · Billing Coupons · Modules · Module releases ·
                Kit sites
AI Chat ▾       Chat Skills
Updates
```

The dashboard is Payload's default card grid. `beforeDashboard` renders
`SeedGate`, `FinishSetupRow` and `DreamSiteSync`.

### 2.2 Problems

1. **Order is accidental.** Groups follow config order (People first, Commerce
   after Modules).
2. **Every content type is always there.** Videos, Audio, Photos, Series,
   Lessons, Locations and Events are core collections, so a site that doesn't
   use them still has them in the nav, on the dashboard, in MCP and in the DB.
3. **Free-form group strings.** meet-dream already has two different
   "Modules" entries (`kit-modules` under Modules, `mod-modules-catalog` under
   Commerce).
4. **Children sit next to parents.** Lessons, Enrollments and Feed Tokens
   only make sense inside a series or a user, but each has its own nav link.
5. **Settings are scattered.** Site configuration is under System, module
   settings on a generic row page, Updates is a loose link, Legal (editors)
   sits next to Authentication (admins).
6. **Home has no "what needs me".**
7. **Modules have no admin home.**
8. **Labels and slugs disagree and leak internals**: "Billing Plans" at
   `mod-billing-plans`, "Navigation" at `nav-items`, "Theme" at
   `theme-settings`, "Feed Tokens", "Onboardings", "Kit sites".
9. **Mislabeled fields** (fixed in this branch): "Member Status" shown for
   staff, "Supabase User Id", "Linkedin", "Youtube", "Github", "Sms Opt In",
   "Date Of Birth", "Ticket Url", "Secondary Cta"…, and a Users list
   description that said tags were "managed below" when nothing was below it.
10. **The Users page is one long form**: a Billing tab holding only a Stripe
    ID, Subscriptions and Enrollments tables loose under the tabs, a password
    form in the sidebar.
11. **Two styling systems in admin.** `custom.css` (769 lines) pulls in
    Tailwind utilities and overrides Payload classes; some admin components use
    shadcn-style Tailwind classes. The admin palette is fixed
    (`lib/theme/admin-theme.ts`) and ignores the site's theme.
12. **No mobile plan.** Nothing defines how custom admin screens behave below
    tablet width.

---

## 3. Design principles

1. **Sections are fixed; contents are dynamic.** The kit owns the section
   list. Modules place their pages in it. Empty sections disappear.
2. **Install = appear, uninstall = disappear.** A content type exists in the
   nav, on Home, in MCP, in the API and in the database only while its module
   is installed. Disabled modules vanish from the admin (§26).
3. **Core data types go to core sections; tools go to the Modules zone.**
4. **One home per task.** Each record has one place it's managed. Children
   are managed inside their parent (§9). A cross-cutting list (all
   enrollments) is a saved view, not a second nav item.
5. **Actions are buttons, not fields.** Changing a password, resending an
   invite, resyncing to Stripe or resolving a report is a button that opens
   the right overlay (§12), never a form field in the side panel.
6. **Every page navigable without the sidebar.** Families and modules carry
   in-page tab menus, so phones and tablets work as well as desktop.
7. **One theme.** The site theme colors and types both the app and the admin;
   Payload's components and density stay Payload's.
8. **Labels match URLs.** What a page is called is what its URL says.
9. **Home is a work queue.** "What needs me?" first.
10. **Payload first.** If Payload has a component, slot, option or view for
    it, use it as documented.

---

## 4. Payload-only rules

Hard rules for Claude Design and for the code.

### 4.1 Visual

- Payload's admin components, layout, spacing (`--base`), density and type
  scale. **Colors, fonts and corner radius come from the site theme** through
  Payload's own CSS variables (§13).
- No Shopify look, no charts or sparklines, no gradient cards, no shadcn or
  Tailwind classes in admin components.
- Icons only where Payload uses them; nav links have no icons.
- Each custom component imports its own stylesheet (Payload's guidance), uses
  Payload's CSS variables and Payload's SCSS breakpoint mixins
  (`@import '~@payloadcms/ui/scss'`: `extra-small-break`, `small-break`,
  `mid-break`, `large-break`).

### 4.2 Components (from `@payloadcms/ui` and `@payloadcms/next`)

| Need                       | Payload API or component                                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Custom page frame          | `DefaultTemplate` (`@payloadcms/next/templates`) + `Gutter`                                                                               |
| Breadcrumbs                | `useStepNav()` / `setStepNav()`                                                                                                           |
| Sidebar                    | `admin.components.Nav` (the kit's `AdminNav`): `NavWrapper`, `NavGroup`, `Link`, `NavHamburger`                                           |
| Links above the groups     | `admin.components.beforeNavLinks`                                                                                                         |
| Gear menu                  | `admin.components.settingsMenu` with `PopupList.ButtonGroup` / `PopupList.Button`                                                         |
| Header buttons             | `admin.components.actions`                                                                                                                |
| Site-wide bar              | `admin.components.header`                                                                                                                 |
| Home                       | `admin.dashboard.widgets` + `defaultLayout` (modular dashboard, **experimental**)                                                         |
| Cards                      | `Card`                                                                                                                                    |
| Notices                    | `Banner` (`default`, `info`, `success`, `warning`, `error`)                                                                               |
| Counts and status          | `Pill` (`light-gray`, `success`, `warning`, `error`, `dark`, …)                                                                           |
| Buttons                    | `Button`                                                                                                                                  |
| Overlays                   | `Popup`/`PopupList`, `Modal` + `useModal`, `ConfirmationModal`, `Drawer` + `DrawerToggler`, `FullscreenModal`, `Tooltip`, `toast` (§12)   |
| Related docs inside a form | `join` fields (table with Add New in a document drawer)                                                                                   |
| Picking related docs       | relationship `admin.appearance: 'drawer'`                                                                                                 |
| Document actions           | `admin.components.edit.beforeDocumentControls` (buttons) and `edit.editMenuItems` (the "⋯" menu); globals use `admin.components.elements` |
| List actions               | `admin.components.listMenuItems`; `beforeList`, `beforeListTable`, `afterList`                                                            |
| Extra document pages       | document view tabs: `admin.components.views.edit.<key>` with `tab: { label, href, order }`                                                |
| Saved list views           | `enableQueryPresets` + root `queryPresets`                                                                                                |
| Grouped lists              | `admin.groupBy` (**beta**)                                                                                                                |
| Copy to clipboard          | `CopyToClipboard`                                                                                                                         |

### 4.3 Behavior

- Groups come from `admin.group`, restricted to the kit's section registry
  (§17).
- **`admin.group: false`** hides a nav link but keeps the pages reachable: use
  it for child collections (§9). **`admin.hidden`** also removes the routes:
  use it only for internal collections and disabled modules.
- Custom pages are Payload custom views, **secured inside the view** with
  `initPageResult.req.user` (Payload: "all custom views are public by
  default").
- Hide with access control and `admin.hidden`, never with CSS.

---

## 5. Navigation model

### 5.1 Zones

```
┌────────────────────────────────┐
│ Home                           │ zone A: entry (beforeNavLinks)
│ Browse by Folder               │
├────────────────────────────────┤
│ Content            ▸           │
│ Community          ▸           │
│ People             ▸           │
│ Sales              ▸           │ zone B: main sections
│ Support            ▸           │ (fixed order, only if non-empty)
│ Operations         ▸           │
│ Commerce           ▸           │
│ Marketing          ▸           │
│ Insights           ▸           │
│ Channels           ▸           │
├── Modules ─────────────────────┤ zone C: one group per module tool
│ AI Chat            ▸           │ (A–Z)
├────────────────────────────────┤
│ Settings           ▸           │ zone D: admins only
│ System             ▸           │
├────────────────────────────────┤
│ ⚙  Log Out                     │ footer: settingsMenu + logout
└────────────────────────────────┘
```

- **Zone A**: **Home** → `/admin` (new), and Payload's **Browse by Folder**
  while folders are on.
- **Zone B**: kit sections in fixed order, each a Payload `NavGroup`.
- **Zone C**: a non-clickable "Modules" label in Payload's nav-group label
  style, then one group per module tool (§21). Hidden when empty.
- **Zone D**: **Settings** (configuration) and **System** (operations: modules,
  updates, logs, jobs). Admins only.
- **Footer**: Payload's gear (`settingsMenu`) and Log Out.

### 5.2 Accordion

- One group open at a time. The group holding the current page opens on load,
  and the current link is bold (Payload's active style).
- **Children count as their parent**: on a Lesson the Series link is active;
  on a user's Enrollments tab, Users is active.
- On Home, the last group the user opened opens (Payload's `nav` preference);
  before any choice, none.

### 5.3 Count pills

- A link may show a `Pill` with a count, right-aligned. `light-gray`, or
  `error` when the module marks it urgent.
- Work to do only (open reports, past-due subscriptions, failed pushes,
  updates available), never totals. `99+` above 99; hidden at 0.
- Provided by modules (§17.5), cached 60 s per role.

---

## 6. Sections and the module catalogue

### 6.1 Section registry

| Key          | Label      | Order | Zone     | Holds                                                                            | Shopify analog               |
| ------------ | ---------- | ----- | -------- | -------------------------------------------------------------------------------- | ---------------------------- |
| `content`    | Content    | 10    | main     | Things the site publishes: posts, media, series, events, locations, docs, ideas  | Products + Content           |
| `community`  | Community  | 20    | main     | Member conversation and moderation: spaces, comments, reviews, reports, feedback | —                            |
| `people`     | People     | 30    | main     | Accounts: users, workspaces, licensees                                           | Customers                    |
| `sales`      | Sales      | 40    | main     | Pipeline: CRM accounts, contacts, leads, opportunities, quotes                   | —                            |
| `support`    | Support    | 50    | main     | Client service: portal tickets and requests, cases, conversations, AI agent      | Inbox                        |
| `operations` | Operations | 60    | main     | Running the work: projects, bookings, checklists, time, acknowledgments          | —                            |
| `commerce`   | Commerce   | 70    | main     | Money in: plans, coupons, subscriptions, invoices, loyalty, module catalog       | Orders + Discounts + Finance |
| `marketing`  | Marketing  | 80    | main     | Reaching people: push, email campaigns, banners, forms, referrals, social feeds  | Growth                       |
| `insights`   | Insights   | 90    | main     | Analytics, reports, Ask Your Data                                                | Analytics                    |
| `channels`   | Channels   | 100   | main     | Where the product shows up: pages, redirects, navigation, app, AI agents         | Sales channels               |
| `settings`   | Settings   | 1000  | settings | Configuration (admins)                                                           | Settings                     |
| `system`     | System     | 1100  | settings | Operation of the site: modules, updates, logs, jobs, exports, license (admins)   | Settings › Apps, Plan        |

Adding a section is a kit change (a PR to the registry), never a module's
choice. A module that fits no section puts its pages in its own Modules-zone
group.

### 6.2 Where every catalogue module goes

From the catalogue (#numbers are the catalogue's). "Nav" is what the module
adds to the sidebar; "Elsewhere" is tabs, settings and Home content.

**Free, shipped (29)**: most are core today.

| #   | Module                   | Section › Nav                                                 | Elsewhere                                                             |
| --- | ------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | Platform Core            | —                                                             | System › Modules, Updates, Background Jobs                            |
| 2   | Accounts & Profiles      | People › Users                                                | Settings › Authentication, Profile Fields                             |
| 3   | Workspaces & Teams       | People › Workspaces (§11.3)                                   | Users › Workspaces tab                                                |
| 4   | Billing with Stripe      | Commerce › Plans, Coupons, Subscriptions                      | Users › Subscriptions tab; Stripe Connector in Settings › Connections |
| 9   | Notifications & Push     | Marketing › Push Notifications                                | Users › Preferences; Home attention (failed pushes)                   |
| 10  | AI Chat                  | Modules › AI Chat (Overview, Skills, Settings)                | Slack and Sendblue Connectors                                         |
| 11  | Admin Dashboard          | Home                                                          | The whole of this plan                                                |
| 12  | Navigation & Layouts     | Channels › Navigation                                         |                                                                       |
| 13  | Pages & Widgets          | Channels › Pages                                              |                                                                       |
| 14  | Theming                  | Settings › Theme Settings                                     | Themes the admin too (§13)                                            |
| 15  | Hosting & Deployment     | System › Updates                                              |                                                                       |
| 16  | Code Export & Ownership  | —                                                             |                                                                       |
| 17  | AI Coding Agent Support  | —                                                             |                                                                       |
| 18  | AI Admin Connector (MCP) | Channels › AI Agents                                          |                                                                       |
| 19  | Testing & CI             | —                                                             |                                                                       |
| 22  | Docs with Ask AI         | Content › Docs                                                | Settings in System › Modules › Docs                                   |
| 23  | Dashboard                | — (app home `/a`)                                             | Its widgets are app widgets, not admin widgets                        |
| 24  | Marketing Site & SEO     | Channels › Pages, Redirects                                   | SEO tab on public content                                             |
| 25  | Articles                 | Content › Posts                                               |                                                                       |
| 26  | Events                   | Content › Events                                              | Locations › Events tab                                                |
| 27  | Forms & Submissions      | Marketing › Forms                                             | Forms › Submissions tab                                               |
| 28  | Reminders                | —                                                             | Settings only                                                         |
| 29  | Onboarding               | Channels › App Onboarding                                     |                                                                       |
| 30  | FAQ                      | Content › FAQs (when it has a collection; today a page block) |                                                                       |
| 31  | About, Team & Contact    | Channels › Pages (page templates)                             |                                                                       |
| 32  | Custom Code              | —                                                             |                                                                       |
| 33  | Background Jobs          | System › Background Jobs                                      | Home attention (failed jobs)                                          |
| 34  | Favorites                | —                                                             | App-side (`public.content_favorites`)                                 |
| 35  | Advanced Config          | System › Advanced Config                                      |                                                                       |

**Free, to build (22)**

| #   | Module                           | Section › Nav                                         | Elsewhere                                                            |
| --- | -------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| 36  | Notifications · Email            | Settings › Email (provider, templates)                | Email template previews in a drawer                                  |
| 37  | Billing · RevenueCat             | — (connector)                                         | Settings › Connections; tab on Plans                                 |
| 39  | Analytics                        | Insights › Analytics (view)                           | KPI widgets on Home                                                  |
| 40  | Documents                        | Content › Documents                                   | Folders on; client sharing tab added by Client Portal                |
| 41  | 2FA & Passkeys                   | —                                                     | Settings › Authentication › Security tab; Users › Security tab       |
| 43  | Monitoring                       | System › Monitoring (view)                            | Home attention (error spikes)                                        |
| 47  | OTA Updates                      | Channels › App Updates                                |                                                                      |
| 48  | Connections                      | Settings › Connections (hub)                          | Replaces the kit's interim Connections view                          |
| 49  | Data Export                      | System › Exports                                      | Export action on list views (§23.5)                                  |
| 53  | Webhooks & API Keys              | Settings › Developers                                 |                                                                      |
| 57  | Camera & QR                      | —                                                     | Native only                                                          |
| 60  | Map & Locations                  | Content › Locations                                   | Map preview in the Location side panel                               |
| 63  | Media & Podcasts (native)        | Content › Videos, Audio, Photos                       | Users › Private Feeds tab                                            |
| 64  | Search                           | — (header Search button)                              | System › Search Index                                                |
| 66  | AI Module Builder                | Modules › AI Module Builder                           |                                                                      |
| 69  | Settings & Localization          | Settings › Languages & Region                         | Payload `localization` + admin `i18n`                                |
| 70  | Store Compliance                 | Settings › Privacy & Compliance                       |                                                                      |
| 81  | Scheduled & Personalized Content | —                                                     | Audience tab on content; schedule is Payload's                       |
| 82  | Content Sync                     | Modules › Content Sync (Sources, Sync Runs, Settings) | Synced items land in Content                                         |
| 83  | Web View & Links                 | Channels › Web Views                                  |                                                                      |
| 84  | Social Feeds & Links             | Marketing › Social Feeds                              |                                                                      |
| 85  | AI Writing Assistant             | —                                                     | A rich-text toolbar action and a field button (§23.8); Settings › AI |

**Business, $999 (25)**

| #   | Module                     | Section › Nav                                                     | Elsewhere                                                      |
| --- | -------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| 5   | CRM                        | Sales › CRM (family: Accounts, Contacts, Leads, Opportunities)    | Support › Cases (CRM cases); HubSpot and Salesforce Connectors |
| 6   | Client Portal              | Support › Client Portal (family: Tickets, Requests, Messages)     | Documents › Sharing tab; Quotes tab on Accounts                |
| 7   | Projects                   | Operations › Projects (family: Projects, Tasks)                   | GitHub, Linear, Notion, Monday Connectors                      |
| 8   | Feedback                   | Community › Feedback (family: Boards, Roadmap, Changelog)         | Linear Connector                                               |
| 38  | App Store Publishing       | Channels › App Store                                              | Home attention (submission rejected)                           |
| 42  | Quotes & E-sign            | Sales › Quotes (family: Quotes, Price Book)                       | DocuSign Connector                                             |
| 44  | Audit Log                  | System › Audit Log                                                | **Activity** document tab on every collection (§10.3)          |
| 45  | Roles & Permissions        | Settings › Roles & Permissions                                    | Drives nav and widget visibility (§25)                         |
| 46  | Booking                    | Operations › Bookings (family: Bookings, Services, Availability)  | Calendar Sync Connector                                        |
| 54  | Automations                | Modules › Automations (Rules, Run Log, Settings)                  | Zapier/Make Connector                                          |
| 58  | Reports                    | Insights › Reports                                                | KPI widgets on Home; scheduled digests                         |
| 59  | AI Service Agent           | Support › AI Agent (drafts to review)                             | Settings in System › Modules                                   |
| 61  | Courses                    | Content › Courses (family: Courses, Lessons, Enrollments) (§22.3) | Users › Enrollments tab                                        |
| 62  | Checklists & Audits        | Operations › Checklists (family: Checklists, Audits)              |                                                                |
| 65  | Invoicing                  | Commerce › Invoices                                               | Users and CRM Accounts › Invoices tab; QuickBooks Connector    |
| 78  | Time Tracking              | Operations › Time Entries                                         | Projects › Time tab                                            |
| 79  | Email Campaigns            | Marketing › Email Campaigns (family: Campaigns, Segments)         | Uses Notifications · Email                                     |
| 80  | Acknowledgments            | Operations › Acknowledgments                                      |                                                                |
| 86  | Loyalty & Club             | Commerce › Loyalty (family: Programs, Rewards)                    | Users › Loyalty tab                                            |
| 87  | Member ID & Digital Wallet | Commerce › Member Cards                                           | Users › Member Card tab                                        |
| 88  | Community                  | Community › Spaces, Community Posts                               | Today's core community collections move here (§22)             |
| 89  | Messaging & Video Calls    | Support › Conversations                                           |                                                                |
| 90  | Referrals                  | Marketing › Referrals                                             | Users › Referrals tab                                          |
| 91  | Ask Your Data              | Insights › Ask Your Data (view)                                   |                                                                |
| 92  | Consent Toolkit            | Settings › Privacy & Compliance                                   | Users › Consent tab                                            |

**Connectors (13 + the kit's adapters):** never in the sidebar. Each shows in
**Settings › Connections** with its status and adds a tab to its parent
module's settings (and, where useful, to a parent record, e.g. the Stripe tab
on a Plan). In labels they're "<System> Connector" ("Stripe Connector",
"Slack Connector").

**Enterprise controls (3):** Single Sign-On and Directory Sync add tabs to
Settings › Authentication; Organization Hierarchy adds tabs to People ›
Workspaces and to Roles & Permissions.

**Marketplace and recipes:** same manifest rules. A marketplace module
chooses a section key or its own Modules-zone group; recipes built by the AI
Module Builder default to the Modules zone until a person places them.

---

## 7. Full site map

Legend: `[core]` kit core · `[mod:x]` existing module · `[mod:x]*` new module
extracted from core (§22) · `(view)` custom Payload view · `(global)` Payload
global · `#` count pill · ↳ child, reached through its parent's tab (not in
the nav, `admin.group: false`). URLs use the aligned slugs (§16).

### 7.1 Kit, every module of today's kit installed

```
/admin
├─ Home                                  /admin                              [core]
├─ Browse by Folder                      /admin/browse-by-folder             [Payload]
│
├─ Content
│  ├─ Posts                              /admin/collections/posts            [core]
│  ├─ Videos                             /admin/collections/videos           [mod:media-podcasts]*
│  ├─ Audio                              /admin/collections/audio            [mod:media-podcasts]*
│  ├─ Photos                             /admin/collections/photos           [mod:media-podcasts]*
│  ├─ Series                             /admin/collections/series           [core]
│  │   ↳ Lessons                         /admin/collections/lessons          [core] (Series › Lessons tab)
│  ├─ Events                             /admin/collections/events           [mod:events]*
│  ├─ Locations                          /admin/collections/locations        [mod:maps]*
│  ├─ Docs                               /admin/collections/docs             [mod:docs]
│  ├─ Categories                         /admin/collections/categories       [core]
│  │   ↳ Tag Groups                      /admin/collections/tag-groups       [core] (family tab)
│  └─ Media                              /admin/collections/media            [core]
│
├─ Community
│  ├─ Space Groups                       /admin/collections/space-groups     [mod:community]*
│  │   ↳ Spaces                          /admin/collections/spaces           [mod:community]* (Space Groups › Spaces tab)
│  ├─ Community Posts                    /admin/collections/community-posts  [mod:community]*
│  ├─ Comments                           /admin/collections/comments         [core]
│  ├─ Reviews                            /admin/collections/reviews          [core] (only with a reviewable type)
│  └─ Reports                  # open    /admin/collections/reports          [core]
│
├─ People
│  ├─ Users                              /admin/collections/users            [core]
│  │   ↳ Enrollments                     /admin/collections/enrollments      [core] (Users › Enrollments tab)
│  │   ↳ Private Feeds                   /admin/collections/private-feeds    [mod:media-podcasts]* (Users › Private Feeds tab)
│  └─ Workspaces                         /admin/collections/workspaces       [core] (new mirror, phase 3)
│
├─ Commerce
│  ├─ Plans                              /admin/collections/plans            [mod:billing]
│  ├─ Coupons                            /admin/collections/coupons          [mod:billing]
│  ├─ Subscriptions            # past due /admin/collections/subscriptions   [mod:billing]
│  └─ Billing Settings                   /admin/modules/billing/settings     [mod:billing] admin
│
├─ Marketing
│  ├─ Push Notifications       # failed  /admin/collections/push-notifications [core]
│  ├─ Banners                            /admin/collections/banners          [core]
│  └─ Forms                              /admin/collections/forms            [core: form-builder]
│      ↳ Form Submissions                /admin/collections/form-submissions (Forms › Submissions tab)
│
├─ Channels
│  ├─ Pages                              /admin/collections/pages            [core]
│  ├─ Legal Pages                        /admin/collections/legal-pages      [core]
│  ├─ Redirects                          /admin/collections/redirects        [core: plugin-redirects]
│  ├─ Navigation                         /admin/collections/navigation       [core]
│  │   ↳ App Navigation (global)         /admin/globals/app-navigation       (Navigation › iOS & Android App tab)
│  ├─ App Onboarding                     /admin/collections/app-onboarding   [core]
│  └─ AI Agents                          /admin/ai-agents (view)             [core] admin
│
├─ ── Modules ──
│  └─ AI Chat
│     ├─ Overview                        /admin/modules/chat (view)          [mod:chat]
│     ├─ Skills                          /admin/collections/chat-skills      [mod:chat]
│     └─ Settings                        /admin/modules/chat/settings        [mod:chat] admin
│
├─ Settings                                                                  admin
│  ├─ All Settings                       /admin/settings (view)              [core]
│  ├─ Site Settings                      /admin/globals/site-settings        [core]
│  ├─ Theme Settings                      /admin/globals/theme-settings       [core]
│  ├─ Authentication                     /admin/globals/authentication       [core]
│  ├─ Profile Fields                     /admin/globals/profile-fields       [core]
│  ├─ AI Settings                        /admin/globals/ai-settings          [core]
│  └─ Connections                        /admin/connections (view)           [core] (interim until module #48)
│
└─ System                                                                    admin
   ├─ Modules                            /admin/collections/modules          [core]
   ├─ Updates                  # avail.  /admin/updates (view)               [core]
   ├─ Background Jobs          # failed  /admin/collections/payload-jobs     [Payload jobs]
   ├─ Exports                            /admin/collections/exports          [core: plugin-import-export] (phase 1b)
   ├─ Search Index                       /admin/collections/search-index     [mod:search] (phase 5)
   └─ Site License                       /admin/globals/site-license         [core]
```

Hidden (`admin.hidden`, no routes): `tags` (managed inline in Tag Groups),
`payload-query-presets` (managed from each list's Presets menu), every
`mod-*-settings` global (rendered on the module's settings page), the
import plugin's `imports`.

### 7.2 Kit, minimal install

```
Home · Browse by Folder
Content     Posts · Series · Categories · Media
Community   Comments · Reports
People      Users
Marketing   Push Notifications · Banners · Forms
Channels    Pages · Legal Pages · Redirects · Navigation · App Onboarding
Settings    All Settings · Site Settings · Theme Settings · Authentication ·
            Profile Fields · AI Settings · Connections
System      Modules · Updates · Background Jobs · Site License
```

No Sales, Support, Operations, Commerce or Insights sections; no Modules zone;
Reviews hidden (nothing reviewable).

### 7.3 meet-dream after this plan

```
Home · Browse by Folder
Content     Posts · Videos · Audio · Photos · Series · Events · Locations ·
            Docs · Ideas · Categories · Media        (Q1: which media modules stay)
Community   Space Groups · Community Posts · Comments · Reviews · Reports
People      Users · Workspaces · Licensed Sites
Commerce    Plans · Coupons · Subscriptions · Module Catalog · Billing Settings
Marketing   Push Notifications · Banners · Forms
Channels    Pages · Legal Pages · Redirects · Navigation · App Onboarding · AI Agents
── Modules ──
AI Chat              Overview · Skills · Settings
Developer Accounts   Overview · Settings
Settings    All Settings · Site Settings · Theme Settings · Authentication ·
            Profile Fields · AI Settings · Connections
System      Modules · Updates · Background Jobs · Exports · Site License
```

| meet-dream entity                 | Today             | After                                                      |
| --------------------------------- | ----------------- | ---------------------------------------------------------- |
| `ideas`                           | Content           | Content › Ideas (family head), via a local `ideas` module  |
| `idea-categories`                 | Content           | ↳ Ideas › Categories family tab                            |
| `idea-shares`                     | Content           | ↳ Ideas › Shares tab on each idea (join)                   |
| `mod-modules-catalog` ("Modules") | Commerce          | Commerce › Module Catalog, slug `module-catalog`           |
| `mod-modules-releases`            | Commerce          | ↳ Module Catalog › Releases tab, slug `module-releases`    |
| `mod-modules-sites` ("Kit sites") | Commerce          | People › Licensed Sites, slug `licensed-sites`             |
| `dev-accounts`                    | settings on a row | Modules › Developer Accounts (Overview, Settings)          |
| `intercom`                        | settings on a row | Settings › Connections › Intercom Connector (no nav group) |

Developer Accounts isn't launched: its admin group can exist for staff, but its
founder-facing app menu entry stays off until launch (`docs/context/DREAM.md`).

### 7.4 Full catalogue (end state, every Business module installed)

```
Content     Posts · Videos · Audio · Photos · Series · Courses · Events ·
            Locations · Docs · Documents · FAQs · Categories · Media
Community   Space Groups · Community Posts · Feedback · Comments · Reviews · Reports
People      Users · Workspaces
Sales       CRM · Quotes
Support     Client Portal · Cases · Conversations · AI Agent
Operations  Projects · Bookings · Checklists · Time Entries · Acknowledgments
Commerce    Plans · Coupons · Subscriptions · Invoices · Loyalty · Member Cards ·
            Billing Settings
Marketing   Push Notifications · Email Campaigns · Banners · Forms · Referrals ·
            Social Feeds
Insights    Analytics · Reports · Ask Your Data
Channels    Pages · Legal Pages · Redirects · Navigation · App Onboarding ·
            App Store · App Updates · Web Views · AI Agents
── Modules ──
AI Chat · AI Module Builder · Automations · Content Sync
Settings    All Settings · Site Settings · Theme Settings · Authentication ·
            Roles & Permissions · Profile Fields · Languages & Region · Email ·
            Privacy & Compliance · AI Settings · Connections · Developers
System      Modules · Updates · Audit Log · Monitoring · Background Jobs ·
            Exports · Search Index · Advanced Config · Site License
```

Even at 127 modules, no section has more than eight links, because children
live in family tabs (§9).

---

## 8. Section-by-section menu spec

`Order` sorts links in a section (gaps of 10 leave room for modules). Roles:
A admin, E editor, Au author (until Roles & Permissions replaces them, §25).
"Was" shows today's label or slug where it changes.

### 8.1 Zone A

| Order | Label            | URL                       | Roles  | Notes                     |
| ----- | ---------------- | ------------------------- | ------ | ------------------------- |
| 0     | Home             | `/admin`                  | A E Au | New `beforeNavLinks` link |
| 5     | Browse by Folder | `/admin/browse-by-folder` | A E Au | Payload folders (beta)    |

### 8.2 Content (10)

| Order | Label      | Slug         | Owner              | Roles  | Children (tabs)                                                         | Was                             |
| ----- | ---------- | ------------ | ------------------ | ------ | ----------------------------------------------------------------------- | ------------------------------- |
| 10    | Posts      | `posts`      | core               | A E Au |                                                                         |                                 |
| 20    | Videos     | `videos`     | `media-podcasts`*  | A E Au |                                                                         |                                 |
| 30    | Audio      | `audio`      | `media-podcasts`*  | A E Au |                                                                         |                                 |
| 40    | Photos     | `photos`     | `media-podcasts`*  | A E Au |                                                                         |                                 |
| 50    | Series     | `series`     | core               | A E Au | Lessons (courses), Episodes (podcast shows), Videos (seasons/playlists) |                                 |
| 55    | Courses    | `courses`    | `courses` (#61)    | A E    | Lessons, Enrollments                                                    | (Series of kind Course, §22.3)  |
| 60    | Events     | `events`     | `events`*          | A E Au | Reviews                                                                 |                                 |
| 70    | Locations  | `locations`  | `maps`*            | A E    | Events, Reviews                                                         |                                 |
| 80    | Docs       | `docs`       | `docs`             | A E Au |                                                                         | Documentation, `mod-docs-pages` |
| 85    | Documents  | `documents`  | `documents` (#40)  | A E    | Sharing (Client Portal)                                                 |                                 |
| 87    | Ideas      | `ideas`      | meet-dream `ideas` | A E    | Shares; family tab Categories                                           |                                 |
| 900   | Categories | `categories` | core               | A E    | family tab Tag Groups                                                   |                                 |
| 920   | Media      | `media`      | core               | A E Au |                                                                         |                                 |

### 8.3 Community (20)

| Order | Label           | Slug              | Owner           | Roles | Pill         | Children (tabs)            | Was                                    |
| ----- | --------------- | ----------------- | --------------- | ----- | ------------ | -------------------------- | -------------------------------------- |
| 10    | Space Groups    | `space-groups`    | `community`*    | A E   |              | Spaces                     | Spaces were `community-spaces`, hidden |
| 20    | Community Posts | `community-posts` | `community`*    | A E   |              | Comments                   |                                        |
| 30    | Feedback        | (module's)        | `feedback` (#8) | A E   |              | Boards, Roadmap, Changelog |                                        |
| 40    | Comments        | `comments`        | core            | A E   | pending (Q3) |                            |                                        |
| 50    | Reviews         | `reviews`         | core            | A E   |              |                            | was under People                       |
| 60    | Reports         | `reports`         | core            | A E   | open (error) |                            |                                        |

### 8.4 People (30)

| Order | Label          | Slug             | Owner                | Roles | Children (tabs)                                                              | Was          |
| ----- | -------------- | ---------------- | -------------------- | ----- | ---------------------------------------------------------------------------- | ------------ |
| 10    | Users          | `users`          | core                 | A     | Enrollments, Private Feeds, Subscriptions, Workspaces, + module tabs (§11.2) |              |
| 20    | Workspaces     | `workspaces`     | core (mirror, new)   | A     | Members, Subscriptions                                                       | not in admin |
| 30    | Licensed Sites | `licensed-sites` | meet-dream `modules` | A     |                                                                              | Kit sites    |

Enrollments (`enrollments`) and Private Feeds (`private-feeds`, was Feed
Tokens) leave the nav: `admin.group: false`, managed from the user's tabs.
Cross-user lists stay one click away through saved views on Users (§23.1) and
direct URLs.

### 8.5 Sales (40), Support (50), Operations (60), Insights (90)

Empty in today's kit. Populated by catalogue modules as listed in §6.2. Each
family head is one nav link; its children are tabs (§9).

### 8.6 Commerce (70) — owned by `billing`

| Order | Label            | Slug                              | Owner                | Roles | Pill                              | Children (tabs)                       | Was                                |
| ----- | ---------------- | --------------------------------- | -------------------- | ----- | --------------------------------- | ------------------------------------- | ---------------------------------- |
| 10    | Plans            | `plans`                           | `billing`            | A     |                                   | Subscriptions, Stripe (connector tab) | Billing Plans, `mod-billing-plans` |
| 20    | Coupons          | `coupons`                         | `billing`            | A     |                                   | Redemptions (Q5)                      | Billing Coupons                    |
| 30    | Subscriptions    | `subscriptions`                   | `billing`            | A     | past due (warning)                |                                       | hidden today                       |
| 40    | Module Catalog   | `module-catalog`                  | meet-dream `modules` | A     |                                   | Releases                              | Modules (Commerce)                 |
| 990   | Billing Settings | `/admin/modules/billing/settings` | `billing`            | A     | error when Stripe isn't connected |                                       | Modules › Billing row              |

### 8.7 Marketing (80)

| Order | Label              | Slug                 | Owner        | Roles | Pill                 | Children (tabs) | Was           |
| ----- | ------------------ | -------------------- | ------------ | ----- | -------------------- | --------------- | ------------- |
| 10    | Push Notifications | `push-notifications` | core         | A E   | failed sends (error) | Deliveries (Q5) | Notifications |
| 20    | Banners            | `banners`            | core         | A E   |                      |                 |               |
| 30    | Forms              | `forms`              | form-builder | A E   |                      | Submissions     |               |

### 8.8 Channels (100)

| Order | Label          | Slug / URL         | Owner            | Roles | Children (tabs)                           | Was                          |
| ----- | -------------- | ------------------ | ---------------- | ----- | ----------------------------------------- | ---------------------------- |
| 10    | Pages          | `pages`            | core             | A E   |                                           | was under Marketing          |
| 15    | Legal Pages    | `legal-pages`      | core             | A E   |                                           | Legal, `legal`, under System |
| 20    | Redirects      | `redirects`        | plugin-redirects | A E   |                                           | new (§23.6)                  |
| 30    | Navigation     | `navigation`       | core             | A     | Web App · iOS & Android App (family tabs) | `nav-items`, under Modules   |
| 40    | App Onboarding | `app-onboarding`   | core             | A E   |                                           | Onboardings, `onboarding`    |
| 50    | AI Agents      | `/admin/ai-agents` | core             | A     |                                           | new view (§11.25)            |

### 8.9 Modules zone (100+ by name)

| Group              | Links                        | Owner                     | Roles           |
| ------------------ | ---------------------------- | ------------------------- | --------------- |
| AI Chat            | Overview · Skills · Settings | `chat`                    | A (Skills: A E) |
| Developer Accounts | Overview · Settings          | meet-dream `dev-accounts` | A               |

### 8.10 Settings (1000) — admins

| Order | Label          | URL                         | Was                                           |
| ----- | -------------- | --------------------------- | --------------------------------------------- |
| 0     | All Settings   | `/admin/settings` (view)    | new                                           |
| 10    | Site Settings  | `globals/site-settings`     |                                               |
| 20    | Theme Settings | `globals/theme-settings`    | Theme (label only; slug unchanged)            |
| 30    | Authentication | `globals/authentication`    | `authentication-settings`                     |
| 40    | Profile Fields | `globals/profile-fields`    |                                               |
| 60    | AI Settings    | `globals/ai-settings`       | Image Generation, `image-generation-settings` |
| 70    | Connections    | `/admin/connections` (view) | new; module #48 takes it over                 |

### 8.11 System (1100) — admins

| Order | Label           | URL                        | Pill           | Was                                      |
| ----- | --------------- | -------------------------- | -------------- | ---------------------------------------- |
| 10    | Modules         | `collections/modules`      |                | `kit-modules`, under Modules             |
| 20    | Updates         | `/admin/updates`           | available      | loose link                               |
| 30    | Background Jobs | `collections/payload-jobs` | failed (error) | not in admin (Payload's jobs collection) |
| 40    | Exports         | `collections/exports`      |                | new (§23.5)                              |
| 50    | Search Index    | `collections/search-index` |                | new (§23.7)                              |
| 90    | Site License    | `globals/site-license`     |                | `dream-site`, under System               |

### 8.12 Gear menu (`settingsMenu`)

`PopupList.ButtonGroup` with: All Settings · Modules · Updates · Your Account
(Payload account view). Admins see all four; staff see Your Account.

---

## 9. Families: nesting related collections

A **family** is a parent collection plus children that only make sense inside
it. The nav shows the parent only. Children are managed from the parent's
page and keep their own URLs.

### 9.1 Rules

1. A collection is a **child** when every record belongs to one parent record
   and staff rarely need it across parents. Children get `admin.group: false`
   (no nav link, routes still work) and `admin.custom.navParent: '<parent>'`
   so the nav highlights the parent.
2. A **record-level child** (lessons of a series, enrollments of a user)
   appears as a **join field** inside a tab of the parent's edit view (§10.2):
   Payload's table with Add New (in a document drawer) and links to each
   child. Store the relationship on the child only (Payload's join guidance).
3. A **collection-level sibling** that needs its own list (Tag Groups next to
   Categories, Space Groups and Spaces, Web App and iOS & Android menus) gets
   **family tabs** above both lists (§10.1).
4. Cross-parent lists (every enrollment) are **saved views** (query presets)
   linked from the parent list's Presets menu, never a second nav item.
5. Children's edit pages show a breadcrumb through the parent (`setStepNav`):
   Content › Series › "Intro to Pottery" › Lesson 3.

### 9.2 Family table

| Family head        | Children                                                                             | How children appear                                                                  |
| ------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Users              | Enrollments, Private Feeds, Subscriptions, workspace memberships, module tabs        | Edit-view tabs with join fields (§11.2)                                              |
| Series             | Lessons (kind Course), Audio episodes (kind Podcast Show), Videos (Season, Playlist) | Edit-view tab, shown by kind (`admin.condition`)                                     |
| Courses (#61)      | Lessons, Enrollments                                                                 | Edit-view tabs; family tabs Courses · Lessons · Enrollments                          |
| Locations          | Events, Reviews                                                                      | Edit-view tabs (joins)                                                               |
| Events             | Reviews, Registrations (when built)                                                  | Edit-view tabs                                                                       |
| Categories         | Tag Groups (sibling), Tags (inline in Tag Groups)                                    | Family tabs Categories · Tag Groups                                                  |
| Space Groups       | Spaces                                                                               | Edit-view tab (join); family tabs Space Groups · Spaces                              |
| Community Posts    | Comments on the post                                                                 | Edit-view tab (join, filtered)                                                       |
| Forms              | Form Submissions                                                                     | Edit-view tab (join, exists today)                                                   |
| Plans              | Subscriptions on the plan                                                            | Edit-view tab (join)                                                                 |
| Navigation         | App Navigation global                                                                | Family tabs Web App · iOS & Android App                                              |
| Module Catalog     | Module Releases                                                                      | Edit-view tab (join); family tabs                                                    |
| Ideas (meet-dream) | Idea Shares; Idea Categories (sibling)                                               | Edit-view tab; family tabs Ideas · Categories                                        |
| CRM (#5)           | Accounts · Contacts · Leads · Opportunities                                          | Family tabs; Account edit view tabs Contacts, Opportunities, Cases, Quotes, Invoices |
| Client Portal (#6) | Tickets · Requests · Messages                                                        | Family tabs                                                                          |
| Projects (#7)      | Projects · Tasks                                                                     | Family tabs; Project edit view tabs Tasks, Time                                      |
| Bookings (#46)     | Bookings · Services · Availability                                                   | Family tabs                                                                          |
| Feedback (#8)      | Boards · Roadmap · Changelog                                                         | Family tabs                                                                          |
| Modules (System)   | each module's settings page                                                          | Module row page (§21.2)                                                              |

---

## 10. Page anatomy and tab menus

Three kinds of tabs, each with one job:

| Kind              | Where it shows                               | Payload mechanism                                                          | Use for                                                                               |
| ----------------- | -------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Family tabs**   | Above a list view, under the title           | Kit `FamilyTabs` component in `admin.components.beforeList` of each member | Switching between sibling lists of one family (Categories · Tag Groups)               |
| **Field tabs**    | Inside a document's Edit view                | `type: 'tabs'` field (named or unnamed tabs)                               | A document's own fields grouped by topic, and related records via joins               |
| **Document tabs** | Next to Edit / Versions / API / Live Preview | `admin.components.views.edit.<key>` with `tab: { label, order }`           | Pages about the document that aren't the form: Activity, Analytics, Preview, Sync Log |

Rules:

- Field tabs save together with the form; document tabs never contain form
  fields.
- At most **seven** field tabs; the first is the one people use most.
- A tab that's empty for this record is hidden (`admin.condition`), not shown
  blank.
- Join tabs show the count in the label ("Lessons (12)") through the join's
  `components.Label`.
- Tab labels are Title Case nouns (§14.1).

### 10.1 List view anatomy

```
Breadcrumb: Content / Series
Series                                        [Create New]   [⋯ list menu]
Series, seasons, playlists, albums, podcast shows and courses.     ← description, ≤ 2 sentences
[ Series | Lessons ]                                          ← family tabs (only in families)
[Stats row: optional beforeListTable, ≤ 4 numbers]            ← e.g. Subscriptions
[Presets ▾] [Search…] [Columns] [Filters] [Group By]          ← Payload list controls
┌ table (3–5 default columns; title first; status as Pill) ┐
└ pagination: 25 per page                                   ┘
```

- **List menu (⋯)** (`listMenuItems`): Export, collection-level actions
  (Regenerate All Images, Reindex, Resync Catalog). Never create or delete.
- **Bulk actions**: Payload's selection bar (Edit, Publish, Unpublish, Delete).
  `disableBulkEdit` on collections where bulk edit is unsafe (Users roles,
  Plans prices).

### 10.2 Edit view anatomy

```
Breadcrumb: Content / Series / Intro to Pottery
Intro to Pottery   [Published]          [Preview] [custom buttons…] [Save Draft] [Publish] [⋯]
[ Edit | Live Preview | Versions | Activity | API ]                 ← document tabs
┌ main ──────────────────────────────┐ ┌ side panel ────────────────────┐
│ [ Content | Media | Lessons (12) | │ │ Status, Slug, Publish Date,    │
│   SEO | Settings ]   ← field tabs  │ │ Author, Kind, Categories,      │
│ fields…                             │ │ Access Level, read-only facts  │
└─────────────────────────────────────┘ └────────────────────────────────┘
```

- **Custom buttons** (`beforeDocumentControls`): at most two, the actions
  people take every week on this kind of record (Change Password, Resend
  Invite, Send Test, Resolve).
- **⋯ menu** (`editMenuItems`, `PopupList.Button`): rarer actions (Copy ID,
  Resync with Stripe, View on Site, Duplicate). Destructive actions last.
- **Side panel** (`admin.position: 'sidebar'`): status and short metadata only
  (§12.1). Never forms with their own submit, never secrets.

### 10.3 Standard tab sets

| Page type                                                                 | Field tabs (in order)                                           | Document tabs (after Edit)                 |
| ------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------ |
| Published content (Posts, Videos, Audio, Photos, Events, Locations, Docs) | Content · Media · Details · SEO (plugin `tabbedUI`) · Audience* | Live Preview · Versions · Activity† · API‡ |
| Container (Series, Courses, Space Groups)                                 | Overview · <children (count)> · Media · SEO                     | Live Preview · Versions · Activity† · API‡ |
| Pages / Legal Pages                                                       | Content (blocks) · SEO · Settings                               | Live Preview · Versions · Activity† · API‡ |
| People (Users, Workspaces)                                                | see §11.2 / §11.3                                               | Activity† · API‡                           |
| Commerce (Plans, Coupons)                                                 | Details · Pricing · <provider tabs> · <children>                | Versions · Activity† · API‡                |
| Moderation (Reports, Comments, Reviews)                                   | Details · Target · History                                      | Activity†                                  |
| Settings globals                                                          | one tab per topic                                               | Versions · Activity† · API‡                |

\* added by Scheduled & Personalized Content (#81). † added by Audit Log
(#44) to every collection and global. ‡ API tab only for admins (Payload's
`hideAPIURL` for others).

---

## 11. Page-by-page UX spec

"Today → Proposed" per page. Every item uses Payload components and the
overlay rules in §12.

### 11.1 Home

See §18.

### 11.2 Users (People › Users)

**List**

- Columns: Display Name · Email · Roles · Account Status · Last Active.
- Saved views (shared): **Members**, **Staff**, **Invited**, **Suspended**,
  **Enrollments (all)** (opens the Enrollments list), **Private Feeds (all)**.
- Group By: Account Status, Roles.
- ⋯ list menu: Export (admins), Backfill Users (runs `cms:backfill-users` as a
  job; confirmation modal).
- Bulk: Add Tag (drawer), Resend Invites (confirmation modal). Bulk edit of
  roles is disabled (`disableBulkEdit` on the roles field path, or a field
  `access.update` that rejects bulk).

**Edit view**

```
Jane Doe   [Active]            [Change Password] [Resend Invite*] [Save] [⋯]
[ Edit | Activity | API ]
┌ main ───────────────────────────────────────────┐ ┌ side panel ──────────────┐
│ [ Profile | Contact | Preferences | Tags |       │ │ Avatar (preview)         │
│   Subscriptions | Enrollments | Private Feeds |  │ │ Roles                    │
│   Workspaces ]                                   │ │ Account Status           │
│                                                  │ │ Last Active (read-only)  │
│                                                  │ │ Created (Payload)        │
│                                                  │ │ ▸ Technical: Supabase    │
│                                                  │ │   User ID (copy)         │
└──────────────────────────────────────────────────┘ └──────────────────────────┘
* only when Account Status is Invited
```

| Tab           | Contents                                                                                                       | Source                                               | Today                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| Profile       | Username, names, pronouns, avatar, cover, headline, bio, location, links, interests, visibility, custom fields | core                                                 | same                                                     |
| Contact       | Email, phone, date of birth, timezone, language, address                                                       | core (email moves here from the top)                 | email above the tabs                                     |
| Preferences   | Push, SMS and marketing opt-ins, notification preferences, onboarding                                          | core                                                 | same                                                     |
| Tags          | CMS tags (segmentation) + the User Tags panel (plan-name and billing tags)                                     | core                                                 | tags in Profile; panel loose at the bottom               |
| Subscriptions | Join to Subscriptions (read-only) + Stripe Customer ID (read-only)                                             | **billing** module tab; Stripe Connector adds the ID | "Billing" tab with only the ID; join loose at the bottom |
| Enrollments   | Join to Enrollments (Add New opens a drawer)                                                                   | courses (core today)                                 | join loose at the bottom; own nav link                   |
| Private Feeds | Join to Private Feeds: show, last used, Revoke                                                                 | media-podcasts module tab                            | own nav link "Feed Tokens"                               |
| Workspaces    | Workspace memberships and roles (read-only, link to each workspace)                                            | core (phase 3)                                       | none                                                     |
| Security*     | 2FA status, passkeys, sessions, Sign Out Everywhere                                                            | 2FA & Passkeys (#41)                                 | none                                                     |

\* when the module is installed. Modules add tabs to Users through the
existing `composeCollectionTabs` seam (today used for adapter tabs), so core
`Users.ts` never imports a module (the current `subscriptions` join with its
"delete if you remove billing" comment goes away).

**Actions**

| Action              | Where                                 | Overlay                                  | Notes                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Change Password** | `beforeDocumentControls`, admins      | **Modal**                                | New password + confirm, rules from Authentication (min length), Show toggle; secondary button **Send Reset Email Instead**. Submits to `/api/cms/user-password`; success toast. Replaces the side-panel password field |
| Resend Invite       | `beforeDocumentControls` when Invited | none → toast                             |                                                                                                                                                                                                                        |
| Copy User ID        | ⋯ menu                                | toast                                    |                                                                                                                                                                                                                        |
| View Public Profile | ⋯ menu                                | new tab                                  | when profile visibility allows                                                                                                                                                                                         |
| Sign Out Everywhere | ⋯ menu                                | Confirmation modal                       | revokes Supabase sessions                                                                                                                                                                                              |
| View as User (Q11)  | ⋯ menu, admins                        | Confirmation modal → banner while active | impersonation, audited; catalogue note on Admin Dashboard                                                                                                                                                              |
| Move to Trash       | ⋯ menu (Payload)                      | Payload confirmation                     | admins cannot trash themselves                                                                                                                                                                                         |

### 11.3 Workspaces (People › Workspaces) — new, phase 3

Workspaces live in `public` (RLS). Mirror them into a read-mostly Payload
collection `workspaces` the way users are mirrored (`cms.users`), written
through hooks, so staff get Payload's list, filters, saved views and export.

- List: Name · Owner · Members · Plan · Created.
- Edit tabs: Overview · Members (join to a membership mirror) · Subscriptions
  (billing tab) · Hierarchy (Organization Hierarchy #52) · Activity.
- Buttons: none in v1 (changes happen in the app); ⋯ View in App.

### 11.4 Posts (and every published content type)

- List: Title · Status · Author · Categories · Published. Saved views:
  Drafts, Scheduled, Mine (author = current user, if presets allow it;
  otherwise a "Mine" filter link). Group By: Status, Category.
- Edit: standard tabs (§10.3). Side panel: Status, Slug, Publish Date,
  Author, Categories, Tags, Access Level. Buttons: Payload's Preview, Save
  Draft, Publish / Schedule. ⋯: View on Site, Copy Link, Duplicate.
- Relationship pickers to big collections use `admin.appearance: 'drawer'`.

### 11.5 Videos, Audio, Photos

As §11.4. Audio adds an **Episode** field tab (enclosure, duration,
transcript); Videos a **Playback** tab; Photos bulk upload. Today Audio and
Photos publish on save; they get drafts and scheduling (§23.4).

### 11.6 Series (and Lessons)

- List: Title · Kind · Items · Status. Saved views by kind: Courses, Podcast
  Shows, Playlists, Seasons. Group By: Kind.
- Edit field tabs: Overview · **Lessons (n)** when kind is Course ·
  **Episodes (n)** when Podcast Show · **Videos (n)** when Season or Playlist ·
  Access (plans) · Media · SEO.
- Lessons: no nav link (`admin.group: false`). The Lessons tab is a join with
  Add New (drawer) and `orderable` drag order (join `orderable`, verify on
  3.94). A lesson's breadcrumb goes through its series.
- Feed tokens: the podcast show's **Private Feeds** tab (join filtered by show).

### 11.7 Events and Locations

- Events edit tabs: Content · Schedule (dates with `timezone: true`,
  recurrence, capacity) · Venue · Reviews (n) · SEO.
- Locations edit tabs: Details · Hours · Events (n) · Reviews (n) · SEO. Side
  panel: a static map preview (Map & Locations module) and coordinates.

### 11.8 Categories and Tag Groups

Family tabs **Categories · Tag Groups**. Tags stay inline in a tag group
(array/join), `tags` hidden. ⋯ in Tag Groups: Merge Tags (drawer, later).

### 11.9 Media

- Bulk upload (Payload default), folders on (beta), grid-friendly columns
  (Thumbnail · Filename · Alt · Size · Used In).
- ⋯ list menu: **Regenerate All Images** (moves from a field component to a
  list action; confirmation modal; runs as a job; toast when queued).
- Edit: side panel Copy URL (`CopyToClipboard`, replaces `CopyImageUrl`
  field), focal point, sizes.

### 11.10 Space Groups and Spaces

Family tabs **Space Groups · Spaces**. Space Group edit: Overview · Spaces
(n) (join, orderable). `community-spaces` becomes `spaces`, no longer
`admin.hidden` (it needs routes for its edit page) but `admin.group: false`.

### 11.11 Comments, Reviews, Reports (moderation)

- Reports list: Reason · Target · Reporter · Status · Created. Default saved
  view **Open**. Group By: Reason.
- Report edit: buttons **Resolve** and **Dismiss** (`beforeDocumentControls`);
  ⋯ **Remove Content**, **Suspend User** (confirmation modals naming the
  target). Status becomes read-only in the side panel; actions set it.
- Comments list: Comment (truncated) · On · Author · Status · Created.
  Bulk Hide / Approve when moderation status exists (Q3).
- Reviews: Rating · Target · Author · Created; Owner Response field tab.

### 11.12 Plans, Coupons, Subscriptions

- Plans list: Name · Price · Interval · Sync Status (Pill) · Active. Edit
  tabs: Details · Pricing · Stripe (connector tab) · Subscriptions (n).
  Side panel: Sync Status, last synced, error. ⋯ **Resync with Stripe**
  (toast). Saving a price or interval change opens a **confirmation modal**:
  "This creates a new Stripe price. Existing subscribers keep their current
  price." (custom `SaveButton`).
- Coupons list: Code (with `CopyToClipboard`) · Discount · Duration · Used ·
  Active. Shopify shows "Copy discount code" on hover; ours is a visible copy
  button (touch-friendly).
- Subscriptions: read-only list (§29 Q4) with a stats row (Active · Trialing
  · Canceling · Past Due), saved views per status, Group By Plan.

### 11.13 Push Notifications

- List: Title · Audience · Status · Scheduled For · Sent. Saved views:
  Scheduled, Failed. Group By: Status.
- Edit: field tabs Message · Audience · Schedule. Side panel: a **device
  preview** (UI field rendering the notification as iOS/Android would).
  Button **Send Test to Me** (toast). Schedule uses a date with `timezone: true`.

### 11.14 Banners, App Onboarding

Drafts and scheduling (§23.4). Side panel preview of the banner or screen.
App Onboarding list orderable (drag order = screen order).

### 11.15 Forms

Edit tabs: Fields · Confirmation · Emails · **Submissions (n)** (join, export
from ⋯). ⋯: Copy Embed Code.

### 11.16 Pages, Legal Pages, Redirects

- Pages: blocks layout; Edit is the first tab, Live Preview second.
- Legal Pages move to Channels (editors maintain them; they render under
  `/legal`).
- Redirects: §23.6. Columns From · To · Type · Created By (Automatic / Manual
  pill).

### 11.17 Navigation

Family tabs **Web App · iOS & Android App**. Web App: today's orderable list.
iOS & Android App: the `app-navigation` global (was `native-navigation`,
edited today by a component below the list) with tab-count control and drag
order. `app-navigation` uses `admin.group: false` instead of `hidden` so it
has its own route.

### 11.18 Modules (System › Modules)

- List: Name · Type (Module / Connector pill) · Version · Source · Enabled ·
  Update (pill when available). `formatDocURL` links each row to its module
  page (§21.2). Description holds **Install Module** (drawer, exists).
- Install flow: drawer (catalog) → confirmation modal ("Installs X 1.2.0. A
  pull request is opened; the site redeploys.") → toast.
- Disable: toggle in the module page side panel → confirmation modal naming
  what disappears.
- Uninstall: ⋯ on the module page → confirmation modal with row counts and a
  typed confirmation (module slug).

### 11.19 Updates

Unchanged content, rebuilt in `DefaultTemplate` + `Gutter` with Payload
`Card`s; Update All → confirmation modal.

### 11.20 Background Jobs (new)

Payload's `payload-jobs` collection exposed read-only (jobs collection
overrides: group System, list columns Task · Queue · Status · Wait Until ·
Error). Saved views: Failed, Pending. ⋯ on a failed job: **Retry** (toast).
Note the kit sets `deleteJobOnComplete: true`, so the list shows pending and
failed work only, which is what staff need.

### 11.21 Site Settings, Theme Settings, Authentication, Profile Fields, AI Settings

- Each is one global with topic tabs and Versions (§23.3).
- Theme Settings: tabs Branding · Light · Dark · Typography · Other ·
  **Admin** (Admin Colors: Use Site Theme / Payload Default; Preview in Admin
  toggle, §13.5). Live Preview of the site.
- Authentication: tabs Methods · Sign-Up · Copy · SSO Routing · Security
  (2FA, #41) · Single Sign-On (#50) · Directory Sync (#51). Buttons: **Send
  Test Email** (toast).
- AI Settings: tabs Image Generation · Writing Assistant (#85).
- Globals put buttons in `admin.components.elements` (Payload's globals
  equivalent of `edit`).

### 11.22 Site License

Today: a `DreamSiteRegister` field at the top of the form. Proposed: a status
`Card` in the side panel (Active / Not registered, key prefix, last report)
and a **Register** / **Report Now** button in the document controls (toast).

### 11.23 Connections (interim view)

`/admin/connections`: one `Card` per installed connector (Stripe, Slack,
Sendblue, Intercom, GitHub…): status Pill (Connected / Not Connected / Error),
"Connects to: <service>", Open Settings (→ the parent module's settings tab).
The Connections module (#48) later replaces this view with secrets and sync
runs.

### 11.24 All Settings

§20.1.

### 11.25 AI Agents (Channels)

Status Pill (Enabled / Not configured / Disabled by `MCP_ENABLED`), the MCP
URL with `CopyToClipboard`, a table of connected clients (Name · Connected By
· Last Used · Revoke). Revoke → confirmation modal. Hidden when
`MCP_JWT_SECRET` is unset.

### 11.26 Account (Payload account view)

Add the user's own Change Password (same modal), theme choice (Payload's),
and a link to the app profile. `admin.avatar` shows the profile avatar.

---

## 12. Overlays: popup, modal, drawer, side panel

Payload ships these and uses each in a recognizable way. The kit follows the
same pattern everywhere.

### 12.1 The rules

| Overlay                | Payload component                                                                                     | Use when                                                                                                                                                                                | Never use for                                              | Size and mobile                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------- |
| **Toast**              | `toast` (Sonner, `admin.toast`)                                                                       | Telling the result of an action: saved, queued, copied, failed                                                                                                                          | Anything the user must act on                              | Bottom-right; bottom on phones               |
| **Tooltip**            | `Tooltip`                                                                                             | Explaining an icon, a disabled control or a short term                                                                                                                                  | Required information                                       | Tap shows it on touch                        |
| **Popup**              | `Popup` + `PopupList`                                                                                 | A short menu anchored to a button: ⋯ menus, gear menu, Alerts list, snooze options, ≤ 8 items                                                                                           | Forms; long lists                                          | Anchored; full-width sheet below 400 px      |
| **Confirmation modal** | `ConfirmationModal`                                                                                   | One decision before an irreversible, destructive or costly action: delete, revoke, uninstall, restore a version, price change, resend invites in bulk                                   | Collecting data                                            | Centered; full width minus gutter on phones  |
| **Modal**              | `Modal` + `useModal`                                                                                  | A short focused task of 1–3 fields that doesn't need the page behind it: Change Password, name a preset, snooze until                                                                   | Editing another document; anything over 3 fields           | Same as above                                |
| **Drawer**             | `Drawer`/`DrawerToggler`; `DocumentDrawer`, `ListDrawer` (via join fields and `appearance: 'drawer'`) | Working with another document or a list without leaving the page: create or edit a related doc, pick records, search, install a module, export options, add a widget. Drawers can stack | Simple confirmations                                       | Slides from the right; full screen on phones |
| **Fullscreen modal**   | `FullscreenModal`                                                                                     | Payload's own multi-record flows: Bulk Upload, Edit Many                                                                                                                                | Custom flows (use a page)                                  | Full screen                                  |
| **Side panel**         | fields with `admin.position: 'sidebar'`                                                               | Always-visible status and short metadata of the current document (status, slug, dates, roles, owner, sync status, read-only IDs)                                                        | Forms with their own submit, passwords, long text, actions | Moves below the main column on phones        |
| **Banner**             | `Banner`                                                                                              | Persistent page-level state: disabled module, sync error, update available                                                                                                              | Results of an action (toast)                               | Full width                                   |
| **Page**               | a collection view or a custom view                                                                    | Anything with more than one screen of content, anything worth a URL or a bookmark                                                                                                       |                                                            | —                                            |

Decision order when designing an interaction:

1. Does it need a URL or more than one screen? → **Page** (or a document tab).
2. Is it about another document or a list? → **Drawer**.
3. Is it 1–3 inputs? → **Modal**.
4. Is it only "are you sure?" → **Confirmation modal**, naming the object and
   the consequence ("Revoke Claude Desktop? It loses access immediately.").
5. Is it a choice among actions? → **Popup**.
6. Is it a result? → **Toast**.

Copy: confirmation buttons repeat the verb ("Revoke", "Uninstall"), never
"OK"; the destructive button uses Payload's error style; Cancel is always
present; Esc and a backdrop click cancel (except during a request).

### 12.2 Inventory

| Interaction                                       | Overlay                              | Page               |
| ------------------------------------------------- | ------------------------------------ | ------------------ |
| Change Password                                   | Modal                                | Users, Account     |
| Send Reset Email (from the Change Password modal) | Confirmation modal → toast           | Users              |
| Resend Invite                                     | Toast                                | Users              |
| Bulk Resend Invites                               | Confirmation modal → toast           | Users list         |
| Add Tag (bulk)                                    | Drawer                               | Users list         |
| Sign Out Everywhere, View as User                 | Confirmation modal                   | Users              |
| Create / edit a child (lesson, enrollment, space) | Document drawer (join)               | Parents            |
| Pick related records                              | List drawer (`appearance: 'drawer'`) | Content            |
| Save / update a saved view                        | Payload's preset modal               | Lists              |
| Export                                            | Plugin drawer → toast                | Lists              |
| Regenerate All Images                             | Confirmation modal → toast           | Media              |
| Resync with Stripe                                | Toast                                | Plans              |
| Price or interval change on save                  | Confirmation modal                   | Plans              |
| Resolve / Dismiss report                          | Toast                                | Reports            |
| Remove Content / Suspend User                     | Confirmation modal                   | Reports            |
| Send Test to Me                                   | Toast                                | Push Notifications |
| Install Module                                    | Drawer → confirmation modal          | Modules            |
| Disable / Uninstall Module                        | Confirmation modal                   | Module page        |
| Update All                                        | Confirmation modal                   | Updates            |
| Retry Job                                         | Toast                                | Background Jobs    |
| Revoke MCP client                                 | Confirmation modal                   | AI Agents          |
| Alerts list                                       | Popup                                | Header             |
| Snooze an alert                                   | Popup                                | Home, Alerts       |
| Search                                            | Drawer                               | Header             |
| Add widget, edit layout                           | Payload's dashboard drawer           | Home               |
| Restore a version                                 | Payload's confirmation               | Versions tab       |
| Copy ID / URL / code                              | Toast                                | Everywhere         |
| Bulk upload, Edit many                            | Payload fullscreen modal             | Lists              |
| Import plan markdown (meet-dream Ideas)           | Drawer                               | Ideas              |

---

## 13. One theme for the app and the admin

### 13.1 Decision

The published **Theme Settings** global, `/admin/globals/theme-settings` on
every app (for example `https://app.future.dev/admin/globals/theme-settings`),
becomes the one theme for both the shadcn app (`/a`, front end) and the
Payload admin. Its slug stays `theme-settings`, so that URL keeps working. Payload keeps its layout,
components, spacing and density; the theme supplies **colors, fonts and
radius** through Payload's documented CSS variables. This replaces the fixed
admin palette (`lib/theme/admin-theme.ts`) and reverses the "admin fixed
theme" rule in `CLAUDE.md` (update that section).

### 13.2 Token mapping

`lib/theme/payload-theme.ts#themeToPayloadCss(theme)` (new; sibling of
`themeToCss`) turns the published theme into two blocks: `html[data-theme='light']`
(also `:root`) and `html[data-theme='dark']` (Payload's dark selector).

| Payload variable                                                  | From the theme                                                             | Notes                                                                                                        |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `--theme-elevation-0` … `--theme-elevation-1000` (21 steps of 50) | Ramp from `--background` (0) to `--foreground` (1000), OKLCH interpolation | Per mode, from that mode's tokens. Today only steps 0–150 are mapped, so Payload's defaults mix in above 150 |
| `--theme-bg`, `--theme-text`                                      | `--background`, `--foreground`                                             |                                                                                                              |
| `--theme-input-bg`                                                | `--input` (or elevation-0 when `--input` is a border color)                |                                                                                                              |
| `--theme-border-color`                                            | `--border`                                                                 |                                                                                                              |
| `--theme-error-50` … `-950`                                       | Ramp around `--destructive`                                                |                                                                                                              |
| `--theme-success-*`, `--theme-warning-*`                          | Payload defaults, unless the theme adds success/warning tokens             | Keeps status colors recognizable                                                                             |
| `--accessibility-outline`                                         | `--ring`                                                                   | Focus rings in the brand color                                                                               |
| `--font-body`                                                     | theme sans font                                                            | Loaded with the same `next/font` set as the front end                                                        |
| `--font-serif`                                                    | theme serif/heading font                                                   |                                                                                                              |
| `--font-mono`                                                     | theme mono font                                                            |                                                                                                              |
| `--style-radius-s`, `-m`, `-l`                                    | `--radius` − 4px, − 2px, as is (min 2px)                                   |                                                                                                              |
| `--base`, `--base-body-size`, `--nav-width`, breakpoints          | **unchanged**                                                              | Payload's density and layout stay Payload's                                                                  |

**Brand accent.** Payload's primary button and active states are built from
the elevation scale, not a "primary" variable. One small, versioned stylesheet
(`payload/styles/brand-accent.scss`, inside `@layer payload` so Payload
ordering is kept) applies `--primary` / `--primary-foreground` to: primary
buttons, the active nav indicator, checked checkboxes and toggles, and links
in descriptions. Nothing else is overridden. A Playwright visual test covers
those four elements in both modes so a Payload upgrade can't silently break
them.

### 13.3 Where it's injected

- `ThemeStyleProvider` (`admin.components.providers`) reads the **published**
  Theme Settings (cached, tag `theme`) and injects `themeToPayloadCss` plus the
  font-face CSS of the chosen fonts (the same curated `next/font` loaders the
  front end uses, so the admin never falls back to a browser serif).
- `admin.meta`: `titleSuffix` "– <App Name> Admin", `icons` from the branding
  favicon and app icon (today Payload's defaults).
- `graphics.Icon` / `graphics.Logo`: unchanged (already brand).
- `admin.theme` stays `'all'`: each staff member chooses light or dark
  (Payload preference), both generated from the theme.

### 13.4 Safety

- **Contrast guard**: before injecting, check WCAG contrast for text on
  elevation 0, 50 and 100 and for the accent button text. If a mode fails
  (below 4.5:1 for text), inject Payload's defaults for that mode and raise an
  info alert "Your theme's dark colors are too low-contrast for the admin;
  using Payload's defaults." with a link to Theme Settings.
- **Admin Colors** setting (Theme Settings › Admin tab): **Use Site Theme**
  (default) or **Payload Default**.
- Drafts never theme the admin: only the published theme applies.

### 13.5 Preview

Theme Settings › Admin tab has **Preview in Admin**: applies the draft's
tokens to the current admin session only (client-side style swap), with a
`Banner` "Previewing draft theme · Stop Preview". Site preview uses Payload's
Live Preview on the global.

### 13.6 Cleanup

- `app/(payload)/custom.css` (769 lines) shrinks to imports: Tailwind and the
  class overrides go; each custom component imports its own stylesheet.
- Rebuild the admin components that use Tailwind classes
  (`FinishSetupRow`, billing and Stripe `./admin` panels, module
  `AdminSettings` components) with Payload components.
- `ModAdminProviders` keeps react-query for module panels; no Tailwind.
- ESLint rule: no `className` strings with Tailwind utilities under
  `payload/components` and modules' `./admin`.

---

## 14. Global styling and consistency rules

### 14.1 Labels and text

- **Title Case** for names: nav links, collection and global labels, field
  labels, column headers, tab labels, button labels, presets ("Create New",
  "Save Draft", "Account Status"). This matches Payload's own built-ins
  ("Created At", "Browse by Folder"). Small words stay lowercase ("Date of
  Birth").
- **Sentence case** for descriptions, help text, banners, alerts, toasts,
  modal bodies. Descriptions are one or two sentences and end with a period.
- Acronyms and brands keep their casing: ID, URL, SMS, CTA, SEO, API, MCP,
  AI, iOS, LinkedIn, YouTube, TikTok, GitHub, X (Twitter).
- Every field whose auto-label would be wrong gets an explicit `label`.
- No internal words in labels or descriptions: not "mod-", "kit", "row",
  "global", "join", "SSO bridge" (use "sign-in"), "Supabase" only where an
  admin must know it (Supabase User ID in Technical).
- Plural collection label = the nav label; singular for buttons ("Create New
  Lesson" is Payload's wording via `labels.singular`).

### 14.2 Lists

- `useAsTitle` on every collection; a virtual field when the title is
  computed (Enrollment: "Jane Doe · Intro to Pottery"), since relationship
  titles show IDs.
- 3–5 `defaultColumns`, title first, status as Pill, a date last.
- `defaultSort` set (content: `-publishedAt`; moderation: `-createdAt`).
- `listSearchableFields` set and **indexed** (Payload's guidance).
- `admin.pagination: { defaultLimit: 25, limits: [10, 25, 50, 100] }` kit-wide.
- Empty states: Payload's `NoListResults` plus the collection description
  telling what goes here and the Create New button.

### 14.3 Edit views

- Side panel order: Status → Slug → dates → people (Author, Owner) →
  classification (Kind, Categories, Tags, Access Level) → read-only facts →
  a collapsed **Technical** group (IDs).
- Field tabs per §10.3. `row` fields pair related short inputs (First /
  Last Name).
- Descriptions under fields only when the label isn't enough.

### 14.4 Status colors (Pill and Banner)

| Meaning                  | Pill style   | Examples                                                 |
| ------------------------ | ------------ | -------------------------------------------------------- |
| Live / healthy           | `success`    | Published, Active, Connected, Synced, Enabled            |
| Waiting / attention soon | `warning`    | Scheduled, Trialing, Past Due, Update Available, Invited |
| Broken / blocked         | `error`      | Failed, Banned, Sync Error, Revoked                      |
| Neutral / not live       | `light-gray` | Draft, Disabled, Archived, Canceled                      |
| Emphasis                 | `dark`       | Type pills (Module / Connector)                          |

### 14.5 Dates, numbers, time zones

- `admin.dateFormat`: `MMM d, yyyy h:mm a` kit-wide.
- `admin.timezones`: `supportedTimezones` = Payload defaults,
  `defaultTimezone` from Site Settings; date fields that schedule things
  (events, push sends, scheduled publish) set `timezone: true`.
- Money: currency code from the plan; `$1,234.50` format; counts with
  thousands separators.

### 14.6 Consistency checks (automated)

A `tooling` test walks the built Payload config and fails when:

- a collection or global has no `description`, no `useAsTitle` (collections),
  or a label not in Title Case;
- an auto-generated field label contains a mis-cased acronym or brand
  (`Id`, `Url`, `Sms`, `Cta`, `Linkedin`, `Youtube`, `Github`, …);
- `admin.group` isn't a section label or a module group (§17.2);
- a `listSearchableFields` entry isn't indexed;
- a child collection uses `admin.hidden` instead of `admin.group: false`.

---

## 15. Mobile and tablet

Payload's breakpoints: xs 400, s 768, m 1024, l 1440 px. Payload already
turns the nav into a full-width mobile menu below s and narrows the gutter
below m. The kit's custom parts follow the same breakpoints.

### 15.1 Rules

| Area              | Phone (< 768)                                                                                                           | Tablet (768–1024)                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Nav               | Payload hamburger menu, same zones and accordion                                                                        | Payload nav, collapsible             |
| In-page tabs      | Family tabs and document tabs scroll horizontally with an edge fade; the active tab scrolls into view                   | Same                                 |
| List views        | ≤ 4 default columns; title first; table scrolls horizontally; presets replace complex filters                           | Same columns as desktop              |
| Edit views        | Side panel moves below the main column (Payload); keep Status first in it                                               | Payload layout                       |
| Document controls | Custom buttons collapse into the ⋯ menu below s (they render in `editMenuItems` on small screens)                       | All visible                          |
| Drawers           | Full screen                                                                                                             | Partial width                        |
| Modals            | Full width minus gutter; buttons stacked, primary last                                                                  | Centered                             |
| Popups            | Anchored; full-width sheet below 400 px                                                                                 | Anchored                             |
| Home widgets      | All full width; KPI tiles two per row                                                                                   | `small`/`medium` widgets two per row |
| Header actions    | Search and Alerts as icon buttons                                                                                       | Icon + label                         |
| Touch             | 44 px minimum targets in custom components; no hover-only actions (copy buttons always visible)                         | Same                                 |
| Live Preview      | Payload's preview with breakpoints: Mobile 390×844, Tablet 810×1080, Desktop 1440×900 (`admin.livePreview.breakpoints`) | Same                                 |

### 15.2 Testing

- Playwright projects: **iPhone 13** (390×844), **iPad (gen 7)** (810×1080),
  **Desktop** (1440×900).
- A smoke spec per key screen (Home, Users list and edit, Series with
  Lessons, Plans, Modules, Theme Settings, Alerts, Search) in all three
  projects, in light and dark, with screenshot comparisons.
- `axe-core` accessibility checks on the same screens (Payload targets WCAG
  2.2 AA; custom components must not regress it).

---

## 16. URL slugs that match names

### 16.1 Policy

1. **Slug = kebab-case of the plural label.** "Push Notifications" lives at
   `/admin/collections/push-notifications`. Globals: kebab-case of the label
   (`theme-settings`).
2. **Prefer relabeling over reslugging** when the slug already names the
   thing correctly (Audio stays `audio`; Legal becomes "Legal Pages" at
   `legal-pages` because "Legal" alone isn't a collection name).
3. **Module collections drop the `mod-` prefix in the slug** and keep it in
   the database:
   - first-party and catalogue modules **claim** clean slugs (`plans`,
     `coupons`, `subscriptions`, `docs`, `chat-skills`) in their manifest
     (`cms.claims`); the meetdream.com registry reserves claimed slugs, and
     `pnpm mod sync` fails on any clash;
   - other modules prefix with their module slug (`feedback-boards`);
   - every module collection sets `dbName: 'mod_<module>_<name>'`, so the
     database namespacing rule (MODULES-PLAN §1.1) is unchanged.
     This changes `packages/mod-kit/src/validate.ts` (`cmsPrefix`) and the
     manifest docs.
4. **Payload-owned collections keep Payload's slugs** (`payload-jobs`,
   `payload-query-presets`, `payload-folders`); only their labels are set.
5. **Hidden module settings globals keep `mod-<slug>-settings`**: they never
   appear in a URL (settings render at `/admin/modules/<slug>/settings`).
6. **Custom views** use the label: `/admin/settings`, `/admin/alerts`,
   `/admin/connections`, `/admin/ai-agents`, `/admin/modules/<slug>` and
   `/admin/modules/<slug>/settings`.

### 16.2 Renames

| Today (slug)                        | Label today           | New slug                        | New label                 | Owner                                    |
| ----------------------------------- | --------------------- | ------------------------------- | ------------------------- | ---------------------------------------- |
| `kit-modules`                       | Modules               | `modules`                       | Modules                   | core                                     |
| `nav-items`                         | Navigation            | `navigation`                    | Navigation                | core                                     |
| `notifications`                     | Notifications         | `push-notifications`            | Push Notifications        | core                                     |
| `onboarding`                        | Onboardings           | `app-onboarding`                | App Onboarding            | core                                     |
| `legal`                             | Legal                 | `legal-pages`                   | Legal Pages               | core                                     |
| `feed-tokens`                       | Feed Tokens           | `private-feeds`                 | Private Feeds             | media-podcasts*                          |
| `community-spaces`                  | (hidden)              | `spaces`                        | Spaces                    | community*                               |
| `mod-billing-plans`                 | Billing Plans         | `plans`                         | Plans                     | billing                                  |
| `mod-billing-coupons`               | Billing Coupons       | `coupons`                       | Coupons                   | billing                                  |
| `mod-billing-subscriptions`         | Billing Subscriptions | `subscriptions`                 | Subscriptions             | billing                                  |
| `mod-chat-skills`                   | Chat Skills           | `chat-skills`                   | Chat Skills (nav: Skills) | chat                                     |
| `mod-docs-pages`                    | Documentation         | `docs`                          | Docs                      | docs                                     |
| `mod-modules-catalog` (meet-dream)  | Modules               | `module-catalog`                | Module Catalog            | modules                                  |
| `mod-modules-releases` (meet-dream) | Module releases       | `module-releases`               | Module Releases           | modules                                  |
| `mod-modules-sites` (meet-dream)    | Kit sites             | `licensed-sites`                | Licensed Sites            | modules                                  |
| `search` (plugin default)           | —                     | `search-index`                  | Search Index              | search (#64), via `searchOverrides.slug` |
| global `authentication-settings`    | Authentication        | `authentication`                | Authentication            | core                                     |
| global `image-generation-settings`  | Image Generation      | `ai-settings`                   | AI Settings               | core                                     |
| global `dream-site`                 | Site License          | `site-license`                  | Site License              | core                                     |
| global `native-navigation`          | Native navigation     | `app-navigation`                | App Navigation            | core                                     |
| view `/admin/module-settings/:slug` | —                     | `/admin/modules/:slug/settings` | —                         | core                                     |

Unchanged: `posts`, `videos`, `audio`, `photos`, `series`, `lessons`,
`events`, `locations`, `categories`, `tags`, `tag-groups`, `media`,
`space-groups`, `community-posts`, `comments`, `reviews`, `reports`, `users`,
`enrollments`, `banners`, `forms`, `form-submissions`, `pages`, `redirects`,
`site-settings`, `theme-settings`, `profile-fields`, `idea-shares`, `ideas`, `idea-categories`.

### 16.3 How to rename safely

A slug rename is a **contract** change (`-- dream:contract slug rename`) and
ships in its own release, after the nav work.

1. **Keep tables.** Set `dbName` to today's table name on every renamed
   collection and global. Payload derives table names from `dbName` when set;
   the docs don't state how the `_v` (versions) and `_rels` tables and the
   relationship columns are named, so verify with a dry
   `pnpm cms:migrate:create` on a branch and accept only renames (never
   drop + create).
2. **Rename stored slugs** in one migration:
   - relationship columns in `_rels` tables that are named after the target
     slug (e.g. a column for `relationTo: 'notifications'`);
   - `payload_preferences` keys that embed slugs (list columns, presets);
   - `payload_locked_documents_rels`, `payload_query_presets.related_collection`,
     `payload_folders` collection types;
   - redirect targets and search records (`relationTo` values);
   - `public.content_favorites.collection` (a Supabase migration);
   - queued job inputs that name collections.
3. **Keep old URLs working:**
   - `/admin/collections/<old>/…` and `/admin/globals/<old>` → 308 to the new
     path in `proxy.ts` (it already redirects `/admin/modules` and the old
     settings globals);
   - REST `/cms-api/<old>/…` → rewrite to the new slug for as long as an app
     build that calls the old path is supported (the Expo app reads content
     through REST); remove the alias when the minimum supported app version
     uses the new slugs;
   - MCP accepts old slugs as aliases in `collection:id` ids and tool inputs
     for one release, and `list_collections` reports the new ones.
4. **Regenerate** `@acme/cms` types (type names follow slugs, e.g.
   `KitModule` → `Module`), `pnpm db:gen-types`, `pnpm db:gen-migrations`,
   and update code references (`collection: 'kit-modules'`, MCP registry,
   seeds, hooks, Stripe webhook code).
5. **Test**: an E2E that loads every old admin URL and gets the new page; an
   integration test that reads favorites, redirects and presets after the
   migration; RLS tests unchanged.

Public site routes (`/audio`, `/locations`, `/legal/...`) are already named
for what they show and don't change.

---

## 17. How the menu is built

### 17.1 Inputs

1. **Installed modules**: the generated registries (build time).
2. **Enabled state**: the `modules` row's `enabled` flag (runtime).
3. **Permissions**: Payload's `visibleEntities` and `permissions` (access
   functions) and, with Roles & Permissions (#45), module permission keys.
4. **Section registry and placements** (below).

### 17.2 Section registry (`@acme/mod-kit`)

```ts
// packages/mod-kit/src/admin-sections.ts
export const ADMIN_SECTIONS = {
  content: { label: "Content", order: 10, zone: "main" },
  community: { label: "Community", order: 20, zone: "main" },
  people: { label: "People", order: 30, zone: "main" },
  sales: { label: "Sales", order: 40, zone: "main" },
  support: { label: "Support", order: 50, zone: "main" },
  operations: { label: "Operations", order: 60, zone: "main" },
  commerce: { label: "Commerce", order: 70, zone: "main" },
  marketing: { label: "Marketing", order: 80, zone: "main" },
  insights: { label: "Insights", order: 90, zone: "main" },
  channels: { label: "Channels", order: 100, zone: "main" },
  settings: { label: "Settings", order: 1000, zone: "settings" },
  system: { label: "System", order: 1100, zone: "settings" },
} as const;

/** Spread into a collection's or global's `admin` block. */
export function inSection(section: AdminSection, order = 100) {
  return {
    group: ADMIN_SECTIONS[section].label,
    custom: { navSection: section, navOrder: order },
  };
}

/** A child collection: no nav link, routes kept, parent highlighted. */
export function childOf(parent: string) {
  return { group: false as const, custom: { navParent: parent } };
}
```

- `admin.group` stays a string (Payload's mechanism) but only from this
  registry or a module group name; `pnpm mod sync` and the consistency test
  (§14.6) fail on anything else.
- Children use `childOf()` (`admin.group: false`), never `admin.hidden`.
- Payload documents the collection-level `custom` key; the kit stores nav
  metadata there (`custom.navSection`, `navOrder`, `navParent`, `modSlug`).

### 17.3 Manifest additions (`packages/mod-kit/src/manifest.ts`)

```ts
admin: z.object({
  settingsComponent: z.boolean().default(false),          // existing

  /** Where this module's collections go: a section key, or "module" (own group). */
  section: z.union([AdminSectionKey, z.literal("module")]).default("module"),

  /** Per-collection placement and list behavior, by slug. */
  collections: z.record(z.object({
    section: z.union([AdminSectionKey, z.literal("module")]).optional(),
    order: z.number().int().optional(),
    parent: z.string().optional(),            // §9: child of another collection
    family: z.string().optional(),            // §10.1: family tabs group
    presets: z.boolean().optional(),          // §23.1
    groupBy: z.boolean().optional(),          // §23.2
    export: z.object({ permission: z.string() }).optional(), // §23.5
  })).default({}),

  /** Tabs this module adds to other collections' edit views (field tabs). */
  collectionTabs: z.array(z.object({
    collection: z.string(),                   // e.g. "users"
    tab: z.string(),                          // export name in ./payload
    order: z.number().int().default(100),
  })).default([]),

  /** Document tabs this module adds (views.edit.<key>), e.g. Audit Log's Activity. */
  documentTabs: z.array(z.object({
    collections: z.union([z.literal("*"), z.array(z.string())]),
    key: z.string(), label: z.string(), order: z.number().int(),
    component: z.string(),                    // ./admin-server export
    permission: z.string().optional(),
  })).default([]),

  /** This module owns its section: its settings link goes there (Billing Settings). */
  ownsSection: z.boolean().default(false),

  /** Custom admin views, as nav links. */
  views: z.array(z.object({
    key: z.string(), label: z.string(), path: z.string(),
    section: z.union([AdminSectionKey, z.literal("module")]).default("module"),
    order: z.number().int().default(0),
    permission: z.string().default("admin"),  // §25
  })).default([]),

  /** Exports of ./admin-server (server-only entry). */
  dashboard: z.object({
    widgets: z.boolean().default(false),
    attention: z.boolean().default(false),
    setup: z.boolean().default(false),
    badges: z.boolean().default(false),
    settingsSummary: z.boolean().default(false),
  }).default({}),
}).default({}),

// in the existing `cms` block:
claims: z.array(z.string()).default([]),            // §16.1 clean slugs
search: z.record(z.object({ priority: z.number().int() })).default({}),  // §23.7
richTextBlocks: z.array(z.string()).default([]),    // §23.8
richTextFeatures: z.array(z.string()).default([]),  // AI Writing Assistant
linkable: z.array(z.string()).default([]),          // §22.2, §23.6
commentable: z.array(z.string()).default([]),
reviewable: z.array(z.string()).default([]),
```

`collectionTabs` generalizes today's adapter collection tabs
(`composeCollectionTabs`) so any module can add a tab to a core collection
(billing → Users › Subscriptions) without the core collection importing it.

### 17.4 Nav build (`AdminNav.tsx`)

```
1. entities = visible collections + globals (Payload, as today; group:false
   and hidden entities are already excluded)
2. drop entities of disabled modules (custom.modSlug ∈ disabled)
3. add module view links the user is permitted to see (enabled modules only)
4. add section-owner settings links (ownsSection, admins): "<Module> Settings", order 990
5. add "Settings" (order 999) to each module group with settings (admins)
6. group by custom.navSection or module group name
7. sort groups by zone (main → modules → settings), section order, then
   module name A–Z; sort links by navOrder, then label
8. drop empty groups
9. fetch badges for visible links (cached, §17.5)
10. active link = current entity, or its custom.navParent
11. render: Home + Browse by Folder, main groups, "Modules" label + module
    groups, Settings, System, footer
```

Disabled modules: their collections also get `admin.hidden: () =>
isModuleDisabled(slug)` (sync; reads an in-process cache filled at boot,
refreshed by the `modules` collection's `afterChange` and re-warmed by
`AdminNav` every 60 s), so Payload's own views and the dashboard's collection
cards drop them too. Their APIs stay blocked by access control, as today.

### 17.5 Badges

A module's `./admin-server` exports `navBadges({ req })` →
`[{ href, count, tone }]`. Run in parallel, 1.5 s timeout each, cached 60 s
per (module, role) under the `admin-badges` tag; failures log
`[admin-badges] <slug>` and show no pill. Core badges: Reports (open), Push
Notifications (failed), Background Jobs (failed), Updates (available).

---

## 18. Admin home and urgent content

Built on Payload's **modular dashboard** (`admin.dashboard.widgets` +
`defaultLayout`, experimental). Widgets are React Server Components
(`WidgetServerProps`), styled with Payload's `card` class and theme
variables. Users can rearrange, resize, add and remove widgets; layouts are
saved per user; Reset Layout restores the default.

### 18.1 Default layout (admin)

```
[header: one critical banner, only when one exists]
Home                                                   [Search] [Alerts 3]
Good morning, Jane.
┌ Needs Attention (full) ────────────────────────────────────────────────┐
│ [Banner error] Stripe events are failing · 12 in the last hour  [Fix]  │
│ [Reports 4 ›] [Past-Due Subscriptions 2 ›] [Failed Jobs 1 ›] [Updates 2 ›] │
└────────────────────────────────────────────────────────────────────────┘
┌ Members ┐ ┌ Active Subs ┐ ┌ Monthly Revenue ┐ ┌ Chat Conversations ┐   (x-small each)
│ 1,240   │ │ 312         │ │ $5,870          │ │ 88 this week       │
│ +38 / 7d│ │ +6 / 7d     │ │                 │ │                    │
└─────────┘ └─────────────┘ └─────────────────┘ └────────────────────┘
┌ Finish Setting Up (medium) ┐ ┌ Recent Drafts (medium) ┐
┌ Latest Comments (medium)   ┐ ┌ Module cards (small/medium) ┐
┌ All Collections (Payload's built-in `collections` widget, full) ┐
```

Editors and authors get a layout without commerce KPIs, setup and admin-only
alerts (`defaultLayout({ req })` branches on permissions).

### 18.2 Widget catalog

| Slug                | Title                                                                          | Owner                                                 | Width          | Shown to             |
| ------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------- | -------------- | -------------------- |
| `attention`         | Needs Attention                                                                | core (aggregates modules)                             | full           | all staff (filtered) |
| `kpi-members`       | Members                                                                        | core                                                  | x-small        | A                    |
| `kpi-published`     | Published This Week                                                            | core                                                  | x-small        | E Au                 |
| `kpi-subscriptions` | Active Subscriptions                                                           | billing                                               | x-small        | A                    |
| `kpi-mrr`           | Monthly Revenue                                                                | billing                                               | x-small        | A                    |
| `kpi-chat`          | Chat Conversations                                                             | chat                                                  | x-small        | A                    |
| `setup`             | Finish Setting Up                                                              | core + modules                                        | medium         | A                    |
| `recent-drafts`     | Recent Drafts                                                                  | core                                                  | medium         | all staff            |
| `recent-comments`   | Latest Comments                                                                | core                                                  | medium         | A E                  |
| `module-<slug>`     | module card                                                                    | each module                                           | small–medium   | per permission       |
| `collections`       | All Collections                                                                | Payload built-in                                      | full           | all staff            |
| future              | Analytics KPIs, report tiles, open tickets, today's bookings, overdue invoices | Analytics, Reports, Client Portal, Booking, Invoicing | x-small–medium | per permission       |

Rules: each widget checks permissions itself and renders nothing if not
allowed; errors render a small `Banner type="error"` inside the widget; a
disabled module's widgets render nothing; module widgets are registered at
build time by `mod sync` (`modDashboardWidgets`).

### 18.3 Attention API

```ts
export type AttentionItem = {
  id: string; // "<slug>:<key>", for dismiss/snooze
  severity: "critical" | "warning" | "info" | "success";
  title: string; // ≤ 60 characters, sentence case
  description?: string; // ≤ 140 characters: what happens if ignored
  count?: number; // shown as a Pill
  href: string; // where to fix it
  actionLabel: string; // a verb in Title Case: "Review", "Fix", "Connect"
  permission?: string; // default "admin" (§25)
  display?: "pill" | "banner";
  dismissible?: boolean; // never for critical
  snoozeHours?: number; // default 168
  createdAt?: string;
};
export type AttentionProvider = (ctx: {
  req: PayloadRequest;
}) => Promise<AttentionItem[]>;
```

| Severity | Component                                                     | Default display | Dismissible           | Also in                  |
| -------- | ------------------------------------------------------------- | --------------- | --------------------- | ------------------------ |
| critical | `Banner type="error"` + action `Button`                       | banner          | never                 | header bar (one), Alerts |
| warning  | `Banner type="warning"`, or a task pill with `Pill` `warning` | pill if `count` | yes                   | Alerts                   |
| info     | task pill, `Pill` `light-gray`                                | pill            | yes                   | Alerts                   |
| success  | `Banner type="success"`                                       | banner          | auto-hides after 24 h | —                        |

Order: severity, then core before modules, then section order, then newest.
Home shows at most 3 banners and 6 pills; "View All Alerts (N)" links to the
Alerts page. Dismissals are per user in Payload preferences
(`attention-dismissed`). Providers run in parallel (1.5 s timeout, cached
60 s, tag `admin-attention`). Never for promotions or tips.

**v1 items:** `core:seed` (critical, CMS has no content) · `core:updates`
(warning) · `core:github` (info) · `core:license` (critical) · `core:reports`
(warning) · `core:push-failed` (warning) · `core:jobs-failed` (warning) ·
`core:theme-contrast` (info, §13.4) · `billing:stripe-disconnected`
(critical) · `billing:webhooks-failing` (critical) · `billing:past-due`
(warning) · `billing:catalog-unsynced` (warning) · `chat:gateway-missing`
(critical) · `dev-accounts:stuck` (info, meet-dream).

### 18.4 Setup steps

`SetupStep = { id, title, description?, done, href, actionLabel, order? }`
from core and modules: account created · connect GitHub · set brand · review
sign-in methods · connect Stripe · create a plan · add an AI Gateway key. The
widget hides when all are done or dismissed. Replaces `FinishSetupRow`.
`SeedGate` and `DreamSiteSync` stay in `beforeDashboard`.

### 18.5 Fallback

Widget content lives in plain server components (`payload/components/home/*`).
If the experimental dashboard API changes, the kit switches to a custom
`views.dashboard` (`DefaultTemplate` + `Gutter`, fixed layout) without
changing module exports. Pin Payload's minor version and keep an E2E on Home.

---

## 19. Alerts: header bar, bell, Alerts page

- **Header bar** (`admin.components.header`): at most one critical item, else
  today's Updates bar. `Banner` with one action button.
- **Alerts bell** (`admin.components.actions`): `Button` with a `Pill` count
  of undismissed critical and warning items; opens a `Popup` list of up to 8
  (severity pill, title, Review) and "View All Alerts". Empty: "Nothing needs
  you right now."
- **Alerts page** (`/admin/alerts`): `DefaultTemplate` + `Gutter`; filter
  buttons All · Critical · Warning · Info · Dismissed; rows grouped by
  module with Pill, title, description, time, action, and a Snooze popup.

---

## 20. Settings and System

### 20.1 All Settings (`/admin/settings`)

A page of Payload `Card`s, grouped:

```
All Settings
Everything that configures your site and app.

Site            [Site Settings] [Theme Settings] [AI Settings]
Sign-In         [Authentication] [Profile Fields] [Roles & Permissions*]
Connections     [Stripe Connector · Connected] [Slack Connector · Not Connected] …
Modules         [Billing · Stripe connected · 3 plans] [AI Chat · Gateway key set]
                [Docs] [Intercom · Disabled]                    [Install Module]
System          [Updates · 2 available] [Background Jobs · 1 failed]
                [Site License · Active] [Exports] [Search Index*]
* when the module is installed
```

Each module card's status line comes from its `settingsSummary` export (≤ 60
characters). Pills show Disabled, Not Connected, Update Available.

### 20.2 Who sees what

Settings and System are admin-only. Editors who maintain Legal Pages now find
them in Channels (§8.8).

---

## 21. Module pages and connectors

### 21.1 Module overview (`/admin/modules/<slug>`)

The Instafeed pattern (screenshot 47), in Payload components:

```
Breadcrumb: System / Modules / AI Chat
AI Chat   [v1.4.0] [Enabled]                          [Settings] [⋯]
[ Overview | Skills | Settings ]          ← module tabs (same as its nav group)
[Banner info] AI Chat 1.5.0 is available. [Review Update]
[Banner warning] No AI Gateway key. Chat replies are off. [Fix]
[Card Conversations 88] [Card Messages 1,204] [Card Skills 6] [Card Channels: Web · SMS]
Quick Links: [Skills ›] [Slack Connector ›] [Docs ›]
```

- The kit renders the frame: title, version and state pills, the module's own
  attention items, module tabs, action buttons.
- The module provides the body (`Overview` from `./admin-server`). Without
  one, the default body lists its collections as `Card`s plus Settings.
- Every module (with or without a nav group) has this page; System › Modules
  links each row here (`formatDocURL`).

### 21.2 Module settings (`/admin/modules/<slug>/settings`)

Today: the `kit-modules` row edit view, with every module's settings as
conditional groups. Proposed, keeping the same storage:

- Breadcrumb System / Modules / Billing / Settings; module tabs at the top.
- Field tabs, one per settings area (Billing: General · Pricing Page · Tags ·
  Stripe Connector · Advanced). Adapter and connector settings arrive as tabs
  (`settingsTabFor`, existing).
- Side panel: Enabled toggle (confirmation modal when disabling), version,
  source, update pill.
- Buttons: connector actions (Test Connection, Register Webhook, Resync
  Catalog) as `beforeDocumentControls` buttons; Uninstall in the ⋯ menu.
- Module `AdminSettings` panels (today's `settingsComponent`) render inside
  their tab, built with Payload components.

### 21.3 Connectors

- Never in the nav. Listed in Settings › Connections (§11.23) with a status
  Pill and "Connects to: <service>".
- In System › Modules they carry a **Connector** type pill and their parent
  module name.
- Their settings are a tab on the parent module's settings page; their record
  data is a tab on parent records (Stripe tab on Plans; Stripe Customer ID on
  the Users › Subscriptions tab).
- Labels: "<Service> Connector" (Stripe Connector, Slack Connector, Sendblue
  Connector, Intercom Connector, GitHub Connector).

---

## 22. Content collections become modules

### 22.1 Extraction, aligned with the catalogue

| New module         | Catalogue            | Takes                                                           | Also moves                                                                    |
| ------------------ | -------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `media-podcasts`   | #63 Media & Podcasts | `videos`, `audio`, `photos`, `private-feeds`                    | public routes, hooks, native screens, MCP entries, seed, RSS feed             |
| `events`           | #26 Events           | `events`                                                        | routes, hooks, native screen, MCP entry, seed; makes Reviews visible          |
| `maps`             | #60 Map & Locations  | `locations`                                                     | routes, map components, native screen, MCP entry, seed; makes Reviews visible |
| `community`        | #88 Community        | `space-groups`, `spaces`, `community-posts`                     | routes, hooks, native screens, MCP entries, seed                              |
| `courses` (later)  | #61 Courses          | course-kind `series` rows → `courses`, `lessons`, `enrollments` | §22.3                                                                         |
| meet-dream `ideas` | —                    | `ideas`, `idea-categories`, `idea-shares`                       | meet-dream's idea routes and components                                       |

**Stays core:** `users`, `media`, `posts`, `pages`, `legal-pages`, `series`,
`categories`, `tags`, `tag-groups`, `comments`, `reviews`, `reports`,
`push-notifications`, `banners`, `app-onboarding`, `forms`,
`form-submissions`, `navigation`, `redirects`, `modules`, and core globals.
`series` stays core because podcast shows, video seasons and courses all use
it until Courses ships.

Modules ship **preinstalled** in the kit release that extracts them, so
existing apps see no change. A founder removes what they don't use
(`pnpm mod remove events`).

### 22.2 References that must tolerate missing types

| Field                                  | After                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `comments` target (polymorphic)        | Posts + every collection in an installed module's `cms.commentable`      |
| `reviews` target                       | `cms.reviewable` (events, maps); **Reviews hidden** when empty           |
| banner / navigation destination fields | `cms.linkable`                                                           |
| redirects `to` (plugin `collections`)  | `pages`, `posts` + `cms.linkable`                                        |
| `public.content_favorites.collection`  | unchanged column; readers ignore uninstalled types; `drop.sql` cleans up |
| `enrollments.subscription`             | relationship only when billing is installed                              |
| `events.location`                      | relationship when maps is installed, else a venue text field             |
| MCP collections                        | core + module entries (`collectionsFor({ extraCollections })` exists)    |
| seed steps                             | module `seed` steps (`modSeedSteps` exists)                              |

### 22.3 Courses

When Courses (#61) is built: a `courses` collection takes the `series` rows
of kind Course (data migration, ids kept in a mapping table), `lessons` and
`enrollments` move into the module and repoint to `courses`. Until then,
Lessons sit in Series (§11.6) and Enrollments in Users.

### 22.4 Existing installs

Module Payload migrations **adopt** existing tables (`IF NOT EXISTS`); core
never drops them; `pnpm mod remove` runs `drop.sql` after a confirmation that
names row counts. The extraction ships as its own release with its own E2E.

---

## 23. Payload features to adopt

Checked against every collection, global and `payload.config.ts`. All free,
built into Payload or official Payload plugins. Two of them become catalogue
modules (Search #64, Data Export #49), which wrap the plugins through
`modPlugins`.

| §     | Feature                                     | Payload API                                                         | Shows in `/admin`                           | Phase | Status in Payload                          |
| ----- | ------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------- | ----- | ------------------------------------------ |
| 23.1  | Saved list views                            | `enableQueryPresets` + root `queryPresets`                          | Presets menu on lists                       | 1     | stable                                     |
| 23.2  | Grouped lists                               | `admin.groupBy`                                                     | Group By in list controls                   | 1     | **beta**                                   |
| 23.3  | History on settings and catalog             | `versions` (no drafts), `readVersions` access                       | Versions tab                                | 1b    | stable                                     |
| 23.4  | Drafts, scheduling, live preview everywhere | `versions.drafts.schedulePublish`, `livePreview`, `preview`         | Publish/Schedule/Preview, Live Preview tab  | 1b    | stable (needs the jobs runner the kit has) |
| 23.5  | Export to CSV                               | `@payloadcms/plugin-import-export`, in the **Data Export** module   | Export in list menus; System › Exports      | 1b    | stable (`toCSV`/`fromCSV` deprecated)      |
| 23.6  | Redirects                                   | `@payloadcms/plugin-redirects` (core: Marketing Site & SEO)         | Channels › Redirects                        | 1b    | stable                                     |
| 23.7  | Global search                               | `@payloadcms/plugin-search`, in the **Search** module               | Header Search drawer; System › Search Index | 5     | stable                                     |
| 23.8  | Rich-text blocks and features               | Lexical `BlocksFeature`, module features                            | Slash menu, toolbar                         | 5     | stable                                     |
| 23.9  | GraphQL off                                 | `graphQL: { disable: true }`                                        | —                                           | 1b    | stable                                     |
| 23.10 | Background Jobs list                        | Payload jobs collection overrides                                   | System › Background Jobs                    | 1     | stable                                     |
| 23.11 | Admin metadata, dates, time zones           | `admin.meta`, `admin.dateFormat`, `admin.timezones`, `admin.avatar` | Tab titles, icons, dates                    | 1     | stable                                     |
| 23.12 | Live Preview breakpoints                    | root `admin.livePreview.breakpoints`                                | Live Preview tab                            | 1b    | stable                                     |

### 23.1 Saved list views (query presets)

- Root `queryPresets`: staff may create and read; sharing constraints add a
  "Staff" option next to Payload's Only Me / Everyone (`constraints`).
- `enableQueryPresets: true` on every collection in the nav (modules opt in
  with `admin.collections[slug].presets`).
- Adds `payload-query-presets` (Payload migration), `admin.hidden`.
- Seeded shared presets (idempotent seed step; each module seeds its own):

| Collection         | Presets                                       |
| ------------------ | --------------------------------------------- |
| Users              | Members · Staff · Invited · Suspended         |
| Enrollments        | All Enrollments (linked from Users)           |
| Private Feeds      | All Private Feeds (linked from Users)         |
| Subscriptions      | Past Due · Trialing · Canceling               |
| Reports            | Open                                          |
| Push Notifications | Scheduled · Failed                            |
| Background Jobs    | Failed · Pending                              |
| Every content type | Drafts · Scheduled                            |
| Series             | Courses · Podcast Shows · Playlists · Seasons |

Nav pills and attention items link to the same filters, so counts and lists
agree.

### 23.2 Grouped lists (`admin.groupBy`, beta)

On: Lessons (Series), Push Notifications (Status), Reports (Reason, Status),
Comments (Target Type), Community Posts (Space), Events (Category),
Subscriptions (Plan, Status), Plans (Interval), Users (Account Status, Roles),
Background Jobs (Task). No schema change.

### 23.3 History (versions)

`versions: { max: 20 }` on Site Settings, Authentication, Profile Fields, AI
Settings; `versions: { maxPerDoc: 20 }` on Modules (every module's settings),
Plans, Coupons. A hidden read-only `lastModifiedBy` field (set from
`req.user` in `beforeChange`) on each, because Payload versions don't record
the editor. `readVersions`: admins. Restores run hooks: the restore
confirmation says so (sign-in settings apply at once; a plan restore creates
a new Stripe price). Not versioned: Users (Supabase is the source of truth),
Site License (system-written).

### 23.4 Publish flow for every published type

| Collection                                   | Today                 | Change                                                     |
| -------------------------------------------- | --------------------- | ---------------------------------------------------------- |
| Audio, Photos                                | no drafts, no preview | drafts + `schedulePublish` + `maxPerDoc: 25`; live preview |
| Videos, Docs                                 | drafts, no preview    | live preview                                               |
| Series, Lessons                              | drafts, no preview    | live preview once public course/series pages exist         |
| Banners, App Onboarding                      | none                  | drafts + `schedulePublish`                                 |
| Community Posts                              | none                  | no change (members write them in the app)                  |
| Posts, Pages, Legal Pages, Events, Locations | drafts + preview      | no change                                                  |

The migration that turns drafts on must set `_status = 'published'` on every
existing row, or they disappear from public reads. Read access becomes
`publishedOrStaff`. E2E: an existing episode stays visible after migration.

### 23.5 Export (Data Export module, #49)

- Wraps `@payloadcms/plugin-import-export`. Its `exports` collection is
  hidden from the nav by the plugin (`admin.group: false`); the module sets
  the group to System (`overrideExportCollection`) so past exports are listed.
- Uses the Jobs Queue (the kit's cron runner already runs jobs every minute).
- v1 collections: Users, Subscriptions, Coupons (admins); Form Submissions,
  Reports (admins, editors). Modules opt in with
  `admin.collections[slug].export`.
- Files expire after 7 days (`purge-exports` task). Import stays off (it would
  skip the invite and Supabase sync hooks on Users).

### 23.6 Redirects (core)

`redirectsPlugin({ collections: ['pages', 'posts', ...cms.linkable] })`. A
kit hook creates a redirect automatically when a published document's slug
changes (old public path → document), collapses chains (X → A → B becomes
X → B) and rejects source = target. Public dynamic routes call
`redirectIfMoved(path)` (cached, tag `redirects`) before `notFound()`; the
plugin doesn't redirect by itself. Not in `proxy.ts` (no DB calls there).

### 23.7 Search (Search module, #64)

`searchPlugin({ collections, defaultPriorities, beforeSync, searchOverrides:
{ slug: 'search-index' } })`. Collections opt in with `cms.search`. Admin: a
Search button in `actions` opens a Drawer with scope pills (All, Content,
Community, People, Commerce, …), results grouped by collection with type and
status pills; staff results include drafts. Public search reads published
records only; premium items (`accessLevel`) index the title only. Reindex
from System › Search Index (the plugin's Reindex pill).

### 23.8 Rich-text blocks and features

Core blocks: Callout, Call to Action, Image with Caption. Modules add blocks
(`cms.richTextBlocks`: Video, Podcast Episode, Event Card, Map, Course Card)
and editor features (`cms.richTextFeatures`: AI Writing Assistant #85 adds
"Rewrite" and "Draft" toolbar actions). Web and native renderers for each
block; unknown blocks render nothing; block shapes documented in
`docs/MCP.md`.

### 23.9 GraphQL off

No GraphQL route is mounted; set `graphQL: { disable: true }` and confirm
generated types don't change.

### 23.10 Background Jobs

Expose Payload's jobs collection read-only in System (jobs collection
overrides: label, group, columns Task · Queue · Status · Wait Until · Error,
`enableQueryPresets`). A Retry action on failed jobs. Failed-job count feeds a
nav pill and an attention item.

### 23.11 Admin metadata, dates, time zones, avatar

- `admin.meta.titleSuffix`: " – <App Name> Admin" (from branding);
  `admin.meta.icons` from the favicon and app icon.
- `admin.dateFormat`: `MMM d, yyyy h:mm a`.
- `admin.timezones.defaultTimezone` from Site Settings; scheduling date
  fields use `timezone: true`.
- `admin.avatar`: a component showing the user's profile avatar.

### 23.12 Live Preview breakpoints

Root `admin.livePreview.breakpoints`: Mobile 390×844, Tablet 810×1080,
Desktop 1440×900 (Payload always adds Responsive).

---

## 24. Payload best-practice alignment

From Payload's docs at v3.94.2. Each is a change from today.

| #   | Practice (Payload docs)                                                                                     | Change in the kit                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `admin.group: false` hides a nav link but keeps routes; `admin.hidden` removes routes                       | Children use `group: false` (§9); `community-spaces` and `native-navigation` stop using `hidden`                                                                                  |
| 2   | Custom views are public by default; authorize with `initPageResult.req.user`                                | Audit and secure `/updates`, module settings, and every new view                                                                                                                  |
| 3   | Components import their own stylesheets; global CSS is for small overrides                                  | Shrink `custom.css`; per-component SCSS with Payload mixins (§13.6)                                                                                                               |
| 4   | Theme through Payload's CSS variables, dark mode under `html[data-theme='dark']`                            | `themeToPayloadCss` (§13)                                                                                                                                                         |
| 5   | Index `listSearchableFields`                                                                                | Consistency test (§14.6); add missing indexes                                                                                                                                     |
| 6   | `useAsTitle` points at a top-level field; use a virtual field for computed titles                           | Enrollments, Private Feeds, Reviews, Subscriptions get virtual titles                                                                                                             |
| 7   | Globals use `admin.components.elements`, collections `admin.components.edit`                                | Settings buttons go under `elements`                                                                                                                                              |
| 8   | Document actions in `beforeDocumentControls` / `editMenuItems` with `PopupList.Button`                      | Password, resync, register, test buttons move out of fields (§11)                                                                                                                 |
| 9   | Relationship `admin.appearance: 'drawer'` for large targets                                                 | Author, Series, Location, Course pickers                                                                                                                                          |
| 10  | `readVersions` access restricts the Versions UI                                                             | Admin-only on settings globals                                                                                                                                                    |
| 11  | Trash uses `delete` access; check `data.deletedAt` to allow trash but not permanent delete                  | Editors may trash content; only admins delete permanently                                                                                                                         |
| 12  | `formatDocURL` customizes list links                                                                        | Modules list → module page; Users list unchanged                                                                                                                                  |
| 13  | `admin.meta`, `dateFormat`, `timezones`, `avatar`                                                           | §23.11                                                                                                                                                                            |
| 14  | Use `useFormFields` (not `useAllFormFields`), pass only needed props to client components, use Suspense     | Review `UserTagsManager`, `ModuleAdminSettings`, navigation editor                                                                                                                |
| 15  | Pass `req` to nested Local API calls; keep hooks light; long work in the Jobs Queue                         | Already a kit convention; Regenerate All Images and Backfill Users become jobs                                                                                                    |
| 16  | Pin every Payload package to the same version                                                               | Catalog pins 3.94.2; this container had 3.92.1 installed (stale lockfile install), check `pnpm install`                                                                           |
| 17  | Experimental: modular dashboard, `enableListViewSelectAPI`, Postgres `schemaName`; beta: folders, `groupBy` | Use dashboard and groupBy with fallbacks; skip `enableListViewSelectAPI` until v4; note the kit's `cms` schema relies on experimental `schemaName` (verify slug renames under it) |
| 18  | Breadcrumbs with `useStepNav`                                                                               | Children and module pages set breadcrumbs through their parent                                                                                                                    |
| 19  | `access.admin` on the auth collection gates the admin                                                       | Already used (`canAccessAdmin`); keep `proxy.ts` gate as defense in depth                                                                                                         |
| 20  | Accessibility target WCAG 2.2 AA                                                                            | axe checks on custom screens (§15.2)                                                                                                                                              |

---

## 25. Roles, permissions and visibility

Today: roles admin, editor, author, member (only staff enter `/admin`).
Payload hides what a role can't read. When Roles & Permissions (#45) is
installed, modules declare **permission keys** (`crm:read`,
`billing:admin`); the kit maps the three built-in roles to defaults, and nav
links, views, widgets and attention items check keys instead of roles.

| Area                                                     | Admin                 | Editor                                 | Author                        |
| -------------------------------------------------------- | --------------------- | -------------------------------------- | ----------------------------- |
| Home                                                     | full                  | editor layout                          | editor layout                 |
| Content                                                  | ✓                     | ✓                                      | own items (collection access) |
| Community                                                | ✓                     | ✓                                      | —                             |
| People                                                   | ✓                     | read-only if access allows (Q9)        | —                             |
| Sales, Support, Operations, Insights                     | per module permission | per module permission                  | —                             |
| Commerce                                                 | ✓                     | —                                      | —                             |
| Marketing                                                | ✓                     | ✓                                      | —                             |
| Channels › Pages, Legal Pages, Redirects, App Onboarding | ✓                     | ✓                                      | —                             |
| Channels › Navigation, AI Agents                         | ✓                     | —                                      | —                             |
| Modules zone                                             | ✓                     | per view permission (AI Chat › Skills) | —                             |
| Settings, System, gear admin items                       | ✓                     | —                                      | —                             |
| Search                                                   | ✓                     | results they can read                  | results they can read         |
| Export                                                   | ✓                     | Form Submissions, Reports              | —                             |
| Versions tab                                             | ✓                     | on content they can edit               | on their own content          |
| Change Password (others)                                 | ✓                     | —                                      | —                             |
| Alerts                                                   | all                   | items allowing editors                 | items allowing authors        |

No greyed-out links.

---

## 26. States and edge cases

| Case                                        | Behavior                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Module not installed                        | Its collections, links, widgets, alerts, tabs, MCP tools and URLs don't exist                                                   |
| Module installed but disabled               | `admin.hidden` drops it from nav, Home, lists and routes (Payload's Not Found); APIs blocked; its tabs on other pages disappear |
| Section becomes empty                       | Not rendered                                                                                                                    |
| Family with one member                      | No family tabs                                                                                                                  |
| Child URL opened directly                   | Works; nav highlights the parent; breadcrumb through the parent                                                                 |
| Old slug URL                                | 308 to the new URL (§16.3)                                                                                                      |
| Old app build calling an old REST path      | Rewritten to the new slug while that build is supported                                                                         |
| Fresh install, unseeded                     | `SeedGate` → `/cms-setup`, then Home with Finish Setting Up first                                                               |
| Badge or attention provider slow or failing | No pill / no items from that module; logged; never blocks rendering                                                             |
| Theme fails contrast                        | Payload defaults for that mode + info alert                                                                                     |
| Draft theme                                 | Never applied to the admin except Preview in Admin for the current session                                                      |
| Restoring a version                         | Hooks run; the confirmation says what happens                                                                                   |
| Drafts turned on for an existing type       | Migration marks existing rows published                                                                                         |
| Slug changed on a published document        | Redirect created; chains collapsed                                                                                              |
| Premium content in search                   | Title only in the public index                                                                                                  |
| Module with rich-text blocks removed        | Blocks leave the editor; existing content renders without them                                                                  |
| Many module groups (> 15)                   | Revisit pinning (Q7)                                                                                                            |
| Phone                                       | §15                                                                                                                             |
| Translations                                | Labels accept Payload label objects; `translateLabel` stays                                                                     |

---

## 27. Wireframe brief for Claude Design

**Style:** the Payload admin, colored and typed by the default Dream theme
(§13). Show light; add dark for W1, W5 and W8. Payload nav, header with
breadcrumbs, `Gutter`, `Card`, `Banner`, `Pill`, `Button`, `Popup`,
`Drawer`, `Modal`. No Shopify visuals. Desktop 1440×900 unless noted.
Annotate each block with the Payload component, which items are
module-provided (module slug), and section order numbers.

| Frame | Screen                                    | What to show                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W1    | Sidebar, today's kit fully installed      | §7.1, Content open, Videos active; pills Reports 4, Subscriptions 2, Push Notifications 1, Background Jobs 1, Updates 2; Modules zone with AI Chat; Settings and System collapsed. + dark                                                                                                                                                                                                  |
| W2    | Sidebar, minimal install                  | §7.2                                                                                                                                                                                                                                                                                                                                                                                       |
| W3    | Sidebar, meet-dream                       | §7.3, Commerce open (Module Catalog)                                                                                                                                                                                                                                                                                                                                                       |
| W4    | Sidebar, full catalogue                   | §7.4, Sales open (CRM, Quotes); proves no section exceeds eight links                                                                                                                                                                                                                                                                                                                      |
| W5    | Sidebar, editor                           | Home, Content, Community, Marketing, Channels (Pages, Legal Pages, Redirects, App Onboarding), AI Chat (Skills)                                                                                                                                                                                                                                                                            |
| W6    | Home, admin, busy day                     | §18.1 with sample data: critical banner "Stripe events are failing · 12 in the last hour [Fix]"; pills Reports 4 · Past-Due Subscriptions 2 · Failed Jobs 1 · Updates 2; KPIs Members 1,240 (+38 in 7 days), Active Subscriptions 312 (+6), Monthly Revenue $5,870, Chat Conversations 88; Finish Setting Up 2 of 7; Recent Drafts; Latest Comments; module cards; All Collections. + dark |
| W7    | Home, fresh install                       | Only info "Connect GitHub to get updates"; KPIs at 0; Finish Setting Up 1 of 7                                                                                                                                                                                                                                                                                                             |
| W8    | Home, edit layout                         | Payload's edit state, Add Widget drawer listing §18.2. + dark                                                                                                                                                                                                                                                                                                                              |
| W9    | Header critical bar + Alerts popup        | "Payments are off: Stripe isn't connected [Connect]"; bell Pill 3; popup with 3 items + View All Alerts                                                                                                                                                                                                                                                                                    |
| W10   | Alerts page                               | Filters; groups Core / Billing / AI Chat; snooze popup open                                                                                                                                                                                                                                                                                                                                |
| W11   | Users list                                | Columns Display Name · Email · Roles · Account Status · Last Active; Presets menu open (Members, Staff, Invited, Suspended, All Enrollments, All Private Feeds); Group By Account Status applied                                                                                                                                                                                           |
| W12   | User edit, Profile tab                    | §11.2 layout: Change Password and Save buttons, ⋯ menu, tabs Profile · Contact · Preferences · Tags · Subscriptions · Enrollments · Private Feeds · Workspaces; side panel Avatar, Roles, Account Status, Last Active, Technical (collapsed)                                                                                                                                               |
| W13   | User edit, Enrollments tab                | Join table (Course, Progress, Enrolled), Add New open as a document drawer                                                                                                                                                                                                                                                                                                                 |
| W14   | Change Password modal                     | New Password, Confirm Password, Show toggle, rules line ("At least 12 characters"), Change Password (primary), Send Reset Email Instead, Cancel; second state: success toast                                                                                                                                                                                                               |
| W15   | Series edit with Lessons tab              | Kind Course; Lessons (12) join table with drag handles; breadcrumb; Live Preview tab present                                                                                                                                                                                                                                                                                               |
| W16   | Family tabs                               | Categories list with tabs Categories · Tag Groups; and Navigation with Web App · iOS & Android App                                                                                                                                                                                                                                                                                         |
| W17   | Report edit (moderation)                  | Resolve and Dismiss buttons; ⋯ open with Remove Content, Suspend User; confirmation modal for Suspend User                                                                                                                                                                                                                                                                                 |
| W18   | Plan edit                                 | Tabs Details · Pricing · Stripe · Subscriptions (n); side panel Sync Status; price-change confirmation modal                                                                                                                                                                                                                                                                               |
| W19   | Push Notification edit                    | Tabs Message · Audience · Schedule; side panel device preview; Send Test to Me                                                                                                                                                                                                                                                                                                             |
| W20   | Modules list                              | Name · Type (Module/Connector) · Version · Source · Enabled · Update; Install Module drawer open                                                                                                                                                                                                                                                                                           |
| W21   | Module overview (AI Chat)                 | §21.1                                                                                                                                                                                                                                                                                                                                                                                      |
| W22   | Module settings (Billing)                 | §21.2: tabs General · Pricing Page · Tags · Stripe Connector · Advanced; side panel Enabled; Test Connection button; disable confirmation                                                                                                                                                                                                                                                  |
| W23   | All Settings                              | §20.1                                                                                                                                                                                                                                                                                                                                                                                      |
| W24   | Connections                               | Connector cards with status pills                                                                                                                                                                                                                                                                                                                                                          |
| W25   | Theme Settings › Admin tab                | Admin Colors select; Preview in Admin on, with the preview banner; the admin re-colored                                                                                                                                                                                                                                                                                                    |
| W26   | Search drawer                             | Query "launch"; scope pills; results grouped Posts (2), Videos (1), Docs (1) with status pills                                                                                                                                                                                                                                                                                             |
| W27   | Saved views + Group By                    | Subscriptions with stats row (Active 312 · Trialing 14 · Canceling 9 · Past Due 2), preset Past Due, grouped by Plan                                                                                                                                                                                                                                                                       |
| W28   | Export                                    | List ⋯ → Export drawer (CSV, current columns, "Export 2 rows") → System › Exports list (Ready pill, Download, "Deleted in 7 days")                                                                                                                                                                                                                                                         |
| W29   | Redirects                                 | List From · To · Type · Created By (Automatic/Manual); edit with document picker                                                                                                                                                                                                                                                                                                           |
| W30   | Version history                           | Authentication › Versions: list with Saved By; compare "Magic Link: on → off"; restore confirmation                                                                                                                                                                                                                                                                                        |
| W31   | Rich text with blocks                     | Slash menu: Callout, Call to Action, Image with Caption, Video (Media & Podcasts), Event Card (Events)                                                                                                                                                                                                                                                                                     |
| W32   | AI Agents                                 | Status, MCP URL with copy, clients table, Revoke confirmation                                                                                                                                                                                                                                                                                                                              |
| W33   | Background Jobs                           | Failed preset; Retry on a failed job                                                                                                                                                                                                                                                                                                                                                       |
| M1    | Phone: nav open                           | 390×844, W1 structure in Payload's mobile menu                                                                                                                                                                                                                                                                                                                                             |
| M2    | Phone: Home                               | Widgets full width, KPI tiles two per row, Search and Alerts icon buttons                                                                                                                                                                                                                                                                                                                  |
| M3    | Phone: Users list                         | Four columns, horizontal scroll hint, Presets                                                                                                                                                                                                                                                                                                                                              |
| M4    | Phone: User edit                          | Tabs scrolling horizontally; custom buttons in ⋯; side panel below the form                                                                                                                                                                                                                                                                                                                |
| M5    | Phone: Change Password modal and a drawer | Full-width modal; full-screen document drawer                                                                                                                                                                                                                                                                                                                                              |
| T1    | Tablet: Series edit with Lessons          | 810×1080                                                                                                                                                                                                                                                                                                                                                                                   |
| T2    | Tablet: Home                              | Two-up widgets                                                                                                                                                                                                                                                                                                                                                                             |

---

## 28. Implementation phases

Each phase is one or more PRs into `dream-starter-kit`, green on `pnpm
typecheck && pnpm lint && pnpm test` and the relevant `pnpm test:e2e`.
meet-dream follows through the kit update, then a small PR for its local
modules (placements, `ideas` module, renames of its `modules` collections).

| Phase | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Key files                                                                                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 ✓   | Mislabeled field labels and descriptions (Users, Events, Media, Onboarding, Series, Authentication)                                                                                                                                                                                                                                                                                                                                                    | done in this branch                                                                                                                                                                                                                    |
| 1     | Sections, `inSection`/`childOf`, manifest placements, nav build, Home link, Modules label, Settings/System split; families (`group: false`, family tabs, join tabs on Users, Series, Locations, Events, Space Groups, Plans); Users page (§11.2) incl. **Change Password modal** and moving Private Feeds and Enrollments into tabs; overlay components; consistency test; query presets; groupBy; Background Jobs; admin meta/dates/time zones/avatar | `packages/mod-kit/src/{admin-sections,manifest}.ts`, `tooling/mod/src/generate.ts`, `payload/components/AdminNav*.tsx`, `payload/components/{FamilyTabs,ChangePasswordButton}.tsx`, `payload/collections/*`, `payload.config.ts`, docs |
| 1b    | Payload features, one PR each: History · Publish flow (with the `_status` backfill) · GraphQL off · Redirects · Data Export module · Live Preview breakpoints                                                                                                                                                                                                                                                                                          | §23                                                                                                                                                                                                                                    |
| 2     | Home, attention, setup, badges, Alerts bell and page; remove `FinishSetupRow`                                                                                                                                                                                                                                                                                                                                                                          | `packages/mod-kit/src/admin.ts`, `payload/components/home/*`, `payload/views/AlertsView.tsx`                                                                                                                                           |
| 2b    | One theme: `themeToPayloadCss`, brand accent stylesheet, contrast guard, Admin Colors, Preview in Admin; shrink `custom.css`; rebuild Tailwind admin components with Payload components; mobile rules and the three Playwright device projects                                                                                                                                                                                                         | `lib/theme/payload-theme.ts`, `payload/components/ThemeStyleProvider.tsx`, `app/(payload)/custom.css`, `tooling/web-e2e`                                                                                                               |
| 3     | Module overview and settings pages, All Settings, Connections view, AI Agents, Workspaces mirror, page-by-page items in §11 not done in phase 1                                                                                                                                                                                                                                                                                                        | `payload/views/*`, `payload/collections/Workspaces.ts`                                                                                                                                                                                 |
| 3b    | Slug alignment release (§16), with redirects, REST aliases and the stored-slug migration                                                                                                                                                                                                                                                                                                                                                               | collections/globals, `proxy.ts`, `next.config`, migrations, `@acme/cms`, MCP registry                                                                                                                                                  |
| 4     | Extract `media-podcasts`, `events`, `maps`, `community` (preinstalled); polymorphic field builders; adopting migrations                                                                                                                                                                                                                                                                                                                                | `modules/*`                                                                                                                                                                                                                            |
| 5     | Search module, rich-text blocks and module editor features                                                                                                                                                                                                                                                                                                                                                                                             | `modules/search`, `payload/blocks/*`                                                                                                                                                                                                   |
| later | Catalogue modules adopt the manifest placements as they're built; Courses extraction (§22.3)                                                                                                                                                                                                                                                                                                                                                           | —                                                                                                                                                                                                                                      |

Docs to update along the way: `docs/CMS.md` (sections, families, slugs),
`docs/MODULES.md` (new `admin` and `cms` manifest fields, slug claims),
`docs/DESIGN-SYSTEM.md` (admin rules: §10, §12, §14, §15), `CLAUDE.md`
(the six-groups list, the stale "Admin › Site Settings" theme line, the fixed
admin theme rule), `docs/BRAND.md` (theme drives the admin).

---

## 29. Open questions

| #   | Question                                                                              | Default if no answer                                          |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Q1  | Which media modules does meet-dream keep after phase 4?                               | Keep all installed                                            |
| Q2  | Slug renames (§16.2): ship them, given the REST alias period for old app builds?      | Yes, in phase 3b                                              |
| Q3  | Give Comments a moderation status (for a pending count and bulk approve)?             | Not in v1                                                     |
| Q4  | Subscriptions read-only in Commerce, or keep support in `/billing`'s Find an Account? | Both: read-only list for overview, changes through `/billing` |
| Q5  | Coupon redemptions and push deliveries as child tabs (need new data)?                 | Later                                                         |
| Q6  | Home AI prompt box using AI Chat?                                                     | Not in v1                                                     |
| Q7  | Pin module groups when there are many?                                                | A–Z until more than 15                                        |
| Q8  | Public search in the website and app too?                                             | Yes, published only, premium title-only                       |
| Q9  | Editors' access to Users (read-only)?                                                 | Keep today's access                                           |
| Q10 | Depend on Payload's experimental dashboard with the §18.5 fallback?                   | Yes, Payload minor pinned                                     |
| Q11 | "View as User" (impersonation) for admins?                                            | Later, audited, behind a setting                              |
| Q12 | Brand accent overrides (§13.2) beyond Payload's variables: acceptable?                | Yes, limited to the four listed elements, with visual tests   |
| Q13 | CSV import for any collection?                                                        | Off; never for Users                                          |
| Q14 | Workspaces mirror collection in Payload (phase 3)?                                    | Yes, read-mostly                                              |
| Q15 | Labels in Title Case kit-wide (§14.1), matching Payload's built-ins?                  | Yes                                                           |
