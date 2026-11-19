# Screen map

Every wireframe exists twice: `mobile/<Name>.html` (390×844) and `desktop/<Name>.html` (1440×900, fluid). PNGs of both are in `screenshots/`. Open `index.html` to browse all of them; the primary buttons link through each flow.

The wireframes use the **Dream** brand as sample styling. Implement with the kit's shadcn components and **theme tokens**; never copy colours or classes from the wireframe CSS. The `dr-*` and `dk-*` classes are wireframe-only.

Kit components already in `apps/nextjs/src/components/ui`: alert, avatar, badge, breadcrumb, button, card, checkbox, collapsible, drawer, dropdown-menu, field, input-otp, input, label, popover, progress, radio-group, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, toggle, toggle-group, tooltip.

Add with the shadcn CLI as needed: `textarea`, `input-group`, `empty`, `spinner`, `item`, `dialog`. Run from `apps/nextjs`: `pnpm dlx shadcn@latest add <name>`. Commit the generated files.

| Wireframe | Route | PR | Purpose | shadcn components | Notes |
| --- | --- | --- | --- | --- | --- |
| `AccountModel` | `/cms-setup` (new first step) | 1 | Founder picks Individuals / Teams / Both | `RadioGroup` + `RadioGroupItem` inside `FieldLabel`/`Field` "choice card" pattern, `Card`, `Button` | Desktop: 3 cards in a row. Saves `authentication-settings.accountModel`, then runs the existing seed progress. Skip if already set |
| `Hybrid` | `/onboarding/choose` | 1 | Both mode: For myself / With my team, asked once | Same choice-card pattern | Save to auth `user_metadata.signup_intent` |
| `SignUp` | `/sign-up` | 1 | Existing `AuthFlow` / `SignupForm` | `Field`, `Input`, `Button`, `Separator` | Change only the copy per account model, plus a "You used {method} last time" hint (cookie) |
| `CheckEmail` | `/check-email` | — | Existing `check-email-form` | `InputOTP` | No change |
| `CreateWorkspace` | `/onboarding/workspace` | 1 | Name + URL slug | `Field`, `Input`, `InputGroup` + `InputGroupAddon` (URL prefix), `FieldDescription` with lucide `Check` / `X` for availability, `Button` | Slug auto-derives from name until edited; debounce `is_slug_available` (300ms). Desktop right panel = live preview `Card` |
| `SettingUp` | `/onboarding/setting-up` | 1 | Splash while hooks run | `Spinner` or `Progress` | Max ~3s, then forward; "Continue" fallback link |
| `Profile` | `/onboarding/profile` | 1 | Step 1: name, avatar, title | `Avatar`, `Button` (upload), `Field`, `Input` | Avatar → existing storage bucket. Crop dialog optional (`dialog`). Desktop preview = member `Card` |
| `Invite` | `/onboarding/invite` | 2 | Step 2: invite by email + copy link | `Textarea`, `Select`, `InputGroup` with copy `Button`, `sonner` toast, `Item`/`Badge` for the preview list | Owners/admins only; skip the step for members. In PR 1 render it disabled or hide it |
| `ConnectSlack` | `/onboarding/connect/[step]` | 3 | Module-contributed step | `Item` rows with lucide icons, `Button` | Rendered from the module manifest `onboarding` entry; hidden if no module provides one |
| `Updates` | `/onboarding/updates` | 1 | Step 4: email preferences | `Field orientation="horizontal"` + `Switch` | Store in profile/notification prefs |
| `Home` | `/a` | 1 | App home with checklist + switcher | Existing `AppSidebar` (dashboard-01); add a workspace switcher in `SidebarHeader` (shadcn sidebar "team switcher": `SidebarMenu` + `DropdownMenu`); `Card`, `Progress`, `Item`, `Badge`, `Empty` | Checklist items come from skipped onboarding steps. Mobile: switcher in header |
| `InviteEmail` | email template | 2 | Invite email | n/a (HTML email) | Match `supabase/templates/*.html` styling; see the mailer decision in the prompt |
| `InviteLanding` | `/invite/[token]` | 2 | Public invite page | `Card`, `Avatar`, `Button` | Unknown, expired or revoked tokens render `InviteProblem` |
| `JoinSignIn` | `/sign-up?invite=…` (or `/invite/[token]/continue`) | 2 | Auth with email locked to the invite | `InputGroup` (readonly `Input` + lock icon), `Button` | Reuse `AuthFlow` with a `lockedEmail` prop rather than a new form |
| `PendingInvites` | `/onboarding/invites` | 2 | Plain sign-up with pending invites | `Item` list with `Avatar` + `Button`, `Separator` | Data from `my_pending_invitations()` |
| `InviteProblem` | rendered by `/invite/[token]` | 2 | Expired / revoked / wrong account | `Alert` (warning), `Button` | One component, three banner variants |

## Wireframe conventions to keep

- One primary button per screen. The secondary action is labelled **Do this later**, never "Skip".
- Onboarding steps show a segmented progress bar (enabled steps only) and an eyebrow `Step 02 / 04`.
- Desktop auth and onboarding pages:
  - The form sits in a 400px column on the left.
  - The right half previews what the step creates.
  - Below 760px the preview stacks under the form.
- Mobile: primary action full width at the bottom.
- Copy is sentence case, with no exclamation marks. Status words come from a fixed set: Needs you, In progress, Waiting on X, Needs a fix, Done.
- Green / `primary` fill only for finished things and the primary action.
- All sample data (Acme, Alex, ana@acme.com, Edgehill Co) is placeholder. Workspace name, label and URL prefix come from the settings.
