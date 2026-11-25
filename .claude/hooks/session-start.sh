#!/bin/bash
# SessionStart hook — boots the full local stack for Claude Code on the web.
#
# Cloud session containers start with no Docker daemon, no Supabase CLI and no
# .env. This hook runs the same bootstrap developers and CI use —
# `pnpm dev:setup` (tooling/setup) — with the `cloud` profile:
#
#   dockerd → the Supabase CLI version CI pins → supabase start WITHOUT
#   edge-runtime (its rlimits are forbidden in the sandboxed nested-container
#   runtime, so edge functions don't run here) → .env from .env.example with
#   the local keys → pnpm db:reset → a dev admin (admin@dream.test, password in
#   .dream/dev-admin.json; its first /admin visit seeds the CMS) → Playwright's
#   Chromium.
#
# It does NOT start the Next.js dev server — use the "web" configuration in
# .claude/launch.json or `pnpm dev:next`.
#
# Idempotent: every step is skipped when already done, so resumes are fast.
set -euo pipefail

# Cloud sessions only — local dev runs `pnpm dev:setup` itself.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# The harness sets CLAUDE_PROJECT_DIR; fall back to this script's repo when run by hand.
cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

echo "[session-start] pnpm install"
pnpm install --prefer-offline

echo "[session-start] pnpm dev:setup --profile cloud"
pnpm dev:setup --profile cloud

echo "[session-start] done — Supabase API :54321, Studio :54323, Mailpit :54324"
