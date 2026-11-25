#!/usr/bin/env bash
# Cloud environment setup script — warms the cache for Claude Code on the web.
#
# The cloud environment's "Setup script" (environment settings → Setup script)
# runs once before Claude Code launches and its result is CACHED, so whatever
# this script installs is already present in every later session. Paste this
# into that field:
#
#   #!/bin/bash
#   for f in "$PWD/scripts/cloud-setup.sh" /home/user/*/scripts/cloud-setup.sh; do
#     [ -f "$f" ] && exec bash "$f"
#   done
#   echo "scripts/cloud-setup.sh not found; the SessionStart hook will install everything instead"
#
# (The lookup doesn't depend on the repo's name, so forks work unchanged. The
# Setup script is optional: the SessionStart hook installs the same things.)
#
# What it does:
#   1. pnpm install
#   2. Best effort: one run of the shared bootstrap
#      (`pnpm dev:setup --profile cloud --no-dev-admin`, tooling/setup), so the
#      snapshot caches the pinned Supabase CLI, the Supabase Docker images and
#      Playwright's Chromium. Never fatal — the SessionStart hook runs the same
#      bootstrap on every session anyway.
#   3. Leaves nothing live in the snapshot: stops Supabase without a backup,
#      stops dockerd if this script started it, and removes the .env (it holds
#      a generated PAYLOAD_SECRET) if this script created it. The hook rebuilds
#      the stack, .env and database per session.
set -euo pipefail

cd "$(cd "$(dirname "$0")/.." && pwd)"

log() { echo "[cloud-setup] $*"; }

log "1/3 pnpm install"
pnpm install --prefer-offline

had_docker=0
docker info >/dev/null 2>&1 && had_docker=1
had_env=0
[ -f .env ] && had_env=1

log "2/3 pnpm dev:setup --profile cloud --no-dev-admin (best effort)"
if ! pnpm dev:setup --profile cloud --no-dev-admin; then
  log "dev:setup failed here; the SessionStart hook will finish the install"
fi

log "3/3 cleanup (nothing live in the cached snapshot)"
supabase stop --no-backup >/dev/null 2>&1 || true
if [ "$had_docker" = "0" ]; then
  pkill -x dockerd >/dev/null 2>&1 || true
fi
if [ "$had_env" = "0" ]; then
  rm -f .env
fi

log "done"
