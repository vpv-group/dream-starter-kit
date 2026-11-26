# Staying up to date with the kit

> You forked or cloned the **Dream Starter Kit** and made it yours. The kit keeps
> evolving — bug fixes, new modules, security hardening — and you want those
> changes without throwing away your own work. This is the **tested workflow** for
> pulling upstream into a downstream repo and keeping the relationship healthy so
> every future update is a routine three-way merge.
>
> **Conventions & recipes:** [`CLAUDE.md`](../CLAUDE.md). **Architecture:**
> [`ARCHITECTURE.md`](./ARCHITECTURE.md).

The whole thing rests on one git fact: a merge is clean and incremental only when
the two branches **share history** (a common ancestor). Get that ancestor in place
once, never squash it away, and updates stay easy forever.

---

## Automatic update PRs

Once GitHub is connected in **/admin → Updates** (see
[`MODULES.md`](./MODULES.md#admin-panel--automatic-updates)), the daily
`module-ops.yml` run does this routine for you. Kit updates are free and need
no license key or stored secret. The `kit-update` job:

1. Finds the kit's newest **published release**: the highest `vX.Y.Z` tag
   (`pnpm mod ops kit-plan`). Never `main`, never a pre-release such as
   `v2.4.0-rc.1`. If that release is already merged, or the kit hasn't
   published one yet, it exits with a notice.
2. Verifies the release's **build attestation**: it rebuilds the release's
   source archive from the tag and checks it with `gh attestation verify`
   against the kit repository. A release that doesn't verify is never merged.
3. Merges the release into a `dream/kit-update-<date>` branch.
   - A repo that shares no history with the kit (a Vercel clone, "Use this
     template") first gets a **baseline**: `pnpm mod ops baseline` records
     the kit release matching its `package.json` version as an ancestor
     with `git merge -s ours` (no file changes), pushed to the default
     branch, or carried in the update PR when branch protection refuses.
     The update is then a normal three-way merge. Only when the kit has no
     release for that version does it fall back to
     `--allow-unrelated-histories`.
   - Conflicts in **generated** files (lockfile, Payload and Supabase types,
     the migrations bundle, `*.generated.*`) take the release's side
     (`pnpm mod ops resolve-generated`), then everything is regenerated:
     `pnpm install`, `pnpm mod sync`, `pnpm db:gen-migrations` and both
     gen-types against a Supabase started on the runner.
   - Conflicts in hand-written files are committed as markers, and the PR
     gets the `dream-update-conflicts` label.
4. Opens one PR labeled `dream-update` that shows the version jump. Later
   runs refresh that same PR instead of opening another.

**Merging.** With **Merge updates automatically** on (the default), the
`merge` job merges the PR with a **merge commit** once every check passes,
there are no conflicts, and the release has soaked for 72 hours. Major
versions, migrations that remove data and changes to `.github/workflows/`
always wait for you, and a failed production deploy pauses automatic merging
(MODULES.md has the full list). With it off, review the PR, run the
post-merge validation below and merge it yourself — **merge commit, never
squash**.

- Turn the daily check off with **Automatic updates** in /admin → Updates.
- Run it now with **Check now** there.

**Removed in 2.4.** Automatic updates no longer use a personal access token
or repository settings. Once GitHub is connected, delete these if you set
them; nothing reads them any more:

| Removed                                                                                          | Where it was                           |
| ------------------------------------------------------------------------------------------------ | -------------------------------------- |
| `MOD_OPS_TOKEN`, `DREAM_LICENSE_KEY`                                                             | repository secrets                     |
| `GITHUB_OPS_TOKEN`, `GITHUB_REPO`, `DREAM_LICENSE_KEY`, `MOD_CATALOG_URL`                        | Vercel env / `.env`                    |
| `MOD_AUTO_UPDATE`, `MOD_AUTO_MERGE`, `KIT_AUTO_UPDATE`, `MOD_REGISTRY_FIRST`, `KIT_UPSTREAM_URL` | repository variables                   |
| "Allow auto-merge"                                                                               | repository settings (no longer needed) |

The private `module-uploads` storage bucket is no longer used (ZIP installs
are CLI-only); it is left in place because Supabase doesn't allow deleting a
bucket from a migration. Delete it from the dashboard if it's empty.

**Also in 2.5 — background work, billing and data at scale.** The update
needs nothing from you to keep working; these are the leftovers you can clean
up once it's live:

| What changed                                                                                                                                                                                                       | What to do                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheduled work runs on **Supabase Cron** (installed by the migrations), not Vercel Cron: the app stores its URL and a cron secret in Supabase Vault when it boots. `CRON_SECRET` is optional (derived when unset). | Nothing. /cms-setup/services → **Scheduled jobs** shows whether Supabase reaches the app.                                                         |
| The kit ships **no edge functions**: billing, account deletion and reminders run in the app. A leftover `reminders-process` pg_cron job is removed by the reminders migration.                                     | `supabase functions delete billing-stripe-webhook delete-account reminders-process`                                                               |
| **One Stripe webhook** (`/api/mod/billing/stripe/webhook`), registered through the Stripe API within the hour once `STRIPE_SECRET_KEY` is set (docs/STRIPE.md §4).                                                 | After it shows a successful delivery in Stripe, delete the two old endpoints, and remove `STRIPE_WEBHOOKS_ENDPOINT_SECRET` (deprecated, ignored). |
| Removed CMS fields `likeCount` / `commentCount` and the unused `device-tokens` collection. Their columns/table stay for one release (expand/contract), so a revert is safe.                                        | Nothing; a later release drops them (a `dream:contract` step that waits for your review).                                                         |

Also in 2.5:

- **2.4.0 doesn't contain any of this.** 2.4.0 is the updates release (Meet
  Dream AI, first install); 2.5.0 is the first release with the schema work.
  Each goes out on its own, so a problem in one can't hide behind the other.
- **No workflow changes.** Supabase's database advisors run inside
  `pnpm test:rls` (`scripts/db-advisors-ci.sh`): strict in the kit's own
  repository, advisory in your app, so a module's advisor warning never fails
  your kit updates. `pnpm db:advisors` is still the strict local check. Kit
  updates keep out of `.github/workflows` where they can, because a change
  there always waits for your review.
- **Module housekeeping registers itself.** Modules that shipped a
  `mod_<slug>_housekeeping()` before 2.5 (CRM 1.3, client portal 0.2, …) are
  registered for the hourly retention run by a 2.5 migration, and the kit
  revokes API access to every registered housekeeping function.
- **Clones with their own `vercel.json`:** take the kit's version (no `crons`;
  Supabase Cron schedules everything) and keep your own settings such as
  `regions`. Keeping the old crons runs notification dispatch and the daily
  report twice.
- **Payload migrations follow expand/contract too.** The lint and the
  automatic-merge check now read the `up()` of Payload `.ts` migrations
  (from 2.5 on). If your app dropped or renamed something in its own older
  migration, list that file in `supabase/migration-safety.allow.json` (a JSON
  array of repo-relative paths) instead of editing the migration.
- **Large tables:** 2.5's new indexes are built at boot without
  `concurrently`, which briefly blocks writes to those tables. That's fine for
  young apps; if yours has millions of chat messages or notifications, apply
  the 2.5 migrations in a quiet hour (`supabase db push`) before merging.
- **Vercel Deployment Protection:** if you protect production deployments, turn
  on **Protection Bypass for Automation**. The app keeps that secret in Supabase
  Vault so Supabase Cron can still reach it.

The rest of this guide is the same routine done by hand. (By hand you can merge
a release tag the same way: `git fetch upstream tag vX.Y.Z` then
`git merge vX.Y.Z`. Merging `upstream/main` also works, but gets unreleased work.)

### How kit releases work (maintainers)

Kit releases are made by `.github/workflows/release.yml` in the kit repository:

1. Bump `version` in the root `package.json` (`KIT_VERSION` follows; a unit test
   keeps them equal) and merge it to `main`.
2. Tag the merge commit `vX.Y.Z` and push the tag. Use `vX.Y.Z-rc.N` first to
   publish a release candidate (a GitHub pre-release; apps never receive it).
3. The workflow checks the tag matches the version, runs the full CI suite with
   the E2E against a production build (`next build && next start`), then
   attests the source archive and publishes the GitHub Release.

Until the first `vX.Y.Z` release exists, the daily check reports "No kit release
yet" and opens nothing.

---

## One-time setup — add the kit as a remote

Your fork has GitHub's built-in "upstream" relationship, but the CLI merge flow
needs a **named git remote** pointing at the kit:

```bash
git remote add upstream https://github.com/vpv-group/dream-starter-kit.git
git fetch upstream
```

Do this once per clone. `origin` stays your fork; `upstream` is the kit you pull from.

---

## Which starting situation are you in?

How you created your repo decides whether you already share history with the kit.
**Detect it** — from your default branch (e.g. `main`):

```bash
git merge-base main upstream/main
```

- **Prints a commit SHA → SHARED HISTORY.** You used GitHub's **"Fork"** button. A
  plain merge already works as a normal three-way merge — skip straight to
  [The routine](#the-routine-every-update). You're done with setup.
- **Prints nothing / exits non-zero → UNRELATED HISTORY.** You used **"Use this
  template"**, or cloned + `rm -rf .git && git init`, or started from a squashed
  "Initial commit" snapshot. Git has **no common ancestor**, so a plain
  `git merge upstream/main` fails (`refusing to merge unrelated histories`). Fix it
  **once** with the baseline merge below.

### Baseline merge (unrelated-history repos only, run once)

```bash
git checkout main
git merge upstream/main --allow-unrelated-histories
# resolve any conflicts, then:
git commit
```

> **This is nearly conflict-free if your tree already closely matches a known
> upstream commit.** Git diffs against an _empty_ tree for the common base, so
> files that are byte-identical on both sides merge cleanly — conflicts arise
> **only** on files whose content genuinely differs (your branding, your README,
> anything you edited). Resolve those with the same hotspot rules below.

After this single merge, `upstream/main` becomes a **real ancestor** of your `main`.
From now on `git merge-base` resolves, and **all** future updates are ordinary
three-way merges — you never pass `--allow-unrelated-histories` again.

---

## The routine (every update)

Once history is shared, every sync is the same four-step loop:

```bash
git fetch upstream
git checkout -b sync/upstream-$(date +%Y-%m-%d)   # branch off your main
git merge upstream/main                            # real conflicts ONLY where you
                                                   #   edited the same lines the kit did
# resolve conflicts (see hotspots below), then run the gates:
pnpm install && pnpm typecheck && pnpm lint && pnpm test
# open a PR from sync/upstream-YYYY-MM-DD into your main
```

That's it. Because you share history, the merge only surfaces conflicts on lines
**you** changed that the kit **also** changed — everything else fast-forwards in.

### Critical — do NOT squash sync PRs

Land the sync PR with a **merge commit** or a **rebase/fast-forward** — never
"Squash and merge."

> Squashing flattens the merge commit that records `upstream/main` as an ancestor.
> Lose that commit and git forgets you share history: your next `git merge-base`
> comes up empty and you're back to `--allow-unrelated-histories` and a wall of
> phantom conflicts. **One squash undoes the whole setup.**

Set your fork's merge method accordingly (GitHub → repo **Settings → General →
Pull Requests**: allow merge commits / rebase merging), or just remember to pick a
non-squash method **on sync PRs specifically**. Feature PRs inside your own fork can
squash freely — this only matters for PRs that carry an upstream merge.

---

## Conflict hotspots

Most conflicts cluster in a handful of predictable places. Handle each by its kind,
not line-by-line:

- **Generated files — REGENERATE, never hand-merge.** Take _either_ side, then
  rebuild:
  - `packages/cms/src/payload-types.ts` → `pnpm cms:gen-types`
  - Supabase types (`packages/api`) → `pnpm db:gen-types`
    Both scripts pipe their output through `prettier --write`, so the regenerated
    files already pass `pnpm format` (raw generator output uses single quotes / no
    semicolons and would fail CI's `format` job). If a regenerate still shows a diff
    with no real type change, your clone predates that — pull the kit's
    `package.json` scripts rather than discarding or hand-formatting the file.
- **Migrations are append-only.** Never edit a shipped migration; **keep BOTH
  sides'** migration files (yours _and_ the kit's new ones). After merging, run
  `pnpm db:reset` to apply the combined sequence, then `pnpm db:gen-migrations` if
  the runtime-bundle JSON drifted (drift fails `pnpm test`).
- **Env — reconcile both halves.** A new kit var means editing **both**
  `.env.example` **and** the zod schema in `packages/config`. Take both sides' new
  vars; keep your own values in your local `.env` (which isn't committed).
- **`pnpm-lock.yaml` — don't hand-merge.** Take either side, then regenerate with
  `pnpm install`.

---

## Files you intentionally diverge on

Branding, your own CI workflows, your README — files you've rewritten and never want
upstream to clobber. Pin them with a **merge driver** so upstream edits are silently
ignored:

```bash
# .gitattributes (committed — applies the driver to these paths on merge)
README.md          merge=ours
.github/workflows/** merge=ours
apps/expo/app.config.ts merge=ours
```

```bash
# enable the driver — per-clone, NOT committed (git has no built-in "ours" driver)
git config merge.ours.driver true
```

> **Caveat — `merge=ours` only covers content conflicts on files present on both
> sides.** It does **not** cover **modify/delete**: a file you _deleted_ that
> upstream later edits still raises a modify/delete conflict. Resolve those by
> re-deleting (`git rm <file>`). And remember the `git config` line is **local to
> each clone** — re-run it after a fresh clone, and tell collaborators to as well.

---

## Post-merge validation

Before you merge the sync PR, prove the combined tree actually works:

```bash
pnpm install          # reconcile the lockfile
pnpm db:reset         # apply the merged migration sequence (+ cms:migrate)
pnpm cms:gen-types    # regenerate Payload types
pnpm db:gen-types     # regenerate Supabase types
pnpm typecheck && pnpm lint && pnpm test
pnpm test:rls         # ONLY if the merge touched schema or RLS (needs supabase start)
```

These are the same gates the kit's own CI runs (see [`CLAUDE.md`](../CLAUDE.md) →
Commands). Green here means the merge is safe to land.

---

## Alternative — cherry-pick a single urgent fix

Need one specific upstream fix _now_, without a full sync? Cherry-pick it — it's
patch-based, so it works **even across unrelated histories** (no baseline merge
required):

```bash
git fetch upstream
git log upstream/main --oneline      # find the commit
git cherry-pick <sha>
```

This doesn't establish shared history (only a real merge does that), so it's a
stopgap, not a substitute for the routine — do a proper sync when you can.

---

## Doing this with Claude Code

If you run Claude Code in your fork, just ask it to _"sync with upstream"_ — the
routine, hotspots and the no-squash rule are encoded in [`CLAUDE.md`](../CLAUDE.md)
(→ **Staying current with the kit (upstream sync)**), so the agent follows the same
steps, regenerates the right files, and runs the gates before opening the PR.
