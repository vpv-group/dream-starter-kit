#!/usr/bin/env bash
# `pnpm db:reset`: re-apply Supabase migrations + seed, then Payload migrations.
#
# Why a script: after `supabase db reset` recreates the auth container, the
# Kong gateway can keep proxying to the old container's address. Auth then
# answers 502, the CLI fails at "Restarting containers" (after the SQL has
# already been applied) and Payload's migrations never run. This wrapper
# restarts Kong when that happens, waits for auth, and carries on. It still
# fails loudly when a SQL migration itself fails.
set -uo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

project_id="$(sed -n 's/^project_id *= *"\(.*\)"/\1/p' supabase/config.toml | head -1)"
api_port="$(awk '/^\[api\]/{f=1;next} /^\[/{f=0} f && /^port *=/{gsub(/[^0-9]/,"");print;exit}' supabase/config.toml)"
health_url="http://127.0.0.1:${api_port:-54321}/auth/v1/health"

auth_status() { curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$health_url" || true; }

wait_for_auth() {
  for _ in $(seq 1 30); do
    [ "$(auth_status)" = "200" ] && return 0
    sleep 2
  done
  return 1
}

restart_kong() {
  local kong="supabase_kong_${project_id}"
  if docker ps --format '{{.Names}}' | grep -qx "$kong"; then
    echo "[db:reset] auth isn't reachable through the gateway; restarting $kong"
    docker restart "$kong" >/dev/null
  fi
}

log="$(mktemp)"
trap 'rm -f "$log"' EXIT

supabase db reset 2>&1 | tee "$log"
reset_status=${PIPESTATUS[0]}

if [ "$reset_status" -ne 0 ]; then
  # A failing migration prints a Postgres error (SQLSTATE); that is fatal.
  # The gateway problem fails after the SQL ran, with a 502 on restart.
  if grep -q 'SQLSTATE' "$log" || ! grep -q '502' "$log"; then
    echo "[db:reset] supabase db reset failed (see above)" >&2
    exit "$reset_status"
  fi
  echo "[db:reset] migrations applied; recovering from a gateway 502 after the container restart"
fi

# Give a healthy stack a moment to come back before blaming the gateway.
for _ in 1 2 3 4 5; do
  [ "$(auth_status)" = "200" ] && break
  sleep 2
done
if [ "$(auth_status)" != "200" ]; then
  restart_kong
  if ! wait_for_auth; then
    echo "[db:reset] auth is still unhealthy at $health_url" >&2
    exit 1
  fi
fi

pnpm cms:migrate
