#!/usr/bin/env bash

set -euo pipefail

DATABASE_URL="${TEST_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "$DATABASE_URL" ]]; then
  printf 'TEST_DATABASE_URL or DATABASE_URL is required.\n' >&2
  exit 1
fi

export DATABASE_URL

database_name="$(node -e 'const parsed = new URL(process.env.DATABASE_URL); process.stdout.write(parsed.pathname.startsWith("/") ? parsed.pathname.slice(1) : parsed.pathname);')"
if [[ ! "$database_name" =~ (_integration|_e2e|_test)$ ]]; then
  printf 'Refusing to run integration tests against non-test database: %s\n' "$database_name" >&2
  exit 1
fi

PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="我同意仅重置后缀受保护的临时集成测试数据库" \
  pnpm exec prisma db push --accept-data-loss --force-reset --skip-generate >/dev/null
pnpm exec vitest run --config vitest.integration.config.ts
