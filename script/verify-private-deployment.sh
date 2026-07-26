#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

require_service() {
  if ! docker compose ps --status running --services | grep -qx "$1"; then
    printf 'Required service is not running: %s\n' "$1" >&2
    exit 1
  fi
}

expect_status() {
  local expected="$1"
  local label="$2"
  shift 2
  local actual
  actual="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 15 "$@")"
  if [[ "$actual" != "$expected" ]]; then
    printf '%s expected HTTP %s, received %s.\n' "$label" "$expected" "$actual" >&2
    exit 1
  fi
  printf 'HTTP_CHECK_OK %s=%s\n' "$label" "$actual"
}

require_command docker
require_command curl
require_command grep

TAILSCALE_COMMAND=()
TAILSCALE_USES_WINDOWS_NETWORK=0
if command -v tailscale >/dev/null 2>&1; then
  TAILSCALE_COMMAND=(tailscale)
elif command -v tailscale.exe >/dev/null 2>&1; then
  TAILSCALE_COMMAND=(tailscale.exe)
  TAILSCALE_USES_WINDOWS_NETWORK=1
elif [[ -x "/mnt/c/Program Files/Tailscale/tailscale.exe" ]]; then
  TAILSCALE_COMMAND=("/mnt/c/Program Files/Tailscale/tailscale.exe")
  TAILSCALE_USES_WINDOWS_NETWORK=1
else
  printf 'Missing Tailscale CLI: install Tailscale for Windows or Linux.\n' >&2
  exit 1
fi
cd "$REPO_ROOT"

docker compose config --quiet
require_service db
require_service app

app_binding="$(docker compose port app 3000)"
if [[ ! "$app_binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]]; then
  printf 'App must bind only to IPv4 loopback; received: %s\n' "$app_binding" >&2
  exit 1
fi
app_port="${BASH_REMATCH[1]}"
database_container_id="$(docker compose ps -q db)"
database_bindings="$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$database_container_id")"
if [[ "$database_bindings" != "{}" && "$database_bindings" != "null" ]]; then
  printf 'PostgreSQL must not publish a host port; received bindings: %s\n' "$database_bindings" >&2
  exit 1
fi
printf 'NETWORK_BINDING_OK app=%s database=internal-only\n' "$app_binding"

container_user="$(docker compose exec -T app id -u)"
if [[ "$container_user" == "0" ]]; then
  printf 'App container is running as root.\n' >&2
  exit 1
fi
if docker compose exec -T app sh -c 'probe=/app/.private-deployment-write-test; if touch "$probe"; then rm -f -- "$probe"; exit 0; fi; exit 1' >/dev/null 2>&1; then
  printf 'App container root filesystem is writable.\n' >&2
  exit 1
fi
printf 'CONTAINER_HARDENING_OK uid=%s rootfs=read-only\n' "$container_user"

app_origin="$(docker compose exec -T app sh -c 'printf %s "$APP_ORIGIN"')"
allowed_login="$(docker compose exec -T app sh -c 'printf %s "$TAILSCALE_ALLOWED_LOGIN"')"
loopback_origin="http://127.0.0.1:${app_port}"

expect_status 200 health "${loopback_origin}/api/health"
expect_status 401 missing_identity "${loopback_origin}/research"
expect_status 401 missing_identity_rsc --header 'RSC: 1' "${loopback_origin}/research.rsc"
expect_status 401 missing_identity_segment_prefetch \
  --header 'RSC: 1' \
  --header 'Next-Router-Prefetch: 1' \
  --header 'Next-Router-Segment-Prefetch: /research' \
  "${loopback_origin}/research?__next_rsc=private-access-check"
expect_status 403 wrong_identity --header 'Tailscale-User-Login: denied@example.invalid' "${loopback_origin}/research"
expect_status 200 allowed_identity --header "Tailscale-User-Login: ${allowed_login}" "${loopback_origin}/research"
expect_status 403 wrong_origin --request POST --header "Tailscale-User-Login: ${allowed_login}" --header 'Origin: https://denied.example.invalid' --header 'Content-Type: application/json' --data '{}' "${loopback_origin}/api/funds"

response_headers="$(curl --silent --show-error --head --max-time 15 --header "Tailscale-User-Login: ${allowed_login}" "${loopback_origin}/research" | tr -d '\r')"
for header_name in content-security-policy strict-transport-security x-content-type-options x-frame-options permissions-policy; do
  if ! grep -qi "^${header_name}:" <<<"$response_headers"; then
    printf 'Missing security header: %s\n' "$header_name" >&2
    exit 1
  fi
done
printf 'SECURITY_HEADERS_OK\n'

serve_status="$("${TAILSCALE_COMMAND[@]}" serve status)"
if grep -Eqi 'funnel[^[:alnum:]]*(on|enabled)' <<<"$serve_status"; then
  printf 'Tailscale Funnel appears to be enabled; disable it before continuing.\n' >&2
  exit 1
fi
if [[ "$TAILSCALE_USES_WINDOWS_NETWORK" == "1" ]] && command -v curl.exe >/dev/null 2>&1; then
  tailscale_https_status="$(curl.exe --silent --show-error --output NUL --write-out '%{http_code}' --max-time 15 "$app_origin")"
  tailscale_https_status="${tailscale_https_status//$'\r'/}"
  if [[ "$tailscale_https_status" != "200" ]]; then
    printf 'tailscale_https expected HTTP 200, received %s.\n' "$tailscale_https_status" >&2
    exit 1
  fi
  printf 'HTTP_CHECK_OK tailscale_https=%s network=windows\n' "$tailscale_https_status"
else
  expect_status 200 tailscale_https "$app_origin"
fi
printf 'TAILSCALE_PRIVATE_ACCESS_OK origin=%s\n' "$app_origin"

if [[ "${VERIFY_RESTART:-0}" == "1" ]]; then
  count_query='SELECT json_build_array((SELECT COUNT(*) FROM "User"), (SELECT COUNT(*) FROM "Fund"), (SELECT COUNT(*) FROM "BenchmarkInstrument"));'
  before_counts="$(docker compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql --host=127.0.0.1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --tuples-only --no-align --command="$1"' _ "$count_query")"
  docker compose restart db app >/dev/null
  for attempt in $(seq 1 30); do
    if docker compose exec -T db sh -c 'pg_isready --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' >/dev/null 2>&1 \
      && curl --silent --fail --output /dev/null --max-time 5 "${loopback_origin}/api/health"; then break; fi
    if [[ "$attempt" == "30" ]]; then printf 'Services did not recover after restart.\n' >&2; exit 1; fi
    sleep 2
  done
  after_counts="$(docker compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql --host=127.0.0.1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --tuples-only --no-align --command="$1"' _ "$count_query")"
  if [[ "$before_counts" != "$after_counts" ]]; then
    printf 'Core table counts changed after restart: %s -> %s\n' "$before_counts" "$after_counts" >&2
    exit 1
  fi
  printf 'RESTART_PERSISTENCE_OK counts=%s\n' "$after_counts"
fi

printf 'PRIVATE_DEPLOYMENT_VERIFIED\n'
