/**
 * Preview-deployment guard for boot-time database changes.
 *
 * The runtime DB bootstrap (lib/db/bootstrap.ts) and Payload's `prodMigrations`
 * (payload.config.ts) both apply migrations when a server boots. A hosting
 * PREVIEW deployment of an unmerged branch (an update PR, a module install)
 * usually shares the production database's env vars, so letting it boot those
 * migrations would change production before the branch is merged — and leave
 * production's schema ahead of the code it actually runs.
 *
 * So on a preview deployment both are skipped, unless the operator opts in
 * with `DB_BOOTSTRAP=on` — the setting for previews that get their own
 * isolated database (e.g. Supabase Branching, which injects per-branch env).
 *
 * Pure (no env import) so payload.config.ts and the bootstrap can share it and
 * it stays unit-testable (preview-guard.test.ts).
 */
export function isGuardedPreview(
  envSource: Record<string, string | undefined>,
): boolean {
  return envSource.VERCEL_ENV === "preview" && envSource.DB_BOOTSTRAP !== "on";
}
