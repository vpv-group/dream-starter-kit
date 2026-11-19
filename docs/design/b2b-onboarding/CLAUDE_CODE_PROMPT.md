# Claude Code prompt — B2B workspace onboarding for the Dream Starter Kit

> **How to use:** unzip this folder into the repo at `docs/design/b2b-onboarding/` and commit it. Open Claude Code in the repo root and paste everything below the line. It runs one PR at a time; re-run with "Continue with PR 2" (then PR 3) after you've reviewed and merged the previous one.

---

You're implementing B2B (team/workspace) sign-up and onboarding in this repo, the Dream Starter Kit. The founder of each cloned app chooses whether their app is for **Individuals** (today's consumer flow), **Teams** (every user belongs to a workspace/organization), or **Both**.

## Read first, in this order

1. `CLAUDE.md`, then `docs/ARCHITECTURE.md`, `docs/ERD.md`, `docs/AUTH.md`, `docs/MODULES.md`. Those are the source of truth for repo conventions, and their golden rules override anything below.
2. `docs/design/b2b-onboarding/spec/b2b-workspace-onboarding.md`: the product and data spec. Follow it, including the `/welcome` routing chart, the migration and RPC list, edge cases and the PR split.
3. `docs/design/b2b-onboarding/wireframes/SCREEN_MAP.md`: maps every wireframe to its route, PR and shadcn components.
4. The wireframes themselves: look at `wireframes/screenshots/desktop/*.png` and `wireframes/screenshots/mobile/*.png`. The HTML versions are in `wireframes/desktop/` and `wireframes/mobile/` if you need exact copy.

## How to treat the wireframes

- They're **rough wireframes** for layout, hierarchy, flow and copy. They are **not** a visual spec.
- They're styled with the Dream brand as sample data. Do **not** copy their CSS, colours, fonts, `dr-*` / `dk-*` classes or the D-shaped chips.
- Build every screen from the kit's **shadcn/ui components** in `apps/nextjs/src/components/ui` (new-york style, lucide icons). Style only with the kit's theme tokens (`bg-primary`, `text-muted-foreground`, `border`, `bg-muted`, `bg-sidebar` …) so each founder's `theme-settings` branding applies automatically.
- Missing components (`textarea`, `input-group`, `empty`, `spinner`, `item`, `dialog`) are added with the shadcn CLI from `apps/nextjs` (`pnpm dlx shadcn@latest add <name>`). Commit them. Never hand-roll a component shadcn ships.
- Keep the wireframe conventions listed at the end of `SCREEN_MAP.md`:
  - one primary action per screen
  - "Do this later" as the secondary action
  - a segmented step progress bar plus a `Step 02 / 04` eyebrow
  - desktop split layout: form column left, preview panel right, which stacks below 760px
  - sentence-case copy
- Use the copy from the wireframes, with these substitutions:
  - "Workspace" → the founder's `workspaceLabel`
  - `app.meetdream.com/` → `workspaceUrlPrefix`
  - "Dream" → the branding app name (`getBranding()`)
- Light **and** dark mode must both work, since the kit themes both.

## Scope for this run: PR 1 — Workspaces core

Implement only PR 1 from the spec's Build plan, then stop and summarise. If something is genuinely ambiguous, make the conservative choice and note it in your summary rather than stopping.

1. **Migration** (new file only; never edit `20260609000001_initial.sql`):
   - Column additions on `organizations`, `memberships`, `invitations` and `profiles`, per the spec. This includes the invitation columns now, so PR 2 needs no further migration.
   - RPCs: `is_slug_available`, `create_workspace`, `accept_invitation`, `join_workspace_by_link`, `my_pending_invitations`. Write all five now, all `security definer`, `set search_path = ''`, granted to `authenticated`, revoked from `anon`. PR 2 uses the last three.
   - Policies: the co-member `profiles` read policy, and RESTRICTIVE no-anon policies on `organizations` and `memberships`.
   - Then run `pnpm db:gen-migrations`, `pnpm db:reset` and `pnpm db:gen-types`, and commit the generated files.
2. **Settings:**
   - Add an **Account model** tab to the `authentication-settings` Payload global with the spec's fields (`accountModel` default `consumer`, `workspaceLabel`, `workspaceUrlPrefix`, `inviteExpiryDays`, `allowInviteLinks`, `onboardingSteps` orderable/toggleable like `loginMethods`).
   - Extend `AuthSettings` / `DEFAULT_AUTH_SETTINGS` / `normalizeAuthSettings` in `packages/app/src/auth-settings.ts`, and expose the new fields in `GET /api/auth/config`.
   - Run `pnpm cms:gen-types` and `pnpm cms:migrate:create`, and commit both outputs.
3. **Founder step (wireframe `AccountModel`):** the first screen of `/cms-setup` when `accountModel` has never been chosen. Use the RadioGroup choice cards and Continue, then the existing seed progress. It must be idempotent and never shown again once chosen.
4. **Routing:**
   - Implement `resolvePostAuthDestination(...)` as a pure function in `packages/app`, with vitest coverage of every branch in the spec's flowchart.
   - Refactor `app/welcome/route.ts` to gather the inputs and redirect. The existing behaviour (CMS mirror, Free tag, anon reconciliation, DB-not-ready page, staff routing) must be unchanged.
   - Resume an unfinished onboarding from `memberships.onboarding_step`.
5. **Screens** (web; app router; server components where possible, client components for forms). Put them in a new `(onboarding)` route group with its own layout: logo, step progress, desktop split layout with a preview slot.
   - `Hybrid`: `/onboarding/choose`
   - `CreateWorkspace`: `/onboarding/workspace`
   - `SettingUp`: `/onboarding/setting-up`
   - `Profile`: `/onboarding/profile`
   - `Updates`: `/onboarding/updates`
   - The `Invite` step is PR 2. Leave a slot in the step registry for it, but don't render it yet.
   - `SignUp`: copy-only changes in `AuthFlow`, plus the last-used-method hint.
6. **App shell:**
   - Add a workspace switcher to `AppSidebar`'s `SidebarHeader` using shadcn's team-switcher pattern (`SidebarMenu` + `DropdownMenu`, wireframe `Home`). It lists the user's workspaces, has "Create a workspace", and a disabled "Workspace settings".
   - Add `getActiveOrg()` (server; cookie + `profiles.last_org_id`) and `useActiveOrg()` (client).
   - Show the getting-started checklist `Card` on `/a`, only in `business` / `hybrid` mode.
   - Consumer mode renders exactly as today.
7. **Docs:** update `docs/AUTH.md` (Account model tab) and `docs/ERD.md` (new columns, RPCs, policies). Add `docs/WORKSPACES.md` covering the model, routing and how modules will scope by org.

## Hard constraints

- `accountModel` defaults to `consumer`, and consumer mode must behave **exactly** as today: every existing Playwright spec passes unchanged.
- RLS on everything. The service-role key stays server-only. No secrets in client code.
- `is_staff` (app staff) and `memberships.role` (workspace roles) never imply each other.
- Cross-platform logic (validators, slug rules, the resolver, hooks) lives in `packages/app`; `apps/*` stay thin.
- No new runtime dependencies without asking me first. Image cropping, a mailer, etc. are decisions for me.
- Run `pnpm mod sync` if you touch `modules/`.

## Verify before you finish

1. Run `pnpm typecheck`, `pnpm lint`, `pnpm format:fix`, `pnpm test` and `pnpm test:rls`, then `pnpm test:e2e` after `pnpm db:reset`. All must pass.
2. Add tests:
   - **RLS:** cross-org isolation; `create_workspace` refuses anon and reserved or duplicate slugs.
   - **vitest:** the resolver and slug validation.
   - **Playwright:** `tooling/web-e2e/src/workspace-signup.spec.ts`. With `accountModel=business`, a user signs up → gets the code from Mailpit → names a workspace → skips steps → lands on `/a` with the switcher showing the workspace.
3. With the Playwright Chromium, screenshot every new or changed screen at 1440×900 and 390×844, in light and dark mode. Save them to `docs/design/b2b-onboarding/implemented/` and show them to me next to the matching wireframe PNG.
4. Finish with a summary covering:
   - what you built
   - files touched
   - any deviation from the spec or wireframes, and why
   - open decisions for PR 2

## Later runs (don't start these now)

- **PR 2 — Invitations:**
  - First, propose how to send invite emails. The kit only has Supabase auth templates today. Options: a small `lib/email` sender over SMTP (Mailpit locally on its SMTP port), Resend behind an env var, or another approach. Wait for my pick.
  - Then build the invite API, the invite email template, `/invite/[token]`, `/join/[token]`, the locked-email auth variant (`JoinSignIn`), `PendingInvites`, `InviteProblem`, the `Invite` onboarding step, and Settings → Members.
  - Add the Expo screens via `packages/app` hooks and `react-native-reusables`.
  - Add `workspace-invite.spec.ts`.
- **PR 3 — Workspace billing and module hooks**, per the spec.
