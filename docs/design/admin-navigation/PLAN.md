# Admin navigation and home: Shopify-style, module-driven `/admin`

Status: **plan, ready for wireframes** · Kit 2.7.2 · Payload 3.9x · Owner: kit core (Vincent)

This document is the handoff to **Claude Design** for wireframes of the Payload
`/admin` panel, and the implementation brief that follows them. It covers:

- the full **admin site map** and **menu structure**, with every link, label,
  target URL, owner, visibility rule and role;
- how the menu becomes **dynamic**, built from the modules that are installed
  and enabled;
- a **module API for urgent content** on the admin home page;
- the screens to wireframe, one by one.

It is inspired by the Shopify admin (75 reference screenshots, Nov 28, 2026),
but **every screen is built from standard Payload admin components and
Payload's own styling**. We copy Shopify's information architecture and
behavior, not its look. See §4 for the hard rules.

Sources read for this plan:

- Payload docs: concepts, root components, modular dashboard
  (`admin.dashboard`, experimental), custom views.
- `apps/nextjs/src/payload.config.ts`, `payload/components/AdminNav*.tsx`,
  `payload/collections/*`, `payload/globals/*`.
- `packages/mod-kit/src/manifest.ts`, `packages/mod-kit/src/payload.ts`,
  `tooling/mod/src/generate.ts`, `apps/nextjs/src/mod/registry.*.generated.*`.
- `docs/CMS.md`, `docs/MODULES.md`, `docs/MODULES-PLAN.md`.
- The downstream app `vpv-group/meet-dream` (extra modules `modules`,
  `dev-accounts`, `intercom`; extra core collections `ideas*`).

---

## Contents

1. [What we took from Shopify](#1-what-we-took-from-shopify)
2. [The admin today and what's wrong with it](#2-the-admin-today-and-whats-wrong-with-it)
3. [Design principles](#3-design-principles)
4. [Payload-only rules for design and build](#4-payload-only-rules-for-design-and-build)
5. [Navigation model: zones, sections, links](#5-navigation-model-zones-sections-links)
6. [Full site map](#6-full-site-map)
7. [Section-by-section menu spec](#7-section-by-section-menu-spec)
8. [Content collections become modules](#8-content-collections-become-modules)
9. [How the menu is built (dynamic, module-driven)](#9-how-the-menu-is-built-dynamic-module-driven)
10. [Admin home: dashboard and urgent content](#10-admin-home-dashboard-and-urgent-content)
11. [Alerts: header bar, bell and the Alerts page](#11-alerts-header-bar-bell-and-the-alerts-page)
12. [Settings area](#12-settings-area)
13. [Module pages (the "app" pattern)](#13-module-pages-the-app-pattern)
14. [Roles and visibility matrix](#14-roles-and-visibility-matrix)
15. [States and edge cases](#15-states-and-edge-cases)
16. [Wireframe brief for Claude Design](#16-wireframe-brief-for-claude-design)
17. [Implementation phases and files](#17-implementation-phases-and-files)
18. [Open questions](#18-open-questions)

---

## 1. What we took from Shopify

Screenshot numbers refer to the 75 screenshots sorted by time (00–74).
00–60 are Shopify; 61–74 are the current Dream `/admin`.

### 1.1 Observed patterns

| #   | Shopify pattern                                                                                                                                                                                                                                                                                                                                                       | Where (screenshot) | What we adopt                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | **Fixed, short top-level list of business objects**: Home, Orders (with count 16), Products, Customers, Growth, Discounts, Content, Markets, Finance, Analytics                                                                                                                                                                                                       | 24–31              | A fixed **section** list in a fixed order. Sections appear only when something is in them.                                                                                                                                                                        |
| S2  | **Children show only for the active section**: Products → Collections, Inventory, Purchase orders, Transfers, Gift cards; Content → Metaobjects, Files, Menus, Blog posts; Analytics → Reports, Live View                                                                                                                                                             | 22, 24, 26, 28–31  | Payload nav **groups as an accordion**: one section open at a time, the active one. The kit's `AdminNav` already behaves this way.                                                                                                                                |
| S3  | **Collapsed icon rail** with fly-out sub-menus when the window is narrow                                                                                                                                                                                                                                                                                              | 00–23              | **Not adopted.** Payload's nav has no icon rail. We keep Payload's open/closed nav and its mobile hamburger.                                                                                                                                                      |
| S4  | **"Sales channels" divider**: Online Store (Pages, Preferences), Point of Sale (Devices, Register sessions, Settings), Inbox, Agentic (Knowledge base)                                                                                                                                                                                                                | 32–36, 57          | A **Channels** section: Website, App, AI agents (MCP). Each channel groups the screens that control that surface.                                                                                                                                                 |
| S5  | **"Apps" divider**: each installed app gets its own entry. When active it expands into the app's own sub-nav (Instafeed → Settings, Custom media, Analytics, Channels, Plans, Partners)                                                                                                                                                                               | 47–49, 57–60       | A **Modules zone** below the main sections. A module with its own admin screens gets a nav group with its pages, ending in **Settings**.                                                                                                                          |
| S6  | **App data of a core type lives in the core section**, not under the app (e.g. app-made discounts are under Discounts)                                                                                                                                                                                                                                                | 25                 | Module collections go into the **domain section** they belong to (Videos → Content, Plans → Commerce). Only module-specific tools get a Modules-zone group.                                                                                                       |
| S7  | **Count badge on the nav item** for actionable work (Orders 16)                                                                                                                                                                                                                                                                                                       | 24–31              | Optional **count pill** per nav link. Modules provide it. Shown only for work someone must act on.                                                                                                                                                                |
| S8  | **Home = action feed**: date range and channel filter, a KPI strip (Sessions, Total sales, Orders, Conversion rate; each expands into a chart), greeting, AI prompt box, **task pills** ("Fulfill orders 9", "Capture payments 5"), then a grid of cards (offers, setup tasks, "what's new")                                                                          | 00–09, 12–13       | Home built on **Payload's modular dashboard**: an "Attention" widget (task pills), a KPI strip, setup guide, module cards, recent activity, then Payload's built-in collection cards. **No charts** (Payload has no chart component). **No AI prompt box** in v1. |
| S9  | **Alerts bell** in the nav footer with a popover ("Alerts about your store and account will show here")                                                                                                                                                                                                                                                               | 60                 | An **Alerts** button in Payload's header `actions` slot, with a `Popup` list and an `/admin/alerts` page.                                                                                                                                                         |
| S10 | **In-app banners**: blue info ("v20.2.0 is available · Apply update"), yellow warning ("Action required · Enable app embed")                                                                                                                                                                                                                                          | 47                 | The `header` slot for one critical site-wide banner (today: Updates available). Module pages use Payload `Banner` for module-level notices.                                                                                                                       |
| S11 | **Settings is a separate mode**: a gear at the bottom opens a settings sidebar (General, Plan, Billing, Users, Payments, Checkout, Customer accounts, Shipping and delivery, Taxes and duties, Locations, Apps, Sales channels, Domains, Customer events, Notifications, Metafields and metaobjects, Languages, Customer privacy, Policies). Single-column card pages | 50–56              | A **Settings** section, always last, admins only, plus an **`/admin/settings` overview page** of cards. We don't switch the whole sidebar (not a standard Payload pattern).                                                                                       |
| S12 | **Permission states**: items without access are greyed (Customers); pages explain "You need permission…" with a Request access button                                                                                                                                                                                                                                 | 24, 34, 53, 58     | Payload already **hides** entities the user can't read (`visibleEntities`). We keep hiding. No request-access flow in v1.                                                                                                                                         |
| S13 | **Scoped global search** (⌘K) with filters: Apps, Customers, Orders, Products, Sales channels                                                                                                                                                                                                                                                                         | 14–19              | **Later phase, optional**, via the official `@payloadcms/plugin-search`. Not in the v1 wireframes except a placeholder (§16, frame W16).                                                                                                                          |
| S14 | **Store switcher + account menu** at the bottom (store list, Create store, profile, Help Center, Log out)                                                                                                                                                                                                                                                             | 59                 | Payload's own account view and logout stay. Workspace switching is out of scope (the kit is one site per deploy).                                                                                                                                                 |
| S15 | **List views**: KPI strip above the table, saved filter tabs ("All"), search and filter, column picker, status pills (Paid, Unfulfilled, Draft, Active, Archived)                                                                                                                                                                                                     | 10–11, 20–25       | Payload list views already give search, filters, columns and pills. A module **may** add a small stats row with `beforeListTable` (Payload's documented slot), e.g. Subscriptions: Active · Trialing · Past due.                                                  |
| S16 | **App-store prompts** ("Picked for you" modal, recommendation cards)                                                                                                                                                                                                                                                                                                  | 38–46              | Only **inside Settings → Modules** (the existing Install module flow). No promotions on Home in v1.                                                                                                                                                               |

### 1.2 What we deliberately did not take

- Shopify's black sidebar, icon set, typography, card shadows and charts. We use
  Payload's look (§4).
- Promotional cards on Home (Shopify Credit, cashback, shipping offers). Dream
  Home shows **work, health and setup**, never ads.
- The AI prompt box on Home. The kit's MCP server already lets an AI client
  act on the CMS; a Home prompt can be a later module (§18).

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

Dashboard: Payload's default card grid of every collection and global, grouped
the same way. On top of it, `beforeDashboard` renders `SeedGate`,
`FinishSetupRow` and `DreamSiteSync`.

### 2.2 Problems

1. **Order is accidental.** Groups appear in config order (People first,
   Commerce after Modules). Within a group, order follows the config array.
2. **Every content type is always there.** Videos, Audio, Photos, Series,
   Lessons, Locations and Events are core collections, so a site that doesn't
   use them still shows them in the nav, on the dashboard, in MCP and in the DB.
3. **Group labels are free-form strings** set by each collection or module
   (`"Commerce"`, `"AI Chat"`, `"Content"`). Nothing checks them. meet-dream
   already has two different things labelled "Modules" (`kit-modules` under
   Modules and `mod-modules-catalog` under Commerce), and a comment that names
   an "Extensions" group that doesn't exist.
4. **Settings are scattered.** Site config is under System, module settings
   live on the `kit-modules` row page, and Updates is a loose link.
   Legal (content editors) sits next to Authentication (admins).
5. **Home has no "what needs me".** The dashboard is a directory, not a work
   queue. Urgent things (failed Stripe webhooks, open reports, updates) are
   either missing or only in the header bar.
6. **Modules have no admin home.** Billing, chat and dev-accounts have no
   overview; their settings sit on a generic row page.
7. **Labels leak internals:** "Billing Plans", "Feed Tokens", "Onboardings",
   "Kit sites", "Image Generation".

---

## 3. Design principles

1. **Sections are fixed; contents are dynamic.** The kit owns a short list of
   sections in a fixed order. Modules put their screens into a section. A
   section with nothing in it is not shown.
2. **Install = appear, uninstall = disappear.** A content type exists in the
   nav, on Home, in MCP, in the API and in the database only while its module
   is installed. A module that is installed but **disabled** disappears from
   the nav and Home; its URLs show a disabled notice (§15).
3. **Core data types go to core sections; tools go to the Modules zone.**
   (Shopify S6.) Videos are content, so they go to Content. The chat skills
   editor is a tool, so it lives in the AI Chat module group.
4. **Home is a work queue.** Top of Home answers "what needs me today?"; then
   "how are we doing?"; then "finish setting up"; then shortcuts.
5. **Settings are separate and admin-only.** Daily editors never see them.
6. **One level of nesting.** Section → links. No third level in the nav. Deeper
   structure lives inside the page (tabs, list filters).
7. **Payload first.** If Payload has a component, slot or view for it, we use it
   as is.

---

## 4. Payload-only rules for design and build

These are hard rules for Claude Design and for the code that follows.

### 4.1 Visual

- **Use Payload's admin look only.** Payload's default theme tokens (the
  `--theme-elevation-*`, `--theme-success-*`, `--theme-error-*`,
  `--theme-warning-*` scales, `--base` spacing, `--style-radius-*`) as
  already mapped by `lib/theme/admin-theme.ts`. Light and dark both.
- **No Shopify styling**: no black sidebar, no Shopify icons or illustrations,
  no charts or sparklines, no gradient cards.
- **No shadcn / Tailwind classes in new admin components.** The kit's
  `(payload)/custom.css` allows Tailwind utilities in admin, but new screens
  use Payload components and Payload CSS variables only. Audit item: the
  existing `FinishSetupRow.tsx` and the billing / Stripe `./admin` panels use
  Tailwind classes; they get rebuilt from Payload components in phase 2.
- Icons: only those Payload ships (or none). Nav links have no icons, as in
  Payload's default nav.

### 4.2 Components to use (from `@payloadcms/ui` / `@payloadcms/next`)

| Need                           | Payload component / API                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Page frame for custom views    | `DefaultTemplate` (`@payloadcms/next/templates`) + `Gutter`                                                                          |
| Breadcrumbs                    | `SetStepNav` / `StepNav`                                                                                                             |
| Sidebar                        | `admin.components.Nav` (the kit's `AdminNav`), built from `NavGroup`, `Link`, Payload `nav__*` classes, `NavHamburger`, `NavWrapper` |
| Links above / below the groups | `admin.components.beforeNavLinks` / `afterNavLinks`                                                                                  |
| Gear menu in the nav footer    | `admin.components.settingsMenu`                                                                                                      |
| Header buttons (Alerts bell)   | `admin.components.actions`                                                                                                           |
| Site-wide bar above the header | `admin.components.header`                                                                                                            |
| Home                           | `admin.dashboard.widgets` + `admin.dashboard.defaultLayout` (modular dashboard, **experimental**, §10.6)                             |
| Cards and directories          | `Card` (title, href, actions) — the same card the default dashboard uses                                                             |
| Notices                        | `Banner` (`type: default · info · success · warning · error`)                                                                        |
| Counts and status              | `Pill` (`pillStyle: light-gray · success · warning · error · dark …`)                                                                |
| Buttons                        | `Button` (`buttonStyle: primary · secondary · pill · none`)                                                                          |
| Pop-overs                      | `Popup` + `PopupList`                                                                                                                |
| Collapsible blocks             | `Collapsible`                                                                                                                        |
| Loading                        | `ShimmerEffect`, `Spinner`                                                                                                           |
| Tables in custom views         | `Table` or a plain list of `Card`s; collection lists use Payload's `ListView` as is                                                  |
| Above a list table             | collection `admin.components.beforeListTable` / `beforeList`                                                                         |
| Empty list                     | Payload's `NoListResults` (default)                                                                                                  |
| Module settings                | the existing `kit-modules` row page (Payload document view + tabs)                                                                   |

### 4.3 Behavior

- Groups come from Payload's `admin.group`. We keep using strings, but only
  ones from the kit's section registry (§9.2).
- Hide with Payload's `admin.hidden` and access control; never with CSS.
- Custom pages are Payload **custom views** (`admin.components.views`), so they
  get the nav, header, auth and permissions for free.

---

## 5. Navigation model: zones, sections, links

### 5.1 Zones (top to bottom)

```
┌───────────────────────────────┐
│ Home                          │  zone A: entry   (beforeNavLinks)
├───────────────────────────────┤
│ Content            ▸          │
│ Community          ▸          │
│ People             ▸          │  zone B: main sections
│ Commerce           ▸          │  (fixed order, shown only if non-empty)
│ Marketing          ▸          │
│ Channels           ▸          │
├── Modules ────────────────────┤  zone C: module groups
│ AI Chat            ▸          │  (one group per module with its own
│ Developer accounts ▸          │   admin screens, A–Z)
├───────────────────────────────┤
│ Settings           ▸          │  zone D: settings (admins)
├───────────────────────────────┤
│ ⚙ (gear menu)   Log out       │  nav footer: settingsMenu + logout
└───────────────────────────────┘
```

- **Zone A**: one link, **Home** → `/admin`. Today the only way back to
  Home is the breadcrumb icon. Rendered in `beforeNavLinks`, styled like a
  Payload nav link. Payload's "Browse by Folder" link stays directly under it
  while `folders.browseByFolder` is on.
- **Zone B**: kit sections, fixed order. Each is a Payload `NavGroup`.
- **Zone C**: a small, non-clickable divider label "Modules" (Payload's
  nav-group label style), then one `NavGroup` per module that has its own admin
  screens. Hidden entirely when no module qualifies.
- **Zone D**: the **Settings** `NavGroup`, always last. Hidden for non-admins.
- **Footer**: Payload's `nav__controls` with the gear (`settingsMenu`) and
  logout, as today.

### 5.2 Accordion behavior (kept from today's `AdminNav`)

- One group open at a time.
- On load, the group containing the current page opens and its link is bold
  (Payload's active indicator).
- On Home or a page outside the nav, the last group the user opened opens
  (the `nav` preference); before any choice, nothing opens. (Change from
  today, which opens the first group: with Home as a real link, starting
  closed reads like Shopify's Home.)

### 5.3 Labels

- Sentence case, plural nouns for collections ("Push notifications"), plain
  nouns for globals ("Brand & theme").
- No internal words: not "Billing Plans", "Feed Tokens", "Kit sites",
  "Onboardings", "mod-*".
- Each nav label comes from the collection's `labels.plural` or the global's
  `label`, so the page title and the nav always match. Renames below are
  changes to those labels.

### 5.4 Count pills

- A link may show a Payload `Pill` (small, `light-gray`; `error` when the
  module says it's urgent) with a count, right-aligned.
- Counts are for **work to do**, never totals: open reports, past-due
  subscriptions, updates available, failed pushes.
- Shown as `99+` above 99. Hidden at 0.
- Provided by the module (§9.5). Cached for 60 s per user role.

---

## 6. Full site map

Legend: `[core]` kit core · `[mod:slug]` module (existing) ·
`[mod:slug]*` **new module extracted from core** (§8) · `(view)` custom
Payload view · `(global)` Payload global · `#n` count pill ·
`admin` = admins only.

### 6.1 Kit, every module installed

```
/admin
├─ Home                                   (view: dashboard)            [core]
├─ Browse by Folder                       (Payload folders view)       [core]
│
├─ Content
│  ├─ Posts                               collections/posts            [core]
│  ├─ Videos                              collections/videos           [mod:video]*
│  ├─ Podcasts                            collections/audio            [mod:podcast]*
│  ├─ Photos                              collections/photos           [mod:gallery]*
│  ├─ Courses                             collections/series           [mod:courses]*
│  ├─ Lessons                             collections/lessons          [mod:courses]*
│  ├─ Events                              collections/events           [mod:events]*
│  ├─ Places                              collections/locations        [mod:maps]*
│  ├─ Docs                                collections/mod-docs-pages   [mod:docs]
│  ├─ Categories                          collections/categories       [core]
│  ├─ Tags                                collections/tag-groups       [core]
│  └─ Media                               collections/media            [core]
│
├─ Community
│  ├─ Spaces                              collections/space-groups     [mod:community]*
│  ├─ Community posts                     collections/community-posts  [mod:community]*
│  ├─ Comments                            collections/comments         [core]
│  ├─ Reviews                             collections/reviews          [core, needs a reviewable type]
│  └─ Reports                  #open      collections/reports          [core]
│
├─ People
│  ├─ Users                               collections/users            [core]
│  ├─ Enrollments                         collections/enrollments      [mod:courses]*
│  └─ Private feeds                       collections/feed-tokens      [mod:podcast]*
│
├─ Commerce
│  ├─ Plans                               collections/mod-billing-plans          [mod:billing]
│  ├─ Coupons                             collections/mod-billing-coupons        [mod:billing]
│  ├─ Subscriptions            #past due  collections/mod-billing-subscriptions  [mod:billing]
│  └─ Billing settings                    /admin/module-settings/billing        [mod:billing] admin
│
├─ Marketing
│  ├─ Push notifications       #failed    collections/notifications    [core]
│  ├─ Banners                             collections/banners          [core]
│  └─ Forms                               collections/forms            [core: form-builder]
│
├─ Channels
│  ├─ Pages                               collections/pages            [core]
│  ├─ Navigation                          collections/nav-items        [core]   (web menu + app tab bar)
│  ├─ App onboarding                      collections/onboarding       [core]
│  └─ AI agents (MCP)                     /admin/channels/mcp (view)   [core] admin  (phase 3)
│
├─ ── Modules ──
│  └─ AI Chat
│     ├─ Overview                         /admin/module/chat (view)    [mod:chat]
│     ├─ Skills                           collections/mod-chat-skills  [mod:chat]
│     └─ Settings                         /admin/module-settings/chat  [mod:chat] admin
│
└─ Settings                                                            admin
   ├─ All settings                        /admin/settings (view)       [core]
   ├─ General                             globals/site-settings        [core]
   ├─ Brand & theme                       globals/theme-settings       [core]
   ├─ Sign-in & accounts                  globals/authentication-settings [core]
   ├─ Profile fields                      globals/profile-fields       [core]
   ├─ Legal & policies                    collections/legal            [core]
   ├─ AI image generation                 globals/image-generation-settings [core]
   ├─ Modules                             collections/kit-modules      [core]
   ├─ Updates                  #available /admin/updates (view)        [core]
   └─ Site license                        globals/dream-site           [core]
```

Hidden from the nav (unchanged, reached from their parent screen): `tags`
(inline in Tags), `community-spaces` (inline in Spaces), `form-submissions`
(join field on Forms), `native-navigation` (edited on the Navigation screen),
every `mod-*-settings` global (shown on the module's settings page).

### 6.2 Kit, minimal install (no optional content modules, no billing, no chat)

```
Home
Browse by Folder
Content     Posts · Categories · Tags · Media
Community   Comments · Reports
People      Users
Marketing   Push notifications · Banners · Forms
Channels    Pages · Navigation · App onboarding
Settings    All settings · General · Brand & theme · Sign-in & accounts ·
            Profile fields · Legal & policies · AI image generation ·
            Modules · Updates · Site license
```

No Commerce section, no Modules zone, Reviews hidden (no reviewable type).

### 6.3 meet-dream (today's install, after this plan)

```
Home
Browse by Folder
Content     Posts · Ideas · Idea categories · Docs · Categories · Tags · Media
            (+ Videos, Podcasts, Photos, Courses, Lessons, Events, Places only
             if those modules stay installed; see §18 Q1)
Community   Spaces · Community posts · Comments · Reviews · Reports
People      Users · Shared ideas · Licensed sites
            (+ Enrollments, Private feeds if courses/podcast stay installed)
Commerce    Plans · Coupons · Subscriptions · Module catalog · Module releases ·
            Billing settings
Marketing   Push notifications · Banners · Forms
Channels    Pages · Navigation · App onboarding · AI agents (MCP)
── Modules ──
AI Chat              Overview · Skills · Settings
Developer accounts   Overview · Settings
Settings    All settings · General · Brand & theme · Sign-in & accounts ·
            Profile fields · Legal & policies · AI image generation ·
            Modules · Updates · Site license
```

Placement of meet-dream's own entities:

| Entity                            | Today            | After                                                   | Why                                                                            |
| --------------------------------- | ---------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `ideas`, `idea-categories`        | Content (core)   | Content, via a local `ideas` module                     | Content type that only meet-dream has                                          |
| `idea-shares`                     | Content          | People › **Shared ideas**                               | Owner-scoped member data (verify with the collection's purpose)                |
| `mod-modules-catalog` ("Modules") | Commerce         | Commerce › **Module catalog**                           | It's the product list sold; renaming removes the clash with Settings › Modules |
| `mod-modules-releases`            | Commerce         | Commerce › **Module releases**                          | Versions of catalog products                                                   |
| `mod-modules-sites` ("Kit sites") | Commerce         | People › **Licensed sites**                             | It's a list of licensees (customers)                                           |
| `dev-accounts` settings           | Modules row page | Modules zone › Developer accounts (Overview + Settings) | Has its own operational overview (founder progress)                            |
| `intercom` settings               | Modules row page | Settings › Modules › Intercom (no nav group)            | Settings only; no screens of its own                                           |

Note on meet-dream: the "Developer accounts" flow is not launched yet. The
admin group can exist (staff only), but keep the founder-facing app menu entry
off until launch, as `docs/context/DREAM.md` requires.

---

## 7. Section-by-section menu spec

Each table row is one nav link. `Order` is the sort key inside the section
(gaps of 10 leave room for modules). `Roles`: A = admin, E = editor,
Au = author (from `cms.users.roles`). Today's slugs and URLs don't change;
only labels and groups do.

### 7.1 Zone A

| Order | Label            | Target                    | Roles  | Notes                      |
| ----- | ---------------- | ------------------------- | ------ | -------------------------- |
| 0     | Home             | `/admin`                  | A E Au | New `beforeNavLinks` link  |
| 5     | Browse by Folder | `/admin/browse-by-folder` | A E Au | Payload built-in (folders) |

### 7.2 Content (`content`, order 10)

The editorial library. Shopify: Products + Content.

| Order | Label           | Target                        | Owner              | Roles  | Notes                                         |
| ----- | --------------- | ----------------------------- | ------------------ | ------ | --------------------------------------------- |
| 10    | Posts           | `collections/posts`           | core               | A E Au | Blog and articles                             |
| 20    | Videos          | `collections/videos`          | `video`*           | A E Au | Includes vertical shorts                      |
| 30    | Podcasts        | `collections/audio`           | `podcast`*         | A E Au | Was "Audio"                                   |
| 40    | Photos          | `collections/photos`          | `gallery`*         | A E Au |                                               |
| 50    | Courses         | `collections/series`          | `courses`*         | A E Au | Was "Series"                                  |
| 51    | Lessons         | `collections/lessons`         | `courses`*         | A E Au |                                               |
| 60    | Events          | `collections/events`          | `events`*          | A E Au |                                               |
| 70    | Places          | `collections/locations`       | `maps`*            | A E Au | Was "Locations"                               |
| 80    | Docs            | `collections/mod-docs-pages`  | `docs`             | A E Au | Was "Documentation"                           |
| 85    | Ideas           | `collections/ideas`           | meet-dream `ideas` | A E    | meet-dream only                               |
| 86    | Idea categories | `collections/idea-categories` | meet-dream `ideas` | A E    | meet-dream only                               |
| 900   | Categories      | `collections/categories`      | core               | A E    | Shared taxonomy                               |
| 910   | Tags            | `collections/tag-groups`      | core               | A E    | Tag groups with tags inline                   |
| 920   | Media           | `collections/media`           | core               | A E Au | Shared file library (Shopify Content › Files) |

Rule: content types first (by order), shared libraries (taxonomy, media) last.

### 7.3 Community (`community`, order 20)

| Order | Label           | Target                        | Owner        | Roles | Pill                                         | Notes                                                             |
| ----- | --------------- | ----------------------------- | ------------ | ----- | -------------------------------------------- | ----------------------------------------------------------------- |
| 10    | Spaces          | `collections/space-groups`    | `community`* | A E   |                                              | Space groups with spaces inline                                   |
| 20    | Community posts | `collections/community-posts` | `community`* | A E   |                                              |                                                                   |
| 30    | Comments        | `collections/comments`        | core         | A E   | pending, if comments get a moderation status | One threaded system for all commentable types                     |
| 40    | Reviews         | `collections/reviews`         | core         | A E   |                                              | Shown only when a reviewable type is installed (`events`, `maps`) |
| 50    | Reports         | `collections/reports`         | core         | A E   | open reports (error style)                   | Moderation queue                                                  |

Without the community module, the section is Comments · Reviews? · Reports.

### 7.4 People (`people`, order 30)

| Order | Label          | Target                          | Owner                | Roles                             | Notes                                                                                           |
| ----- | -------------- | ------------------------------- | -------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| 10    | Users          | `collections/users`             | core                 | A (E read-only, if access allows) | Members and staff. List gets saved filter presets "Members" and "Staff" (Payload query presets) |
| 20    | Enrollments    | `collections/enrollments`       | `courses`*           | A E                               |                                                                                                 |
| 30    | Private feeds  | `collections/feed-tokens`       | `podcast`*           | A                                 | Was "Feed Tokens"                                                                               |
| 40    | Shared ideas   | `collections/idea-shares`       | meet-dream `ideas`   | A                                 | meet-dream only                                                                                 |
| 50    | Licensed sites | `collections/mod-modules-sites` | meet-dream `modules` | A                                 | meet-dream only; was "Kit sites"                                                                |

Workspaces (B2B orgs) live in `public` under RLS, not in Payload. They are
**not** in this nav in v1 (§18 Q5).

### 7.5 Commerce (`commerce`, order 40) — owned by `billing`

The whole section exists only when `billing` is installed and enabled.

| Order | Label            | Target                                  | Owner                | Roles | Pill                                                    | Notes                                                                                                        |
| ----- | ---------------- | --------------------------------------- | -------------------- | ----- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 10    | Plans            | `collections/mod-billing-plans`         | `billing`            | A     |                                                         | Was "Billing Plans". Provider tabs (Stripe) unchanged                                                        |
| 20    | Coupons          | `collections/mod-billing-coupons`       | `billing`            | A     |                                                         | Was "Billing Coupons"                                                                                        |
| 30    | Subscriptions    | `collections/mod-billing-subscriptions` | `billing`            | A     | past due (warning)                                      | **Unhidden**, read-only list (§18 Q4). `beforeListTable` stats row: Active · Trialing · Canceling · Past due |
| 40    | Module catalog   | `collections/mod-modules-catalog`       | meet-dream `modules` | A     |                                                         | meet-dream only                                                                                              |
| 41    | Module releases  | `collections/mod-modules-releases`      | meet-dream `modules` | A     |                                                         | meet-dream only                                                                                              |
| 990   | Billing settings | `/admin/module-settings/billing`        | `billing`            | A     | error pill when Stripe isn't connected or webhooks fail | Section-owner settings link (§9.4)                                                                           |

### 7.6 Marketing (`marketing`, order 50)

Reaching people. Shopify: Growth.

| Order | Label              | Target                      | Owner               | Roles | Pill                 | Notes                                       |
| ----- | ------------------ | --------------------------- | ------------------- | ----- | -------------------- | ------------------------------------------- |
| 10    | Push notifications | `collections/notifications` | core                | A E   | failed sends (error) | Was "Notifications". Used by MCP `notify_*` |
| 20    | Banners            | `collections/banners`       | core                | A E   |                      | In-app announcement banners                 |
| 30    | Forms              | `collections/forms`         | core (form-builder) | A E   |                      | Submissions via the join field              |

### 7.7 Channels (`channels`, order 60)

Where the product shows up. Shopify: Sales channels.

| Order | Label           | Target                       | Owner | Roles | Notes                                                                                                                                                                                                                          |
| ----- | --------------- | ---------------------------- | ----- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 10    | Pages           | `collections/pages`          | core  | A E   | Website pages (was under Marketing)                                                                                                                                                                                            |
| 20    | Navigation      | `collections/nav-items`      | core  | A     | Web sidebar menu + app tab bar (unchanged screen, was under Modules)                                                                                                                                                           |
| 30    | App onboarding  | `collections/onboarding`     | core  | A E   | Mobile onboarding screens (was "Onboardings" under Marketing)                                                                                                                                                                  |
| 40    | AI agents (MCP) | `/admin/channels/mcp` (view) | core  | A     | **New, phase 3.** Shows: MCP enabled/disabled (`MCP_JWT_SECRET`, `MCP_ENABLED`), the `/mcp` URL to copy, connected clients (from `mcp_oauth_*`, server-side), and a Revoke button per client. Hidden when MCP isn't configured |

Theme stays in Settings (it also holds branding and is admin-only).

### 7.8 Zone C: module groups (order 100+, A–Z by module name)

A module gets a group here when it declares admin screens that don't belong in
a domain section (§9.3). Each group follows the same pattern:

```
<Module name>
├─ Overview          /admin/module/<slug>            (optional custom view)
├─ <screens…>        collections/… or custom views
└─ Settings          /admin/module-settings/<slug>    (admins; when the module has settings)
```

| Group              | Links                        | Owner                                          | Roles           |
| ------------------ | ---------------------------- | ---------------------------------------------- | --------------- |
| AI Chat            | Overview · Skills · Settings | `chat` (+ Slack/SMS adapters as settings tabs) | A (Skills: A E) |
| Developer accounts | Overview · Settings          | meet-dream `dev-accounts`                      | A               |

Modules with **no** group (settings only, or nothing for admins): dashboard,
notifications, reminders, intercom, billing-adapter-stripe, chat adapters,
docs (its collection goes to Content), billing (its collections go to
Commerce). Their settings are under Settings › Modules.

### 7.9 Settings (`settings`, order 1000) — admins only

| Order | Label               | Target                              | Owner | Notes                                                                                             |
| ----- | ------------------- | ----------------------------------- | ----- | ------------------------------------------------------------------------------------------------- |
| 0     | All settings        | `/admin/settings` (view)            | core  | Overview page of cards (§12)                                                                      |
| 10    | General             | `globals/site-settings`             | core  | Was "Site Settings"                                                                               |
| 20    | Brand & theme       | `globals/theme-settings`            | core  | Was "Theme"                                                                                       |
| 30    | Sign-in & accounts  | `globals/authentication-settings`   | core  | Was "Authentication"                                                                              |
| 40    | Profile fields      | `globals/profile-fields`            | core  |                                                                                                   |
| 50    | Legal & policies    | `collections/legal`                 | core  | Was "Legal" (System). Editors keep access through the Settings overview card and direct URL (§14) |
| 60    | AI image generation | `globals/image-generation-settings` | core  | Was "Image Generation"                                                                            |
| 70    | Modules             | `collections/kit-modules`           | core  | Installed modules, enable/disable, Install module. Each module's settings page is a row here      |
| 80    | Updates             | `/admin/updates` (view)             | core  | Pill: updates available. Was a loose link (`afterNavLinks`)                                       |
| 90    | Site license        | `globals/dream-site`                | core  |                                                                                                   |

### 7.10 Gear menu (`settingsMenu`, nav footer)

Payload's standard gear popup. Quick links only (all also in the nav):

1. All settings → `/admin/settings`
2. Modules → `/admin/collections/kit-modules`
3. Updates → `/admin/updates`
4. Your account → `/admin/account` (Payload account view)

---

## 8. Content collections become modules

To make "no video library module ⇒ no Videos collection" true, the optional
content types move out of core into modules. Each new module is a normal kit
module (`modules/<slug>`, built with `pnpm mod create`), shipped
**preinstalled** in the kit so nothing disappears for existing apps. A founder
can then remove what they don't use (`pnpm mod remove video`).

### 8.1 Extraction table

| New module         | Name          | Collections it takes                                  | Also moves                                                                             | Requires                                            |
| ------------------ | ------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `video`            | Video library | `videos`                                              | public `/videos` routes, `useVideos`, native content screen, MCP entry, seed step      | —                                                   |
| `podcast`          | Podcasts      | `audio`, `feed-tokens`                                | `/podcasts` routes, private feed endpoint, hooks, native screen, MCP entry, seed       | —                                                   |
| `gallery`          | Photo gallery | `photos`                                              | routes, hooks, native screen, MCP entry, seed                                          | —                                                   |
| `courses`          | Courses       | `series`, `lessons`, `enrollments`                    | routes, hooks, native screens, MCP entries, seed                                       | `billing` optional (enrollment ↔ subscription link) |
| `events`           | Events        | `events`                                              | routes, hooks, native screen, MCP entry, seed; makes `reviews` visible                 | `maps` optional (event venue)                       |
| `maps`             | Maps & places | `locations`                                           | routes, map components, hooks, native screen, MCP entry, seed; makes `reviews` visible | —                                                   |
| `community`        | Community     | `space-groups`, `community-spaces`, `community-posts` | community routes, hooks, native screens, MCP entries, seed                             | —                                                   |
| meet-dream `ideas` | Ideas         | `ideas`, `idea-categories`, `idea-shares`             | meet-dream's idea routes and components                                                | — (app-local module)                                |

**Stays core:** `users`, `media`, `posts`, `pages`, `categories`, `tags`,
`tag-groups`, `comments`, `reviews`, `reports`, `notifications`, `banners`,
`onboarding`, `forms`, `form-submissions`, `legal`, `nav-items`,
`kit-modules`, and all core globals. Posts and Pages are the minimum a site
needs; comments, reviews and reports are shared engagement systems that point
at whatever types are installed.

### 8.2 Cross-collection references must tolerate missing types

Several core fields point at many collections. After extraction they are built
from what's installed:

| Field                                                             | Today                        | After                                                                                                              |
| ----------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `comments.target` (polymorphic `relationTo`)                      | Fixed list                   | `commentableCollections()`: posts + every installed collection with `cms.commentable: true`                        |
| `reviews.target`                                                  | `["locations", "events"]`    | `reviewableCollections()`; **Reviews is hidden** when the list is empty                                            |
| `banners` / `nav-items` destination fields (`fields/destination`) | Fixed list                   | Installed collections with `cms.linkable: true`                                                                    |
| `public.content_favorites.collection`                             | Text value                   | No schema change. Favorites of a removed type are ignored by the readers and cleaned up by the module's `drop.sql` |
| `enrollments.subscription` → `mod-billing-subscriptions`          | Hard relation                | Added only when billing is installed (field condition at config build)                                             |
| `events.location` → `locations`                                   | Hard relation                | Relation when `maps` is installed, otherwise a plain venue text field                                              |
| MCP `MCP_COLLECTIONS`                                             | Fixed list in `packages/mcp` | Core entries + module entries (the `collectionsFor({ extraCollections })` hook already exists)                     |
| `seedCmsContent()` steps                                          | Core steps                   | Each module's `seed` steps (`modSeedSteps` already exists)                                                         |

### 8.3 Existing installs: move ownership without dropping data

Moving a collection from core config to a module must not drop or recreate
its tables (expand/contract rule):

1. The module's first Payload migration **adopts** existing tables: it creates
   them only `IF NOT EXISTS`, so it is a no-op on existing sites and creates
   the schema on new ones.
2. Core keeps the old migrations (append-only). No core migration drops the
   tables.
3. The kit release that ships the extraction ships the new modules
   **preinstalled** and enabled, so existing apps see no change except the
   new menu.
4. Removing a module later runs its `drop.sql` / Payload down migration (the
   normal `pnpm mod remove` path), after a confirm that names the row counts.

This is the riskiest part of the plan. It ships as its own release with its
own E2E (§17, phase 4), after the menu work.

---

## 9. How the menu is built (dynamic, module-driven)

### 9.1 Inputs

1. **Installed modules**: the generated registries (`registry.payload.generated.ts`
   etc.), fixed at build time. A module that isn't installed has no
   collections in the config, so Payload never shows it.
2. **Enabled state**: the `kit-modules` row's `enabled` flag (runtime).
3. **The user's permissions**: Payload's `visibleEntities` and
   `permissions` (roles → access functions).
4. **Section registry and placements** (new, below).

### 9.2 Section registry (new, in `@acme/mod-kit`)

```ts
// packages/mod-kit/src/admin-sections.ts
export const ADMIN_SECTIONS = {
  content: { label: "Content", order: 10, zone: "main" },
  community: { label: "Community", order: 20, zone: "main" },
  people: { label: "People", order: 30, zone: "main" },
  commerce: { label: "Commerce", order: 40, zone: "main" },
  marketing: { label: "Marketing", order: 50, zone: "main" },
  channels: { label: "Channels", order: 60, zone: "main" },
  settings: { label: "Settings", order: 1000, zone: "settings" },
} as const;
export type AdminSection = keyof typeof ADMIN_SECTIONS;

/** Spread into a collection/global `admin` block. */
export function inSection(section: AdminSection, order = 100) {
  return {
    group: ADMIN_SECTIONS[section].label,
    custom: { navSection: section, navOrder: order },
  };
}
```

- Core collections and globals switch from `admin: { group: "Content" }` to
  `admin: { ...inSection("content", 10) }`.
- Module collections use the same helper, or get placed by the manifest (§9.3).
- `pnpm mod sync` **fails** when any collection or global in the final config
  has an `admin.group` that is not a section label or the name of a module
  group. No more stray groups.

### 9.3 Manifest additions (`packages/mod-kit/src/manifest.ts`)

Today `admin` only has `settingsComponent`. It grows to:

```ts
admin: z.object({
  /** Existing: ./admin exports a client AdminSettings component. */
  settingsComponent: z.boolean().default(false),

  /**
   * Where this module's collections go in /admin.
   *  - an AdminSection key: every collection joins that section
   *  - "module": the module gets its own group in the Modules zone
   * Per-collection overrides below win.
   */
  section: z.union([AdminSectionKey, z.literal("module")]).default("module"),

  /** Per-collection placement and order, by collection slug. */
  collections: z.record(z.object({
    section: z.union([AdminSectionKey, z.literal("module")]).optional(),
    order: z.number().int().optional(),
  })).default({}),

  /** This module owns its section: its Settings link is appended there (§9.4). */
  ownsSection: z.boolean().default(false),

  /** Custom admin views the module adds, as nav links. */
  views: z.array(z.object({
    key: z.string(),              // e.g. "overview"
    label: z.string(),            // "Overview"
    path: z.string(),             // "/module/chat" (under /admin)
    section: z.union([AdminSectionKey, z.literal("module")]).default("module"),
    order: z.number().int().default(0),
    roles: z.array(Role).default(["admin"]),
  })).default([]),

  /** ./admin-server exports these (server-only entry). */
  dashboard: z.object({
    widgets: z.boolean().default(false),   // exports `dashboardWidgets`
    attention: z.boolean().default(false), // exports `attention(ctx)`
    badges: z.boolean().default(false),    // exports `navBadges(ctx)`
  }).default({}),
}).default({}),
```

Examples:

```ts
// modules/billing/module.config.ts
admin: {
  settingsComponent: true,
  section: "commerce",
  ownsSection: true,
  collections: {
    "mod-billing-plans": { order: 10 },
    "mod-billing-coupons": { order: 20 },
    "mod-billing-subscriptions": { order: 30 },
  },
  dashboard: { widgets: true, attention: true, badges: true },
}

// modules/video/module.config.ts (new)
admin: { section: "content", collections: { videos: { order: 20 } } }

// modules/chat/module.config.ts
admin: {
  section: "module",
  views: [{ key: "overview", label: "Overview", path: "/module/chat", order: 0 }],
  collections: { "mod-chat-skills": { order: 10 } },
  dashboard: { widgets: true, attention: true },
}
```

`pnpm mod sync` applies placements when it composes `modCollections`: it sets
`admin.group` (section label, or the module's name for `"module"`) and
`admin.custom.navSection` / `navOrder` / `modSlug` on each collection. Modules
no longer write `admin.group` themselves (lint warns if they do).

### 9.4 Nav build algorithm (`AdminNav.tsx`, server component)

```
input: config, visibleEntities, permissions, user, enabledModules (cached)

1. entities = visible collections + visible globals          (Payload, as today)
2. drop entities whose admin.custom.modSlug is a disabled module
3. add module view links (manifest admin.views) the user's roles allow,
   and only for enabled modules
4. add section-owner settings links:
     for each enabled module with ownsSection && settings && user is admin:
       append { label: "<Module> settings", href: /admin/module-settings/<slug>,
                section: module.section, order: 990 }
5. add module-group settings links:
     for each enabled module group (zone C) with settings && user is admin:
       append { label: "Settings", order: 999 } to that group
6. group by admin.custom.navSection (or module group name)
7. sort groups: zone (main → modules → settings), then section order,
   then module name A–Z for zone C
8. sort links in each group by navOrder, then label
9. drop empty groups
10. fetch badges for the visible links (cached, §9.5)
11. render: Home + Browse by Folder (beforeNavLinks),
            main groups, "Modules" divider + module groups (if any),
            Settings group, afterNavLinks, footer
```

Notes:

- Uses Payload's `groupNavItems()` for permission filtering, as today, then
  re-sorts. The accordion client (`AdminNavClient.tsx`) is unchanged apart
  from rendering custom links and pills.
- Payload's built-in `collections` dashboard widget reads `admin.hidden`, not
  our nav. To keep Home's card grid in line with the nav for **disabled**
  modules, module collections get `admin.hidden: ({ user }) => isModuleDisabled(slug)`
  set by `mod sync`. `isModuleDisabled` reads an in-process cache of
  enabled flags: filled at boot (`onInit`), refreshed by the `kit-modules`
  `afterChange` hook, and re-warmed by `AdminNav` on each render (async read,
  60 s TTL) so other server instances catch up. Access control still blocks
  disabled modules' APIs, as today.

### 9.5 Badges

```ts
// a module's ./admin-server entry (server-only)
export const navBadges: NavBadgeProvider = async ({ req }) => [
  {
    href: "/admin/collections/mod-billing-subscriptions",
    count: pastDue,
    tone: "warning",
  },
];
```

- Run in parallel with a 1.5 s timeout each; a failing provider shows no pill
  and logs `[admin-badges] <slug>`.
- Cached per (module, role) for 60 s with Next's data cache
  (`unstable_cache`, tag `admin-badges`). Modules can `revalidateTag` it.
- Core badges: Reports (open), Push notifications (failed), Updates
  (available).

---

## 10. Admin home: dashboard and urgent content

### 10.1 Layout (default for admins)

Built with Payload's modular dashboard: widgets in a responsive grid, each
with a width from `x-small` to `full`. Admins can rearrange, resize, add and
remove widgets; Payload stores each user's layout in their preferences, and
"Reset layout" brings back the default below.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [header slot: one critical site-wide banner, only when one exists]       │
├──────────────────────────────────────────────────────────────────────────┤
│ Home                                               [🔔 Alerts 3] (header)│
│ Good morning, <first name>.                                              │
├──────────────────────────────────────────────────────────────────────────┤
│ W1 Needs attention                                             (full)    │
│  ┌ Banner error ─────────────────────────────────────────────────────┐   │
│  │ Stripe webhooks are failing · 12 events in the last hour [Fix]    │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│  [Reports 4 ›] [Past-due subscriptions 2 ›] [Scheduled pushes 1 ›]      │
│  (task pills: Payload Pill + Link, like Shopify "Fulfill orders 9")      │
├──────────────────────────────────────────────────────────────────────────┤
│ W2 KPI   │ W2 KPI    │ W2 KPI          │ W2 KPI                         │
│ Members  │ Active    │ MRR             │ Chat conversations             │
│ 1,240    │ subs 312  │ $5,870          │ 88 this week                   │
│ +38 / 7d │ +6 / 7d   │ (billing)       │ (chat)                         │
│ (x-small each; numbers + short delta text, no charts)                    │
├──────────────────────────────────────────────────────────────────────────┤
│ W3 Finish setting up                                   (medium, hides    │
│  ☑ Create your admin account                            when complete)   │
│  ☐ Connect GitHub for updates             [Connect]                      │
│  ☐ Connect Stripe                         [Connect]                      │
│  ☐ Set your brand                         [Open]                         │
├───────────────────────────────────┬──────────────────────────────────────┤
│ W4 Recent drafts (medium)         │ W5 Latest comments (medium)          │
│  Post · "Launch week" · 2h ago    │  "Love this!" on Post X · 5m ago     │
├───────────────────────────────────┴──────────────────────────────────────┤
│ W6 Module cards (medium each): e.g. Billing — "3 plans · Stripe live"    │
├──────────────────────────────────────────────────────────────────────────┤
│ W7 All collections (Payload built-in `collections` widget, full)         │
└──────────────────────────────────────────────────────────────────────────┘
```

Editors and authors get a default without W2 commerce KPIs, W3 and
admin-only alerts (`defaultLayout` receives `req` and branches on roles).

### 10.2 Widget catalog

| Slug                | Title                | Owner                     | Default width | Default for                     | Content                                                                                   |
| ------------------- | -------------------- | ------------------------- | ------------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| `attention`         | Needs attention      | core (aggregates modules) | full          | A E Au (items filtered by role) | §10.3                                                                                     |
| `kpi-members`       | Members              | core                      | x-small       | A                               | Total members, new in 7 days                                                              |
| `kpi-content`       | Published this week  | core                      | x-small       | E Au                            | Count of published items across content types                                             |
| `kpi-subscriptions` | Active subscriptions | billing                   | x-small       | A                               | Active count, change in 7 days                                                            |
| `kpi-mrr`           | Monthly revenue      | billing                   | x-small       | A                               | MRR from the ledger (provider-neutral)                                                    |
| `kpi-chat`          | Chat conversations   | chat                      | x-small       | A                               | Conversations this week                                                                   |
| `setup`             | Finish setting up    | core (+ module steps)     | medium        | A                               | Replaces `FinishSetupRow`. Steps from core and modules; hidden when all done or dismissed |
| `recent-drafts`     | Recent drafts        | core                      | medium        | A E Au                          | Last 5 drafts across content types the user can read                                      |
| `recent-comments`   | Latest comments      | core                      | medium        | A E                             | Last 5 comments                                                                           |
| `module-<slug>`     | Module card          | each module (optional)    | small–medium  | A                               | One-glance status of the module, link to Overview                                         |
| `collections`       | All collections      | Payload built-in          | full          | A E Au                          | Payload's card grid, respects `admin.hidden`                                              |

Widget rules:

- Each widget is a **React Server Component** (`WidgetServerProps`), reads
  through `req.payload` with `req` passed (kit convention), and renders with
  Payload components only.
- Each checks the user's role itself and renders nothing if not allowed (the
  modular dashboard has no per-widget access setting).
- A widget that fails renders a small `Banner type="error"` "Couldn't load
  <title>" inside its own frame, never breaking Home.
- Widgets of a **disabled** module render nothing.
- Module widgets are registered at build time: `mod sync` adds each module's
  `dashboardWidgets` to `modDashboardWidgets` in the generated payload
  registry, which `payload.config.ts` spreads into `admin.dashboard.widgets`.
  Component paths look like `@acme/mod-billing/admin-server#MrrWidget`
  (Payload's import map is regenerated at build).

### 10.3 The attention API (urgent content from modules)

Every module can put **urgent, actionable** items on Home, in the Alerts bell
and, for critical ones, in the header bar. One API feeds all three.

```ts
// packages/mod-kit/src/admin.ts
export type AttentionSeverity = "critical" | "warning" | "info" | "success";

export type AttentionItem = {
  /** Stable id, unique per module: "<slug>:<key>". Used for dismiss/snooze. */
  id: string;
  severity: AttentionSeverity;
  /** ≤ 60 characters, sentence case, no trailing period. */
  title: string;
  /** ≤ 140 characters. Say what happens if ignored. */
  description?: string;
  /** Shown as a Pill when present (e.g. 4 open reports). */
  count?: number;
  /** Admin-relative link to where the user fixes it. */
  href: string;
  /** Button label, a verb: "Review", "Fix", "Connect". */
  actionLabel: string;
  /** Who sees it. Default ["admin"]. */
  roles?: ("admin" | "editor" | "author")[];
  /** "pill" = compact task pill; "banner" = full Banner row. Default by severity. */
  display?: "pill" | "banner";
  /** Critical items can't be dismissed. Default true for info/success. */
  dismissible?: boolean;
  /** Hours a dismissal lasts before the item may show again. Default 168 (7 days). */
  snoozeHours?: number;
  /** For sorting and "since" text. */
  createdAt?: string;
};

export type AttentionProvider = (ctx: {
  req: PayloadRequest; // pass to every Local API call
  roles: string[];
}) => Promise<AttentionItem[]>;
```

A module exports `attention` from its server-only `./admin-server` entry and
sets `admin.dashboard.attention: true`. `mod sync` lists it in
`modAttentionProviders` (generated). Core has its own provider for core items.

#### Rendering rules

| Severity | Payload component                                                     | Default display              | Dismissible                | Also in                            |
| -------- | --------------------------------------------------------------------- | ---------------------------- | -------------------------- | ---------------------------------- |
| critical | `Banner type="error"` with action `Button`                            | banner                       | never                      | header bar (one at a time), Alerts |
| warning  | `Banner type="warning"`, or task pill with `Pill pillStyle="warning"` | pill if `count`, else banner | yes                        | Alerts                             |
| info     | task pill with `Pill pillStyle="light-gray"`                          | pill                         | yes                        | Alerts                             |
| success  | `Banner type="success"` (e.g. "Stripe connected")                     | banner                       | yes, auto-hides after 24 h | —                                  |

- **Order:** severity (critical → success), then module order (core first,
  then section order, then A–Z), then `createdAt` (newest first).
- **Cap on Home:** at most 3 banners and 6 task pills; the rest are behind
  "View all alerts (N)" → `/admin/alerts`.
- **Dismiss/snooze:** stored in Payload preferences (`payload-preferences`,
  key `attention-dismissed`, value `{ [id]: untilISO }`), per user. No new
  table.
- **Performance:** providers run in parallel, 1.5 s timeout each, results
  cached 60 s per (module, role) with tag `admin-attention`. A timeout drops
  that module's items for this render and logs `[admin-attention] <slug>`.
- **Writing rules for modules:** urgent means someone has to act; never use
  the API for promotions, tips or "what's new" (that's a module card).

#### Attention items the kit and first-party modules raise (v1)

| Id                                | Severity | Title                                    | Action → href                              | Roles | Source                                                                |
| --------------------------------- | -------- | ---------------------------------------- | ------------------------------------------ | ----- | --------------------------------------------------------------------- |
| `core:seed`                       | critical | Your CMS has no content yet              | Set up → `/cms-setup`                      | A     | replaces the `SeedGate` redirect on Home (redirect stays as fallback) |
| `core:updates`                    | warning  | N updates available                      | Review → `/admin/updates`                  | A     | today's `UpdatesAlert`                                                |
| `core:github`                     | info     | Connect GitHub to get updates            | Connect → `/admin/updates`                 | A     | today's `FinishSetupRow`                                              |
| `core:license`                    | critical | Site license couldn't be verified        | Open → `/admin/globals/dream-site`         | A     | `dream-site` report failures                                          |
| `core:reports`                    | warning  | N reports to review                      | Review → reports list filtered open        | A E   | `reports`                                                             |
| `core:push-failed`                | warning  | N push notifications failed              | Review → notifications filtered failed     | A E   | `notifications`                                                       |
| `billing:stripe-disconnected`     | critical | Payments are off: Stripe isn't connected | Connect → `/admin/module-settings/billing` | A     | billing + adapter                                                     |
| `billing:webhooks-failing`        | critical | Stripe events are failing                | Fix → billing settings                     | A     | adapter webhook ledger                                                |
| `billing:past-due`                | warning  | N subscriptions are past due             | Review → subscriptions filtered            | A     | billing                                                               |
| `billing:catalog-unsynced`        | warning  | N plans aren't synced to Stripe          | Resync → plans filtered                    | A     | billing                                                               |
| `chat:gateway-missing`            | critical | AI chat can't answer: no AI Gateway key  | Open → chat settings                       | A     | chat                                                                  |
| `dev-accounts:stuck` (meet-dream) | info     | N founders stuck on a step for 7+ days   | Review → `/admin/module/dev-accounts`      | A     | dev-accounts                                                          |

(Exact thresholds are the module's call; these are the v1 list.)

### 10.4 Setup steps API

The **Finish setting up** widget collects steps the same way:

```ts
export type SetupStep = {
  id: string; // "<slug>:<key>"
  title: string; // "Connect Stripe"
  description?: string;
  done: boolean;
  href: string;
  actionLabel: string; // "Connect"
  order?: number;
};
export type SetupProvider = (ctx: {
  req: PayloadRequest;
}) => Promise<SetupStep[]>;
```

Core steps: account created (always done) · connect GitHub · set brand ·
review sign-in methods. Billing: connect Stripe · create a plan. Chat: add AI
Gateway key. The widget hides itself when every step is done, or when the
admin dismisses it (preference).

### 10.5 What happens to today's `beforeDashboard` components

| Today                                 | After                                                        |
| ------------------------------------- | ------------------------------------------------------------ |
| `SeedGate` (redirect to `/cms-setup`) | Kept as is (it must run before anything else on first visit) |
| `FinishSetupRow`                      | Removed; becomes a `setup` step + `core:github` item         |
| `DreamSiteSync`                       | Kept (renders nothing)                                       |

### 10.6 If the modular dashboard changes or is unavailable

Payload marks `admin.dashboard` **experimental**. To limit risk:

- All widget content lives in plain server components
  (`payload/components/home/*`) that don't depend on the dashboard API.
- If the API changes in a Payload update, the kit can switch to a custom
  `views.dashboard` view (`DefaultTemplate` + `Gutter` + the same components,
  fixed layout) without changing modules' exports.
- Pin the Payload minor in the catalog when shipping, and add an E2E that
  loads Home and checks the attention widget renders.

---

## 11. Alerts: header bar, bell and the Alerts page

### 11.1 Header bar (`admin.components.header`)

- At most **one** bar at a time: the highest critical item marked for the
  header. Today's `UpdatesAlert` becomes the fallback when there is no
  critical item (updates are warning, but they keep their bar because the
  "Update all" action lives there).
- Payload `Banner` across the top, with one action `Button`. Not dismissible
  while critical.

### 11.2 Alerts bell (`admin.components.actions`)

- A Payload `Button` (icon-only or "Alerts") with a `Pill` count of
  undismissed critical + warning items.
- Opens a Payload `Popup` with a `PopupList` of up to 8 items: severity
  pill, title, "Review" link. Footer link: "View all alerts" →
  `/admin/alerts`. Empty: "Nothing needs you right now."

### 11.3 Alerts page (`/admin/alerts`, custom view)

- `DefaultTemplate` + `Gutter`, title "Alerts", breadcrumb Home › Alerts.
- Filter buttons: All · Critical · Warning · Info · Dismissed.
- One row per item: `Pill` (severity), title, description, module name,
  time, action `Button`, "Dismiss" / "Snooze 7 days" (`Popup`).
- Grouped by module under small headings.

---

## 12. Settings area

### 12.1 Settings overview (`/admin/settings`, custom view, admins)

Shopify's Settings mode, as a Payload page of `Card`s. Breadcrumb:
Home › Settings.

```
Settings
Everything that configures your site and app.

Site
[General]          [Brand & theme]        [Legal & policies]
 name, URL, SEO     colors, fonts, logos    terms, privacy

Sign-in and people
[Sign-in & accounts]  [Profile fields]     [Users ›]
 methods, sign-up      extra profile data   (link to People › Users)

Modules                                         [Install module]
[Billing]  Stripe connected · 3 plans          (one Card per installed
[AI Chat]  Gateway key set · 2 channels         module with settings,
[Docs]     …                                    status line from the
[Intercom] …                                    module, disabled ones
                                                with a "Disabled" Pill)

System
[Updates]  2 available   [Site license]  Active   [AI image generation]
```

- Each module card's status line comes from an optional
  `settingsSummary(ctx)` export in `./admin-server`, ≤ 60 characters.
- Card actions: a `Pill` for state (Disabled, Not connected, Update available).

### 12.2 Module settings pages

- Stay on the `kit-modules` row page (`/admin/module-settings/<slug>` →
  redirects there), so every module's settings keep working.
- Breadcrumb becomes Settings › Modules › <Module> (via `SetStepNav` in the
  row's edit view).
- Billing's page keeps the Stripe connector panel, rebuilt with Payload
  components (§4.1 audit).

---

## 13. Module pages (the "app" pattern)

For modules with a group in zone C (Shopify's Instafeed pattern, screenshot 47).

### 13.1 Module overview (`/admin/module/<slug>`, custom view)

```
Breadcrumb: Home › AI Chat
AI Chat                                       [Settings]  [⋯]
v1.4.0 · Enabled                              (Pill)

[Banner info] AI Chat 1.5.0 is available. [Review update]     ← module-level notices
[Banner warning] No AI Gateway key. Chat replies are off. [Fix]

┌ Card ───────┐ ┌ Card ───────┐ ┌ Card ───────┐ ┌ Card ───────┐
│ Conversations│ │ Messages    │ │ Skills      │ │ Channels    │   ← stats row
│ 88 this week │ │ 1,204       │ │ 6 active    │ │ Web · SMS   │
└──────────────┘ └─────────────┘ └─────────────┘ └─────────────┘

Quick links
[Skills ›]  [Channels (settings tab) ›]  [Docs ›]
```

- The kit renders the frame: title, version and state pills, the module's
  notices (its attention items filtered to this module), action buttons.
- The module provides the body through `./admin-server` `Overview`
  component (RSC, Payload components only).
- A module without an overview export gets a default body: its collections
  as `Card`s and a settings link.

### 13.2 Module group nav

```
AI Chat
├─ Overview
├─ Skills
└─ Settings
```

Order: Overview first, the module's screens by `order`, Settings last.

---

## 14. Roles and visibility matrix

Roles come from `cms.users.roles`. Only staff (admin, editor, author) can enter
`/admin`. The nav shows a link only when Payload grants read on it **and** the
rule below allows it.

| Area                             | Admin         | Editor                                                    | Author                               |
| -------------------------------- | ------------- | --------------------------------------------------------- | ------------------------------------ |
| Home                             | ✓ full layout | ✓ editor layout                                           | ✓ editor layout                      |
| Content                          | ✓             | ✓                                                         | ✓ (own items, per collection access) |
| Community                        | ✓             | ✓                                                         | —                                    |
| People › Users                   | ✓             | read-only if access allows (today: verify)                | —                                    |
| People › other                   | ✓             | per collection                                            | —                                    |
| Commerce                         | ✓             | —                                                         | —                                    |
| Marketing                        | ✓             | ✓                                                         | —                                    |
| Channels › Pages, App onboarding | ✓             | ✓                                                         | —                                    |
| Channels › Navigation, AI agents | ✓             | —                                                         | —                                    |
| Modules zone                     | ✓             | per module view roles (e.g. AI Chat › Skills for editors) | —                                    |
| Settings group + gear menu       | ✓             | — (Legal & policies via direct link if access allows)     | —                                    |
| Alerts                           | all           | items with `roles` incl. editor                           | items with `roles` incl. author      |

Payload hides what a role can't read; we never show greyed-out links.

---

## 15. States and edge cases

| Case                                | Behavior                                                                                                                                                                                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Module **not installed**            | Its collections don't exist; links, widgets, alerts, MCP tools and URLs are gone (Payload 404 view)                                                                                                                                                                                      |
| Module **installed but disabled**   | Hidden from nav, Home, Alerts and the `collections` widget. Direct URL to its collection shows the list with a `Banner type="warning"`: "<Module> is disabled. Enable it in Settings › Modules." (added by `mod sync` as `beforeList` on module collections). APIs stay blocked as today |
| Section becomes empty               | Group not rendered                                                                                                                                                                                                                                                                       |
| Only one link in a section          | Still a group (consistent position), e.g. Commerce with only billing                                                                                                                                                                                                                     |
| Modules zone empty                  | Divider not rendered                                                                                                                                                                                                                                                                     |
| Fresh install, unseeded             | `SeedGate` redirects to `/cms-setup` (unchanged). Home after seeding shows Finish setting up first                                                                                                                                                                                       |
| Badge provider slow or failing      | No pill; log; never blocks nav render                                                                                                                                                                                                                                                    |
| Attention provider failing          | That module's items missing; Home shows the rest                                                                                                                                                                                                                                         |
| Many modules (10+ groups in zone C) | Accordion keeps it short; A–Z order. Revisit if > 15 (§18 Q7)                                                                                                                                                                                                                            |
| Narrow window / phone               | Payload's hamburger nav, same structure                                                                                                                                                                                                                                                  |
| Dark mode                           | Payload dark theme tokens (admin-theme.ts)                                                                                                                                                                                                                                               |
| Translations                        | Labels support Payload `StaticLabel` objects; `translateLabel` stays                                                                                                                                                                                                                     |
| Old URLs / bookmarks                | All collection and global URLs are unchanged; only labels and groups move                                                                                                                                                                                                                |
| MCP clients                         | `list_collections` reports the new section as `group`; tool names unchanged                                                                                                                                                                                                              |

---

## 16. Wireframe brief for Claude Design

**Style:** Payload CMS admin default look (light; one dark variant of W1 and
W3). Payload nav on the left, Payload header with breadcrumbs, `Gutter`
content, Payload `Card`, `Banner`, `Pill`, `Button`, `Popup`. No Shopify
visuals. Desktop 1440 × 900 unless noted. Use the sample data in each frame.

| Frame          | Screen                                                      | What to show                                                                                                                                                                                                                                                                                                                                                                                |
| -------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1             | Sidebar, full kit install                                   | Every group from §6.1, **Content** open with Videos active. Pills on Reports (4), Subscriptions (2), Push notifications (1), Updates (2). "Modules" divider with AI Chat. Settings collapsed. Gear + Log out footer                                                                                                                                                                         |
| W1-dark        | Same, dark theme                                            |                                                                                                                                                                                                                                                                                                                                                                                             |
| W2             | Sidebar, minimal install                                    | §6.2. No Commerce, no Modules zone                                                                                                                                                                                                                                                                                                                                                          |
| W3             | Sidebar, meet-dream                                         | §6.3, Commerce open showing Module catalog and Module releases; Modules zone with AI Chat and Developer accounts                                                                                                                                                                                                                                                                            |
| W4             | Sidebar, editor role                                        | Home, Content, Community, Marketing, Channels (Pages, App onboarding), AI Chat (Skills only). No Settings, no Commerce                                                                                                                                                                                                                                                                      |
| W5             | Home, admin, busy day                                       | §10.1 with: critical banner "Stripe events are failing · 12 in the last hour [Fix]"; task pills Reports 4 · Past-due subscriptions 2 · Updates 2; KPIs Members 1,240 (+38 in 7 days), Active subscriptions 312 (+6), Monthly revenue $5,870, Chat conversations 88; Finish setting up with 2 of 5 done; Recent drafts; Latest comments; module cards Billing, AI Chat; All collections grid |
| W6             | Home, fresh install (just seeded)                           | No alerts except info "Connect GitHub to get updates"; KPIs at 0; Finish setting up prominent (1 of 5 done); All collections grid                                                                                                                                                                                                                                                           |
| W7             | Home, editor                                                | Attention: Reports 4, Push failed 1; KPI "Published this week 7"; Recent drafts; Latest comments; All collections                                                                                                                                                                                                                                                                           |
| W8             | Home, edit-layout mode                                      | Payload modular dashboard editing state: widgets with resize handles, "Add widget" drawer listing the §10.2 catalog, Save / Cancel / Reset layout                                                                                                                                                                                                                                           |
| W9             | Header critical bar + bell open                             | Header `Banner type="error"` "Payments are off: Stripe isn't connected [Connect]". Bell with Pill 3, `Popup` listing 3 items + "View all alerts"                                                                                                                                                                                                                                            |
| W10            | Alerts page `/admin/alerts`                                 | Filters All · Critical · Warning · Info · Dismissed; items grouped by Core / Billing / AI Chat; dismiss/snooze popup open on one row                                                                                                                                                                                                                                                        |
| W11            | Settings overview `/admin/settings`                         | §12.1 with Site, Sign-in and people, Modules (Billing "Stripe connected · 3 plans", AI Chat "Gateway key set", Docs, Intercom with "Disabled" pill), System (Updates "2 available", Site license "Active")                                                                                                                                                                                  |
| W12            | Settings › Modules (`kit-modules` list)                     | Payload list view: Name, Version, Source, Enabled; "Install module" in the description; Settings group open, Modules active                                                                                                                                                                                                                                                                 |
| W13            | Module settings page (Billing)                              | `kit-modules` row edit view: breadcrumb Settings › Modules › Billing; tabs (Settings, Stripe, Tags); Stripe connector panel rebuilt with Payload Card/Banner/Button                                                                                                                                                                                                                         |
| W14            | Module overview (AI Chat)                                   | §13.1 with one info and one warning banner, 4 stat cards, quick links. Nav: AI Chat group open, Overview active                                                                                                                                                                                                                                                                             |
| W15            | Collection list inside a section (Commerce › Subscriptions) | Payload list view with `beforeListTable` stats row (Active 312 · Trialing 14 · Canceling 9 · Past due 2), read-only, Past due filter applied                                                                                                                                                                                                                                                |
| W16            | Disabled module URL                                         | Videos list with warning banner "Video library is disabled. Enable it in Settings › Modules."                                                                                                                                                                                                                                                                                               |
| W17            | Channels › AI agents (MCP)                                  | Status Pill (Enabled), MCP URL with copy button, table of connected clients (name, connected by, last used, Revoke)                                                                                                                                                                                                                                                                         |
| W18            | Phone width (390 × 844)                                     | Payload hamburger open with the W1 structure                                                                                                                                                                                                                                                                                                                                                |
| W19 (optional) | Global search placeholder                                   | A search button in header `actions` opening a Payload `Popup`/`Drawer` with scope pills (Content, People, Commerce, Modules). Mark "later phase"                                                                                                                                                                                                                                            |

Annotations Claude Design should include on each frame: section order
numbers, which items are module-provided (with the module slug), and which
Payload component each block is.

---

## 17. Implementation phases and files

Each phase is a separate PR into `dream-starter-kit` (kit core), green on
`pnpm typecheck && pnpm lint && pnpm test`, plus `pnpm test:e2e` for nav and
Home. meet-dream follows through the normal kit update, then its own small PR
for its local modules' placements.

### Phase 1 — Sections and nav (no data moves)

- `packages/mod-kit/src/admin-sections.ts` (new): registry + `inSection()`.
- `packages/mod-kit/src/manifest.ts`: `admin.section`, `collections`,
  `ownsSection`, `views` (no dashboard yet).
- `tooling/mod/src/generate.ts`: apply placements, set
  `admin.custom.{navSection,navOrder,modSlug}`, validate group labels,
  `admin.hidden` for disabled modules, `beforeList` disabled banner.
- `apps/nextjs/src/payload/collections/*`, `globals/*`: `inSection(...)`,
  label renames (§7).
- `apps/nextjs/src/payload/components/AdminNav.tsx` / `AdminNavClient.tsx`:
  algorithm §9.4, Home link, Modules divider, custom links, closed-by-default.
- `payload.config.ts`: move Updates link into Settings; `settingsMenu` links.
- `apps/nextjs/src/payload/views/SettingsView.tsx` (new, `/settings`).
- Modules: billing, chat, docs, billing-adapter-stripe manifests get
  placements. `modules/*/module.config.ts`.
- Docs: `docs/CMS.md` (section headings → new sections), `docs/MODULES.md`
  (new `admin` manifest fields), `CLAUDE.md` (six groups list, the stale
  "Admin › Site Settings" theme line).
- Tests: nav builder unit tests (sorting, empty sections, disabled modules,
  roles); E2E: sidebar order for admin and editor.

### Phase 2 — Home, alerts, badges

- `packages/mod-kit/src/admin.ts` (new): `AttentionItem`, `SetupStep`,
  `NavBadgeProvider`, widget types.
- Manifest: `admin.dashboard`; module entry `./admin-server` (server-only,
  ESLint bundle rule like `./web-server`).
- Generated: `modDashboardWidgets`, `modAttentionProviders`,
  `modSetupProviders`, `modNavBadges`, `modSettingsSummaries`.
- `payload.config.ts`: `admin.dashboard.widgets` + `defaultLayout`,
  `admin.components.actions` (Alerts bell), `header` (critical bar +
  updates).
- `apps/nextjs/src/payload/components/home/*` (new): widgets.
- `apps/nextjs/src/payload/views/AlertsView.tsx` (new, `/alerts`).
- Remove `FinishSetupRow`; rebuild billing/Stripe admin panels with Payload
  components.
- Billing and chat providers (§10.3 table).
- Tests: provider aggregation (ordering, caps, timeouts, role filter,
  dismissal); E2E: Home renders attention + setup for a fresh install.

### Phase 3 — Module overviews and Channels › AI agents

- `/admin/module/:slug` view + default body; chat and dev-accounts overviews.
- `/admin/channels/mcp` view (reads `mcp_oauth_*` server-side, revoke).

### Phase 4 — Extract content modules (own release)

- `pnpm mod create` for `video`, `podcast`, `gallery`, `courses`, `events`,
  `maps`, `community`; move collections, routes, hooks, native screens,
  MCP entries, seed steps (§8.1).
- Polymorphic field builders (§8.2).
- Adopting Payload migrations (§8.3) + `drop.sql`.
- E2E: install/remove a content module and check nav, Home, MCP
  `list_collections`, and the public route.
- meet-dream: local `ideas` module.

---

## 18. Open questions

| #   | Question                                                                                               | Default if no answer                                        |
| --- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Q1  | Does meet-dream keep Videos, Podcasts, Photos, Courses, Events and Places installed after phase 4?     | Keep all installed; remove later per app                    |
| Q2  | Names: "Places" vs "Locations", "Podcasts" vs "Audio", "Courses" vs "Series"                           | Use the new names; collection slugs stay                    |
| Q3  | Should Comments get a moderation status so the nav can count pending comments?                         | No badge on Comments in v1                                  |
| Q4  | Unhide Subscriptions (read-only) in Commerce, or keep support work in `/billing`'s "Find an account…"? | Unhide, read-only, admins only                              |
| Q5  | Should Workspaces (B2B orgs, `public` RLS) get an admin list under People?                             | Not in v1 (would need a server-side, staff-only view)       |
| Q6  | Home AI prompt box (Shopify Sidekick) using the kit's chat module?                                     | Not in v1; could be a `chat` dashboard widget later         |
| Q7  | Pin modules in zone C (Shopify lets you pin apps) when there are many?                                 | A–Z, no pinning, until there are more than 15 module groups |
| Q8  | Global search (⌘K) with `@payloadcms/plugin-search`?                                                   | Phase 5, optional                                           |
| Q9  | Editors' access to Users (read-only)? Today's access rules need a check                                | Keep today's access as is                                   |
| Q10 | Payload's dashboard API is experimental. OK to depend on it with the fallback in §10.6?                | Yes, with the Payload minor pinned                          |
