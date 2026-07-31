#!/usr/bin/env bash

set -euo pipefail

DATABASE_URL="${E2E_DATABASE_URL:-}"
if [[ -z "$DATABASE_URL" ]]; then
  printf 'E2E_DATABASE_URL is required.\n' >&2
  exit 1
fi
export DATABASE_URL
export PORT=3100
export PRIVATE_ACCESS_MODE=tailscale
export TAILSCALE_ALLOWED_LOGIN=e2e@example.com
export APP_ORIGIN=http://127.0.0.1:3100

for existing_pid in $(pgrep -f "next-server" || true); do
  existing_cwd="$(readlink -f "/proc/${existing_pid}/cwd" 2>/dev/null || true)"
  if [[ "$existing_cwd" == "$PWD" ]]; then
    kill "$existing_pid" >/dev/null 2>&1 || true
  fi
done

for attempt in $(seq 1 20); do
  if PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="我同意在临时开发数据库上执行 force reset" pnpm exec prisma db push --accept-data-loss --force-reset --skip-generate >/dev/null 2>&1; then
    break
  fi

  sleep 1

  if [[ "$attempt" -eq 20 ]]; then
    echo "Timed out waiting for prisma db push to succeed" >&2
    exit 1
  fi
done

pnpm build >/dev/null
mkdir -p .next/standalone/public .next/standalone/.next/static
cp -R public/. .next/standalone/public/
cp -R .next/static/. .next/standalone/.next/static/
node .next/standalone/server.js &
APP_PID=$!
wait $APP_PID
