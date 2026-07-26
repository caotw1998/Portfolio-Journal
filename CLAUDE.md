# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Portfolio Journal is a dual-entry, single-database portfolio tracking system. It has two ingestion paths:
1. **Codex** (AI chat interface) — for natural language / screenshot data entry
2. **Web App** — for visualization, verification, editing, and analysis

**Current Phase**: Phase 2 is complete. The Web App UI, authentication, core APIs, and recalculation scaffolding are in place. The recommended next step is **Phase 3** (Codex text ingestion pipeline).

**Key Documents**: `SPEC.md`, `AGENT.md`, `plan/plan.md`, `plan/ai-handoff.md`

## Architecture

### Tech Stack
- **Framework**: Next.js 16 App Router + React 19 + TypeScript (strict)
- **Styling**: Tailwind CSS v4 + shadcn/ui (`app/globals.css`)
- **Database**: PostgreSQL via Prisma 6.19 (`prisma/schema.prisma`)
- **Auth**: Custom password hash + SHA-256 session cookies (not NextAuth)
- **Testing**: Vitest (unit + integration) + Playwright (E2E)

### Directory Conventions
- `app/` — Next.js pages and API Route Handlers
- `lib/auth/` — Password hashing and session management
- `lib/db/` — Prisma client singleton (`prisma.ts`)
- `lib/domain/` — Business logic: transactions, holdings, performance, recalc, audit
- `lib/api/` — Shared API helpers (`responses.ts`, `client-sync.ts`)
- `tests/` — Test suites: `smoke/`, `domain/`, `integration/`, `e2e/`
- `plan/` — Design docs and AI handoff notes
- `script/` — Shell scripts for test orchestration

### Core Design Rules
- **Database is the single source of truth (SSOT)**. No direct SQL writes from frontend or Codex.
- **All writes go through controlled APIs** with business validation.
- **All `create`/`update`/`delete`/`recompute` operations write an `AuditLog`** (`lib/domain/audit.ts`).
- **`DailyPerformance` is derived data only**. It is never written directly by users or Codex. It is produced by the recalculation worker from transactions, holdings, and price snapshots.
- **Dirty Queue Recalculation**: When transactions/holdings/prices change, `enqueuePortfolioRecalc()` (`lib/domain/recalc.ts`) creates or updates a `PortfolioRecalcQueue` record. The worker processes from the earliest dirty date forward.
- **Session Management**: `lib/auth/session.ts` manages httpOnly cookies. Use `getCurrentUser()` for API routes and `requirePageUser()` for server pages (redirects to `/login`).

### Prisma Models
Key models: `User`, `Session`, `Portfolio`, `Asset`, `HoldingSnapshot`, `Transaction`, `DailyPerformance`, `AssetPriceSnapshot`, `AuditLog`, `CodexIngestionLog`, `PortfolioRecalcQueue`.

## Common Commands

### Development
```bash
pnpm dev
```

### Database
```bash
pnpm db:generate      # Generate Prisma Client after schema changes
pnpm db:migrate:dev   # Create/run migrations in development
pnpm db:studio        # Open Prisma Studio
```

### Testing
```bash
pnpm test             # Unit tests (Vitest, excludes integration/)
pnpm test:integration # Integration tests (spawns temp Prisma dev DB)
pnpm test:e2e         # Playwright E2E tests (spawns dev server + temp DB)
```

The integration and E2E test scripts (`script/run-integration-tests.sh`, `script/run-e2e-web.sh`) use `pnpm exec prisma dev` to spin up a temporary local PostgreSQL database, push the schema, and run tests against it.

### Lint / Build
```bash
pnpm lint
pnpm build            # Uses --webpack flag
```

## Important Implementation Notes

- **Path alias `@/` maps to the project root** (configured in `tsconfig.json` and `vitest.config.ts`).
- **API error handling**: Throw `ApiError` from `lib/api/responses.ts` in domain functions; catch and return `jsonError()` in Route Handlers.
- **Recalc worker status**: The worker exists but is a scaffold. It is not a production-grade job queue.
- **Chart rendering**: Current charts are lightweight CSS-based. A future migration to ECharts is expected but not yet started.
- **Page state handling**: Pages should handle `loading`, `empty`, and `error` states explicitly. Data is always read from the database, never treated as final from local React state.
- **No demo user**: The app requires real authentication. Do not fall back to hardcoded demo users.
