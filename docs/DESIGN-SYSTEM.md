# Design system — app surfaces

How signed-in screens in the kit and in modules are put together: the dashboard,
`/a/*` module pages, list views, record pages and boards. It sits **on top of** the
brand. Colour, type, logo and voice live in [`BRAND.md`](./BRAND.md), and every value
here is a token from `tooling/tailwind/theme.css`. Swapping the brand restyles
everything below with no code changes.

> **Build from this spec, not from copied code.** Every component described here is
> written for Dream: primitives in `@acme/ui`, composites in the module or package that
> owns them. Don't paste third-party template or dashboard-kit source into the kit or
> into a module. Modules ship to other people, so the code has to be ours to
> distribute. When something is missing, add it to this doc first, then build it.

---

## 1. Principles

1. **Calm density.** CRM-style screens show a lot of data. Use small type (`text-sm`
   body, `text-xs` meta), tight but regular spacing, and few colours. Hierarchy comes
   from weight and surface, not size or colour.
2. **Framed surfaces.** Content sits on an inset white panel inside a soft tinted
   frame (§3). Sections stay readable without heavy borders or shadows.
3. **Colour means something.** Neutrals carry the layout. Colour is reserved for
   status (§5), the primary action and charts. Never use raw palette classes
   (`green-600`, `bg-amber-100`); always use the semantic tokens.
4. **One primary action per view.** It goes in the page header's top right. Every
   other action is `outline`, `ghost` or in an overflow menu.
5. **Components respond to their container, not the window.** Cards use container
   queries (`@container/card`), so a card behaves the same in a 4-column grid, a
   sheet or a phone.
6. **Numbers line up.** Use `tabular-nums` on every figure, `Intl` formatters for
   currency and dates, and right-align numeric table columns.

---

## 2. Foundations

### Tokens in use

| Purpose          | Token / utility                                                      | Notes                                        |
| ---------------- | -------------------------------------------------------------------- | -------------------------------------------- |
| Page ground      | `bg-background`                                                      |                                              |
| Frame tint       | `bg-muted/40` + `ring-1 ring-foreground/10`                          | the outer card frame                         |
| Inset panel      | `bg-card` + `ring-1 ring-foreground/5` + `shadow-2xs`                | where content sits                           |
| Quiet fill       | `bg-muted/50`                                                        | completed rows, read-only blocks, info wells |
| Body / meta text | `text-foreground` / `text-muted-foreground`                          |                                              |
| Primary action   | `bg-primary text-primary-foreground`                                 | one per view                                 |
| Status tones     | `success`, `info`, `warning`, `destructive` + their `*-subtle` fills | see §5                                       |
| Charts           | `--chart-1` … `--chart-5`, in order                                  | see §4.8                                     |
| Focus            | `ring` (`outline-ring/50`, `focus-visible:ring-[3px]`)               | never remove it                              |

### Type scale (app surfaces)

| Role                              | Classes                                           |
| --------------------------------- | ------------------------------------------------- |
| Page title                        | `text-xl font-bold tracking-tight lg:text-2xl`    |
| Section / card title              | `text-sm font-semibold leading-snug`              |
| Subsection heading inside a panel | `font-medium` (base size)                         |
| KPI value                         | `text-2xl font-semibold tabular-nums lg:text-3xl` |
| Body                              | `text-sm`                                         |
| Meta, helper, table captions      | `text-xs text-muted-foreground`                   |
| Form label                        | `text-sm font-medium`                             |

Fonts come from the brand (`font-sans` for UI, `font-mono` for IDs and codes).
Serif is not used on app surfaces.

### Spacing rhythm

| Context                 | Value                                                 |
| ----------------------- | ----------------------------------------------------- |
| Page section stack      | `space-y-4 lg:space-y-6`                              |
| Grid gutters            | `gap-4 lg:gap-6`                                      |
| Inside a panel          | `gap-2` (tight), `gap-3` (rows), `space-y-4` (groups) |
| Card padding            | `--card-spacing`: `4` (default) or `3` (`size="sm"`)  |
| Toolbar / footer strips | `px-(--card-spacing) py-3`, `min-h-14`                |

### Shape and elevation

| Element                                  | Radius                           |
| ---------------------------------------- | -------------------------------- |
| Card frame                               | `rounded-xl`                     |
| Inset panel, wells, row tiles            | `rounded-lg` / `rounded-md`      |
| Inputs, buttons                          | `rounded-md` (primitive default) |
| Badges, avatars, icon chips, status dots | `rounded-full`                   |

Elevation uses rings plus the brand's soft `shadow-2xs`. Use larger shadows only for
floating layers (popover, dialog, sheet).

### Iconography

- In-UI icons are **lucide** (`lucide-react`, via `@acme/ui`). Nav icons are
  **Tabler** names (`IconBriefcase`) resolved through the generated nav icon map.
- Sizes: `size-4` in buttons and menus, `size-3.5` in dense toolbars and inline
  hints, `size-3` inside badges.
- **Icon chip:** `size-8 rounded-full border bg-card grid place-items-center` holding
  a `size-4` icon. Used as a card's action-slot ornament (stat tiles) and for record
  type icons.

---

## 3. Layout

### App shell (exists)

The `(app)` layout provides the sidebar (inset variant) and sticky header. Pages
return content only. In the content area:

- Wrap the page body in `@container/main`.
- **Width:** dashboards, lists and boards use the full width. Record pages and
  settings use `mx-auto max-w-5xl`, and single-column forms use `max-w-2xl`.

### Bottom tab bar (phones and tablets, exists)

Below `lg` the shell adds a floating Liquid Glass tab bar
(`components/glass-tab-bar.tsx` + `.module.css`). It renders the **native app's
menu** (/admin → Navigation → iOS and Android App), so staff configure one tab bar
for every small screen. The header stays as is; on tablets the bar centres over the
content column next to the expanded sidebar.

- **Shape:** a 62px pill of 76px tabs (64px at ≤420px) and a separate 62px round
  Search button, 12px apart, floating `max(20px, safe-area)` off the bottom.
- **Material:** fill on `::before` (`saturate(220%) blur(16px)`, light
  `rgba(245,245,247,.55)` / dark `rgba(38,38,40,.6)`), a 0.5px hairline from four
  inset shadows on `::after`. Never put `backdrop-filter` on the element itself.
- **Tabs:** 26px Tabler icon over a 10px/600 label in the system font. The active
  tab takes `--primary` and sits on a sliding pill indicator.
- **Search mode:** the tabs collapse into one round button (back to the current
  tab), the Search button becomes a field, and a glass sheet above lists every
  entry with a coloured icon tile.
- **Content clearance:** the shell sets `--app-bottom-inset` (0 on desktop) and pads
  the page by it. Full-height screens subtract it:
  `h-[calc(100dvh-…-var(--app-bottom-inset,0px))]`.
- **Accessibility:** links use `aria-current="page"`, 4px focus ring, Escape closes
  search. `prefers-contrast: more` and `prefers-reduced-transparency` drop the blur
  for a solid fill; `prefers-reduced-motion` drops the animations.

### Page header

```
┌──────────────────────────────────────────────────────────────┐
│ Title (page title type)          [secondary…] [Primary action]│
│ optional muted description                                    │
└──────────────────────────────────────────────────────────────┘
```

`flex items-center justify-between`, actions `flex items-center gap-2`. Secondary
actions are `outline`. A date-range picker or view switcher sits to the left of the
primary action. On narrow screens, secondary actions collapse into a `…` menu.

### Sub-navigation (module "app bar")

A module with several sections (the CRM's object tabs) shows a horizontal tab row
under the page header. It uses `Tabs` styling with `variant="line"`: underline on
the active tab, `text-sm font-medium`. It scrolls horizontally on small screens and
never wraps. The global sidebar keeps a single entry for the module: a link, or
a collapsible group listing the same sections (manifest nav `children`, e.g. the
CRM's Leads, Accounts, Contacts, …).

### Responsive grid recipes

| Recipe           | Classes                                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| KPI row          | `grid gap-4 lg:gap-6 md:grid-cols-2 xl:grid-cols-4`                      |
| Dashboard row    | `grid gap-4 lg:gap-6 xl:grid-cols-3` (a wide card can `xl:col-span-2`)   |
| Record body      | `grid gap-4 lg:gap-6 lg:grid-cols-3` (main `lg:col-span-2`, side rail 1) |
| Two equal panels | `grid gap-4 lg:gap-6 md:grid-cols-2`                                     |

---

## 4. Patterns

### 4.1 Framed card — the base surface

```
╭─ frame: bg-muted/40 ring-foreground/10 rounded-xl ───────────╮
│  Title ⓘ                                      [card action]  │  ← header strip
│ ╭─ inset: bg-card ring-foreground/5 shadow-2xs rounded-lg ──╮ │
│ │  content (p-(--card-spacing))                             │ │
│ ╰───────────────────────────────────────────────────────────╯ │
│  footer strip (optional)                                      │
╰───────────────────────────────────────────────────────────────╯
```

- **Header strip:** `min-h-13 px-(--card-spacing) py-2.5`, title on the left. Use a
  `CardAction` slot on the right for a small button, a tab list or an icon chip. A
  muted ⓘ tooltip next to the title explains the metric. Don't write a subtitle when
  a tooltip will do.
- **Inset body:** this is the only place content goes. Make it **flush** (`p-0`) when
  it holds a table, a toolbar or a list, so those can draw their own dividers edge to
  edge.
- **Footer strip:** a "View all →" link or pagination. Same padding as the header.
- **Sizes:** `size="sm"` tightens `--card-spacing` to `3`, for side rails and
  widgets.
- Labels inside action buttons collapse to icons below the `md` container size
  (`@max-md/card:sr-only`).

### 4.2 Stat tile (KPI)

Header: metric name, with an icon chip in the action slot. Body: the value (KPI
type), then a delta line: `text-sm text-muted-foreground` with the change in
`text-success` / `text-destructive` ("**+10.4%** from last month"). Optional: a
sparkline or a small radial progress next to the value. Make tiles clickable when a
filtered list exists behind them (e.g. "Open deals" → the open opportunities view).

### 4.3 List view (data table)

One framed card with a flush body, laid out top to bottom:

1. **Toolbar strip** (`border-b`): search input (`h-7 w-40 lg:w-56`, leading
   `size-3.5` search icon), a **Filters** builder that renders active filters as
   removable chips, a spacer, **Columns** (column-visibility menu), and the view
   switcher (Table · Board) where one applies. A list-view picker ("Recently Viewed ▾")
   sits in the page header, not the toolbar.
2. **Selection mode:** when rows are selected, the toolbar _swaps_ to
   "N selected · Export · Change owner · Delete" plus a right-aligned Cancel. It
   doesn't add a second bar.
3. **Table:** first and last cells pad to `--card-spacing` so columns line up with the
   toolbar. Headers sort with a ghost button and an up/down chevron. The name column
   is the link to the record, in `font-medium`. Each row ends with a ghost `icon-sm`
   `…` menu. Selection checkboxes go in the first column.
4. **Empty result:** a single row `h-24 text-center text-muted-foreground`. Write
   "No accounts match these filters." when filters are active. With no data at all,
   use the empty state (§4.10) instead of the table.
5. **Footer strip** (`border-t`): "Rows per page" select on the left, and
   "Page X of Y" with icon-sm prev/next on the right. It stacks on mobile.

Tables scroll horizontally inside the inset panel on small screens. The page itself
never scrolls sideways.

### 4.4 Record form (create / edit)

- **Container:** a `Dialog`. Use `sm:max-w-2xl` for record forms with two-column
  sections and `sm:max-w-md` for quick creates. When the form is opened from within
  a record page, use a `Sheet` (`sm:max-w-md`) for side edits that keep context.
- **Header:** centred title ("New Case"). Below it, a right-aligned legend:
  "\* = Required information" in `text-xs text-muted-foreground`, with the asterisk in
  `text-destructive`.
- **Sections:** a section bar is a full-width `bg-muted/50 rounded-md px-3 py-1.5
text-sm font-semibold` heading ("Case Information"). Under it, a
  `grid gap-x-6 gap-y-4 sm:grid-cols-2` field grid. Long text and rich text span both
  columns.
- **Fields:** label on top, with a required asterisk _before_ the label in
  `text-destructive`. Lookups are a searchable combobox ("Search Accounts…") with
  "+ New …" as the last option. Picklists use a select with a `--None--` option when
  the field isn't required. Errors appear inline under the field in
  `text-destructive text-xs`, and the field gets `aria-invalid`.
- **Footer:** sticky, right-aligned: `Cancel` (outline), `Save & New` (outline),
  `Save` (primary). Leading options such as "Send notification email" sit on the left.
  The body scrolls, but the header and footer stay put.

### 4.5 Record page

```
[←]                                              [Edit] [⋯]
╭ Highlights ─────────────────────────────────────────────╮
│ (icon chip) Object label · **Record name**   [Follow]   │
│ field · field · field · field   (compact layout, xs)    │
╰─────────────────────────────────────────────────────────╯
[ Path: ● Prospecting › ● Qualification › ○ Proposal … ]  [Mark stage]
┌ main (2/3) ───────────────────────┐ ┌ rail (1/3) ──────┐
│ Tabs: Details · Related · Activity│ │ Activity / tasks │
│ framed cards per section          │ │ related previews │
└───────────────────────────────────┘ └──────────────────┘
```

- **Highlights:** a framed card. The object label is `text-xs text-muted-foreground`
  above the name, which is `text-xl font-bold`. Compact fields are labelled `xs` muted
  pairs in a wrapping row.
- **Path** (stage / status stepper): a segmented chevron row. Done steps are
  `bg-success-subtle text-success`, the current step is `bg-primary
text-primary-foreground`, upcoming steps are `bg-muted`, and a closed-lost or
  closed-negative ending is `bg-destructive-subtle text-destructive`. A primary
  button on the right advances the stage. Show it only for fields that model a
  lifecycle.
- **Details tab:** framed cards per layout section, with read-only label/value pairs
  in a `sm:grid-cols-2` grid and an inline edit pencil (ghost `icon-sm`) on hover.
- **Related lists:** framed cards with a flush body. Each shows a compact table (5
  rows max), a count in the title, and a "View all" footer.
- **Activity:** a vertical timeline. Each entry has an icon chip, a title, meta (who ·
  when, relative date) and body. Quick-add buttons ("New task", "Log a call", "New
  note") go above the timeline.

### 4.6 Board (kanban)

- Columns are a fixed `w-[340px]`. The board scrolls horizontally with `gap-4`. On
  mobile each column is full-width with snap scrolling.
- Column header: name in `text-sm font-semibold`, a count badge (outline), and an
  aggregate (Σ amount, `text-xs text-muted-foreground tabular-nums`). It has an
  optional colour dot that matches the field's status tone.
- Cards use the inset-panel surface. They show the title (`font-semibold`), one or
  two meta lines (account, close date, amount), and an owner avatar on the bottom
  right. Drag with a handle, and support keyboard dragging (focusable cards, arrow
  keys to move between columns).
- Dropping a card writes the new value at once (optimistic update). On failure it
  rolls back with a toast.

### 4.7 Lists inside cards (task rows, compact items)

Each row: `flex items-start gap-3 rounded-md border p-3`, with a leading checkbox or
icon. Title in `text-sm font-medium`, meta in `text-xs text-muted-foreground`, and a
trailing priority badge. A completed row gets `bg-muted/50` and a struck-through
muted title. Rows stack with `space-y-3`.

### 4.8 Charts

- Use the chart container primitive (Recharts) with a typed config. Series take
  `--chart-1…5` **in order**. Status charts (pipeline by stage, cases by priority)
  instead use the status tone of each value (§5), so a chart and its table agree.
- Minimal ink: no vertical gridlines, a faint horizontal grid, axis labels in
  `text-xs` muted, `tabular-nums` ticks, and abbreviated currency (`$1.2M`).
- Tooltips use the shared tooltip surface. Legends sit below the chart as dot +
  label.
- **Pipeline bar:** one stacked horizontal bar (or one row per stage) with stage
  name, count and Σ value. It's the default way to summarise a lifecycle field.
- **Donut / radial:** only for part-of-whole with 5 or fewer slices. Put the total
  value in the centre.

### 4.9 Buttons and actions

| Use                                                   | Variant / size                                                |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| The page's primary action                             | `default` (primary)                                           |
| Secondary page actions, toolbar buttons, card actions | `outline`, `size="sm"`                                        |
| Row menus, inline edit, icon-only toolbar             | `ghost`, `size="icon-sm"`                                     |
| Navigation-like text actions ("View all")             | `link`                                                        |
| Confirming a destructive action, bulk delete          | `destructive` (only inside a confirm dialog or selection bar) |

Icon + label order: icon first. Group related actions with a button group, and put
overflow in a `…` dropdown. Destructive actions always confirm with an alert dialog
that names the record.

### 4.10 Empty, loading and error states

- **Empty:** centred inside the content area (or inside the card). It has an icon
  chip (`size-10`), a title (`text-xl font-semibold`), one sentence of muted copy,
  and actions: primary "New …", plus a secondary "Import" or "Load sample data".
- **Loading:** skeletons shaped like the final layout (KPI tiles, table rows, board
  columns). No full-page spinners.
- **Error:** an inline `Alert` inside the affected card with a Retry button. The rest
  of the page stays usable.

### 4.11 Avatars and people

`size-8` by default and `size-6` in tables and cards. Fallback initials come from the
name. Stacks use `-space-x-2` with `border-2 border-background` and end with a
"+N" avatar. Owner columns show avatar + name. On boards, the avatar alone with a
tooltip.

---

## 5. Status tones

Every enumerated value (picklists, statuses, priorities) maps to **one** tone. That
tone is used consistently as a **dot** (tables, filters, board columns), a **badge**
(record headers, compact rows) and a **chart colour**.

| Tone        | Dot                   | Badge                                    | Typical values                           |
| ----------- | --------------------- | ---------------------------------------- | ---------------------------------------- |
| neutral     | `bg-muted-foreground` | `outline`                                | New, Not Started, Low, --None--          |
| info        | `bg-info`             | `bg-info-subtle text-info`               | Working, In Progress, Qualification      |
| warning     | `bg-warning`          | `bg-warning-subtle text-warning`         | Waiting on Customer, Medium, Negotiation |
| success     | `bg-success`          | `bg-success-subtle text-success`         | Closed Won, Completed, Converted         |
| destructive | `bg-destructive`      | `bg-destructive-subtle text-destructive` | Escalated, High, Closed Lost             |

- A dot is `size-2 rounded-full`. Multi-select filter chips show up to four
  overlapping dots (`-ml-1 ring-2 ring-background`) plus a count.
- Badges are `h-5 rounded-full px-2 text-xs font-medium`. Tone badges add a 1px
  border in the tone at reduced opacity.
- Tones are assigned in data (picklist metadata) or in one tone map per module,
  never inline in a component.

---

## 6. Accessibility checklist

- Text contrast comes from the tokens (BRAND.md guarantees at least 4.5:1). Never put
  small text on `brand`.
- Every icon-only button has an `aria-label` or `sr-only` text. Labels hidden by
  container queries use `sr-only`, not `hidden`.
- Status is never colour-only. A dot is always followed by its label, and a tooltip
  isn't enough.
- Dialogs and sheets trap focus and return it to their trigger. Boards and tables
  work without a mouse.
- Respect `prefers-reduced-motion`: no count-up animations, and instant drag drops.

---

## 7. Where it lives in code

| Layer             | Package                      | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens            | `tooling/tailwind/theme.css` | colours, status tones, radius, shadows (BRAND.md)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Primitives        | `@acme/ui`                   | button, badge (tones `neutral` / `info` / `success` / `warning` / `danger`), card (`variant="framed"`, `size="sm"`), input, select, field, dropdown-menu, separator, dialog, alert-dialog, sheet, tabs (`variant="line"`), popover, command (cmdk), checkbox, avatar, tooltip, skeleton, progress, textarea, switch, table, toggle, toggle-group, radio-group, scroll-area, alert, kbd, empty, status-dot (`Tone`). Not in the kit yet: calendar, chart, combobox (compose popover + command) |
| Generic blocks    | `@acme/ui`                   | page header, stat tile, data-table shell (toolbar / selection bar / pagination), filters builder, status dot + tone map type, empty state, board (kanban) shell, timeline                                                                                                                                                                                                                                                                                                                     |
| Domain composites | the owning module            | e.g. the CRM's record form, path, related lists and pipeline board, all built from the blocks above                                                                                                                                                                                                                                                                                                                                                                                           |

Existing pages keep the current card look. The framed variant is opt-in
(`<Card variant="framed">`), so adopting the system is incremental. The `/admin`
panel is out of scope: it keeps its fixed palette (`lib/theme/admin-theme.ts`).
