#!/usr/bin/env bash
# Supabase's Security + Performance Advisor lints on the local, migrated
# database (unindexed foreign keys, auth.uid() not wrapped in a select,
# overlapping permissive policies, duplicate indexes, RLS gaps).
#
# Run by `pnpm test:rls`, so CI runs it without a step in the workflow file
# (an app's kit update then never changes .github/workflows just for this).
#
# Strict (fails on any WARN) in the kit's own repository, or with
# DREAM_ADVISORS_STRICT=1. In an app it only reports: a third-party or your
# own module's warning must not fail every kit update (and count against
# the release at Meet Dream). Run `pnpm db:advisors` for the strict check.
set -uo pipefail

if [[ "${GITHUB_REPOSITORY:-}" == "vpv-group/dream-starter-kit" || "${DREAM_ADVISORS_STRICT:-}" == "1" ]]; then
  exec supabase db advisors --local --type all --fail-on warn
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "db-advisors: supabase CLI not found; skipping the advisory check."
  exit 0
fi
supabase db advisors --local --type all || true
echo "db-advisors: advisory only here (set DREAM_ADVISORS_STRICT=1 to fail on warnings)."
exit 0
