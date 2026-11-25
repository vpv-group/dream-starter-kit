#!/usr/bin/env bash
# `pnpm test:e2e`: the Playwright web E2E suite.
#
# The founder setup project needs an EMPTY users table (the first sign-up
# becomes the owner), but `pnpm dev:setup` creates a dev admin and local work
# adds users. So outside CI this resets the database first (≈1 min). CI starts
# from a fresh stack and skips it. Set E2E_REUSE_DB=1 to keep your data (the
# founder setup then fails if any user exists). Rerun `pnpm dev:setup`
# afterwards to get the dev admin back.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${CI:-}" ] && [ "${E2E_REUSE_DB:-}" != "1" ]; then
  echo "[test:e2e] resetting the database for the founder flow (E2E_REUSE_DB=1 skips)"
  pnpm db:reset
  rm -f .dream/dev-admin.json
fi

exec pnpm -F @acme/web-e2e test:e2e "$@"
