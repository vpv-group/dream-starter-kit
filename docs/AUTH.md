# Authentication settings (System → Authentication)

The **Authentication** settings screen (Payload admin → **System → Authentication**)
lets staff choose which sign-in methods the app offers, in what order, plus
sign-up access rules, password strength, copy, and SAML SSO routing — without
touching code. It is a standard staff-editable Payload global
(`authentication-settings`), read at request time by the web auth pages and the
Expo app.

## The mental model: this is a presentation layer

**Supabase's GoTrue server (its `config.toml` / hosted dashboard) is the source
of truth for what auth actually works** — which OAuth providers exist, whether
sign-up is open, whether captcha is enforced, whether SAML is enabled. Our
Next.js app **cannot change those at request time**.

So this screen controls the **UI + client logic**: which methods/forms render,
which is the primary call-to-action, the order they appear, client-side
validation, and copy. Each method that depends on a matching Supabase setting
carries an inline note linking back to this doc. We do **not** call the Supabase
Management API.

Practically: enabling "Google" here shows the Google button, but Google must
*also* be enabled in Supabase with a client id/secret or the button errors.

## Where it's read

- **Web** (`apps/nextjs`): the sign-in / sign-up / forgot-password RSC pages call
  `getAuthSettings()` (`src/lib/payload.ts`) and pass the normalized settings to
  the shared `AuthFlow` client component (`src/components/auth/auth-flow.tsx`).
  Reads are cached per request and degrade to safe defaults when the CMS is
  unreachable, so the auth screens always render.
- **Mobile** (`apps/expo`): the screens use the `useAuthConfig()` hook
  (`@acme/app`), which fetches the public **`GET /api/auth/config`** endpoint
  (the CMS REST bridge is staff-only today). The endpoint returns the same
  normalized config (no secrets).
- The cross-platform shape, defaults, and helpers live in
  `packages/app/src/auth-settings.ts` (`AuthSettings`, `normalizeAuthSettings`,
  `chooserEntries`, `isEmailDomainAllowed`, `ssoParamsForEmail`).

## Account model tab

**Who signs up for your app?** One founder-level setting decides whether the app
is for **Individuals** (`consumer`, the default — today's flow, unchanged),
**Teams and companies** (`business` — every user lives in a workspace), or
**Both** (`hybrid` — personal by default, anyone can create or join a workspace).
The founder answers it once as the first screen of `/cms-setup`, before the CMS
seed; staff can change it here afterwards. Full model, routing and data:
[`WORKSPACES.md`](./WORKSPACES.md).

| Field | Default | What it does |
| --- | --- | --- |
| `accountModel` | `consumer` | Individuals / Teams and companies / Both. Changes UI and routing only — **never RLS**. |
| `accountModelChosenAt` | — | Hidden. Stamped by the `/cms-setup` picker, or by the first save here that changes the model, so the picker shows exactly once. |
| `workspaceLabel` | Workspace | Workspace / Organization / Team / Studio / Practice — substituted into all workspace copy. |
| `workspaceUrlPrefix` | site host | Shown before the URL field on Name your workspace. Blank = the host of `getSiteUrl()`. |
| `inviteExpiryDays` | 7 | Days before an emailed invite expires (1–30). |
| `allowInviteLinks` | on | Whether workspace admins may share a join link. |
| `onboardingSteps` | profile, invite, integrations, updates on; plan off | Orderable, toggleable welcome steps (like the method list). Steps this build doesn't ship yet are skipped silently: invite (invitations), integrations (module steps) and plan (workspace billing). |

Sign-up copy follows the model when **Appearance** headings are blank: Teams uses
"Create your {label}" + "Free to start. You'll name your {label} after you
confirm your email."; Both uses "Create your account"; Individuals keeps the
kit's existing copy. In Teams/Both the chooser also shows a "You used {method}
last time." hint (first-party cookie `last_auth_method`).

Switching **Individuals → Teams** sends existing members to "Name your
workspace" when they next reach the app. Switching **Teams → Individuals** keeps
all workspace data and hides the UI.

## Methods: reorder + toggle

The **Methods** tab is an orderable list. **Drag to reorder, toggle to
enable/disable.** The **first enabled method is the primary** (filled) button;
the rest stack below it. The login UI follows the shadcn **login-05** pattern: a
centered card with "Continue with …" buttons.

The three email methods collapse into a single **"Continue with email"** button
(positioned at the first enabled email method), which opens a short
email → password / check-your-email sub-flow:

| Method | UI | Supabase mechanism | Prerequisite |
| --- | --- | --- | --- |
| **Email + password** | password field after the email step | `signInWithPassword` / `signUp` | none |
| **Magic link** | "Email me a link" → check email | `signInWithOtp` (link) | none |
| **Email code (OTP)** | "Email me a code" → enter code | `signInWithOtp` + `verifyOtp` | none |
| **Google** | "Continue with Google" | `signInWithOAuth` | see [#google](#google) |
| **Apple** | "Continue with Apple" | `signInWithOAuth` | see [#apple](#apple) |
| **SAML 2.0 SSO** | "Continue with SAML SSO" | `signInWithSSO` | see [#sso](#sso) |

## Sign-up & access tab

- **Allow sign-ups** — off = invite-only (see [#invite-only](#invite-only)).
- **Email domain mode** + **domains** — allow/block sign-ups by email domain
  (checked client-side and should be re-checked in any server route that creates
  accounts).
- **Terms / Privacy URLs** + **Require terms acceptance** — the footer links and
  an optional "I agree" checkbox shown before sign-up.
- **Post-login / post-signup redirect** — override the default `/welcome`
  role-based routing.

## Security tab

<a id="passwords"></a>

- **Minimum password length** — drives the client-side password rule. It must be
  **≥ Supabase's server-side `minimum_password_length`** (in `config.toml`) to be
  enforced end-to-end; the app can only make the UI rule *stricter*, not the
  server.

<a id="captcha"></a>

- **Require Cloudflare Turnstile** — surfaces intent to require a Turnstile token
  on auth actions. Full enforcement also needs the Turnstile **site key** set
  (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) and Supabase's `[auth.captcha]` enabled. See
  `docs/TURNSTILE.md`.

## Appearance tab

Optional **sign-in heading**, **sign-up heading**, and **subtitle**. Blank uses
the kit defaults ("Welcome to Acme Inc", "Create your workspace"). The brand icon
is the fixed `GalleryVerticalEnd` mark.

## SSO tab

<a id="sso"></a>

SAML 2.0 SSO routes by email domain. Map a domain to a registered Supabase SSO
provider (or leave the provider id blank to let Supabase resolve it from the
domain). **This screen only surfaces the entry point** — SAML must be enabled in
Supabase and the identity provider registered:

```toml
# supabase/config.toml
[auth.sso]
enabled = true
```

```bash
# register an identity provider (per domain)
supabase sso add --type saml --metadata-url <IdP metadata> --domains acme.com
```

## Supabase prerequisites by method

<a id="google"></a>

### Google

```toml
# supabase/config.toml
[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
skip_nonce_check = true   # required for local sign-in
```

Set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` (and the same in the
hosted dashboard for production).

<a id="apple"></a>

### Apple

```toml
[auth.external.apple]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_APPLE_SECRET)"
```

<a id="invite-only"></a>

### Invite-only sign-up

Turning **Allow sign-ups** off hides the public sign-up UI and shows an
invite-only notice. For **hard** server enforcement also set:

```toml
[auth]
enable_signup = false
```

New staff are still invited from `/admin → Users → Create New` (choose the
Admin, Editor or Author role — the role decides staff access).

## Account settings (`/profile` + `/admin` Users)

Members manage their own account on **`/profile`** (web) and the native
**Profile** screen; admins manage anyone's from **`/admin/collections/users/:id`**.
Shared logic lives in `@acme/app` (`useUpdateProfile`, `useChangeEmail`,
`useChangePassword`, validators in `validators/auth.ts`), so web and native
behave the same.

| What | Member (`/profile`) | Admin (`/admin` → Users) |
| --- | --- | --- |
| Display name, job title, avatar | `profiles` (RLS) + `user_metadata`, then synced to `cms.users` | Edit the CMS fields → written through to `profiles` + `user_metadata` |
| Phone (contact only) | Same as above — `profiles.phone`, **not** a Supabase phone login (no SMS/OTP) | Contact tab → written through to `profiles.phone` |
| Email | `supabase.auth.updateUser({ email })` — **secure email change** | `auth.admin.updateUserById(id, { email, email_confirm: true })` — applies immediately, no emails (admin-only field) |
| Password | **Change password** dialog: `reauthenticate()` emails a code → then `updateUser({ password, nonce })` | Sidebar **Password** panel → `POST /api/cms/user-password` (admin role; never stored in the CMS) |

**Secure email change** (`double_confirm_changes = true` locally; on by default
on hosted Supabase). Supabase emails a confirmation link to **both** the current
and the new address, and `auth.users.email` changes only after **both** are
confirmed — until then the pending address is `user.new_email`, which `/profile`
shows with a *Resend* action. The kit's
[`email_change.html`](../supabase/templates/email_change.html) template links to
`/confirm-email?token_hash=…&type=email_change`: the first link shows "One more
step", the second completes the change and returns to `/profile`. The
`on_auth_user_updated` trigger mirrors the new email into `profiles.email`, and
the signup mirror (`ensureCmsUser`) brings `cms.users.email` in line — Supabase
Auth is always the source of truth for the login email.

**Password change** (`secure_password_change = true` locally; turn on
**Authentication → Providers → Email → Secure password change** on hosted).
The card shows a **Change password** button; the dialog (a step-by-step form on
native) first calls `supabase.auth.reauthenticate()`, which emails a 6-digit
code (template [`reauthentication.html`](../supabase/templates/reauthentication.html)),
and shows the new/confirm password fields only after the code is entered. The
code is sent as the `nonce` in `updateUser({ password, nonce })`. GoTrue
verifies the nonce only for sessions older than 24 hours — a wrong or expired
code then returns `reauthentication_not_valid` and the dialog goes back to the
code step. For a fresh session Supabase accepts the password without checking
the code, so there the step confirms the user can read the inbox but is not
enforced on the server. Users who signed up without a password (magic link /
OAuth) can set one here.

**Admin write-through** (`payload/hooks/sync-user-to-supabase.ts`): a
`beforeChange` hook on the Users collection diffs `email`, `displayName`,
`phone` and `jobTitle` on admin updates and applies them with the service-role
client; a Supabase error (e.g. the email is taken) aborts the save with a toast.
Server-side writes whose values came *from* Supabase (the mirror, the SSO
bridge) don't trigger it (`context.skipSupabaseSync`, or no `req.user`).

**Confirmations.** Every account change is confirmed on screen and, for the
security-relevant ones, by email:

| Change | On screen (top-center toast / native alert) | Email |
| --- | --- | --- |
| Email (after the 2nd link) | "Email address changed" — `?notice=email-changed` on the `emailRedirectTo` | — (both addresses already got a confirmation link) |
| Password (member) | "Password changed" | Supabase **Password changed** security notification ([`password_changed_notification.html`](../supabase/templates/password_changed_notification.html), `[auth.email.notification.password_changed]`) |
| Password (admin reset) | "Password updated." in the admin panel | App email "Your password was changed" (`/api/cms/user-password`) — Supabase doesn't notify for admin updates |
| Phone added / changed / removed | "Phone number changed" / "…removed" | App email (`payload/hooks/notify-contact-change.ts`, number masked to its last 4 digits) — member or admin edit |

App emails go through Payload's nodemailer adapter (`payload.config.ts`
`email`, `lib/email/smtp.ts`) using `SMTP_*` (`.env.example` → "Outgoing
email"); locally that's Mailpit's SMTP port, so they land in Mailpit next to
the auth emails. Unset in production → Payload only logs them. The member
phone notice is sent when the profile sync reaches `cms.users`
(`/api/cms/mirror-self`, best-effort).

**Hosted setup:** paste the **Change Email Address** and **Reauthentication**
templates into **Authentication → Emails** (see README → Deploy), keep
**Secure email change** on, turn on **Security notifications → Password
changed** with the kit template, and set `SMTP_*` (same provider as Supabase's
custom SMTP) for the app's own notices.

**URL status toasts.** `<AuthUrlMessage />` (front-end root layout,
`lib/auth/url-message.ts`) turns auth status in the URL into a top-center toast
on whatever page it lands on, then strips those params: the kit's
`?notice=email-changed`, and — for a project still on Supabase's default
templates, whose GoTrue redirect-style links land on the Site URL — the first
email-change link's `?message=Confirmation+link+accepted…#message=…&sb=` and a
failed link's `#error_code=…&error_description=…`. The URL is
attacker-controlled, so **only allowlisted copy is shown**: unknown `message` /
`notice` values are dropped and `error_description` is never rendered (errors
map by `error_code` to fixed text). A bare `?error=` (used by `/sign-in` and the
invite pages) is left alone. Pasting the kit templates is still preferred — the
first link then opens `/confirm-email` and its full "One more step" page.

## Auth events

`public.auth_events` records, per user, every **auth email** Supabase sends
(sign-up confirmation, magic link / email code or password reset, invite,
email change, reauthentication), every **sign-in**, and account changes
(signed up, password updated). A trigger on Supabase's
`auth.audit_log_entries` derives the rows; links, codes and tokens are never
stored. Read-own under RLS; modules may attach `mod_<slug>_*` triggers to it
(`database.triggersOn`), for example to show these events on a CRM timeline.

- GoTrue logs **magic link / email OTP sign-ins and password resets the same
  way** (`user_recovery_requested`), so they share the kind
  `sign_in_or_recovery`.
- An **email change** has no audit action of its own; the trigger detects it
  from the user row GoTrue just updated.
- **Hosted projects:** the trigger needs the auth audit log to be written to
  the database (Supabase's default). If the migration role can't attach a
  trigger to `auth.audit_log_entries`, the migration logs a notice and auth
  events stay empty — check with
  `select count(*) from public.auth_events;` after a sign-in.

## Schema / migration

The global lives in the `cms` schema. After changing the global config,
regenerate types and the migration on a machine with a running database:

```bash
pnpm cms:gen-types        # regenerates packages/cms/src/payload-types.ts
pnpm cms:migrate:create   # generates the cms migration — commit it
```

In dev/CI the table is created by Payload's dev "push"; production runs committed
migrations on first boot (`prodMigrations`). See `CLAUDE.md` → "How to add a
Payload content type".

## What stays in Supabase (not configurable here)

Session/JWT expiry, refresh-token rotation, server-side password requirements,
OTP length/expiry, rate limits, and MFA live in `supabase/config.toml` (or the
hosted dashboard) and are **not** controllable from this screen.
