#!/usr/bin/env bash
# Cloud environment setup script — pre-installs the heavy toolchain for
# Claude Code on the web.
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
# What it does (every step idempotent — safe to rerun):
#   1. Supabase CLI at the version CI pins in .github/workflows/ci.yml
#   2. pnpm install
#   3. Playwright's Chromium (visual testing + e2e)
#   4. Best effort: pre-pull the Supabase Docker images (start the stack once,
#      then stop it without a backup) so the per-session `supabase start`
#      doesn't download them. Never fatal; skip with SKIP_DOCKER_PREPULL=1.
#
# It deliberately does NOT write .env, reset or seed the database — database
# state isn't part of the cached snapshot. The SessionStart hook
# (.claude/hooks/session-start.sh) does that on every session, and calls this
# script first (with SKIP_DOCKER_PREPULL=1) so the toolchain steps live in one
# place.
set -euo pipefail

cd "$(cd "$(dirname "$0")/.." && pwd)"

log() { echo "[cloud-setup] $*"; }

log "1/4 supabase CLI"
SUPABASE_CLI_VERSION=$(grep -A12 'supabase/setup-cli' .github/workflows/ci.yml | sed -n 's/^ *version: *//p' | head -1)
if [ -z "$SUPABASE_CLI_VERSION" ]; then
  echo "[cloud-setup] could not read the Supabase CLI version from .github/workflows/ci.yml" >&2
  exit 1
fi
if [ "$(supabase --version 2>/dev/null || true)" != "$SUPABASE_CLI_VERSION" ]; then
  npm install -g "supabase@$SUPABASE_CLI_VERSION"
fi

log "2/4 pnpm install"
pnpm install --prefer-offline

log "3/4 playwright chromium"
pnpm -F @acme/web-e2e exec playwright install chromium

if [ "${SKIP_DOCKER_PREPULL:-}" = "1" ]; then
  log "4/4 docker image pre-pull skipped (SKIP_DOCKER_PREPULL=1)"
  log "done"
  exit 0
fi

log "4/4 pre-pull Supabase docker images (best effort)"
prepull() {
  local started_dockerd=0
  if ! docker info >/dev/null 2>&1; then
    command -v dockerd >/dev/null 2>&1 || { log "no dockerd available; skipping"; return 0; }
    nohup dockerd >/tmp/dockerd.log 2>&1 &
    started_dockerd=1
    for _ in $(seq 1 30); do
      docker info >/dev/null 2>&1 && break
      sleep 2
    done
    docker info >/dev/null 2>&1 || { log "dockerd failed to start (see /tmp/dockerd.log); skipping"; return 0; }
  fi

  # A running stack already has its images; leave it alone.
  if supabase status >/dev/null 2>&1; then
    log "supabase stack already running; images present"
  else
    # edge-runtime can't boot in the sandboxed container runtime (see the hook).
    if supabase start -x edge-runtime; then
      supabase stop --no-backup || true
    else
      log "supabase start failed; images may be partially cached"
      supabase stop --no-backup >/dev/null 2>&1 || true
    fi
  fi

  if [ "$started_dockerd" = "1" ]; then
    pkill -x dockerd >/dev/null 2>&1 || true
  fi
}
prepull || log "pre-pull failed; the SessionStart hook will pull images instead"

log "done"
