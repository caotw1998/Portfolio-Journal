# Contributing

Portfolio Journal is maintained as a public source project for private, single-owner deployments. Do not include real research data, database exports, private deployment URLs, email addresses, credentials, access tokens or Tailscale configuration in issues, pull requests or test fixtures.

## Development workflow

1. Create a focused branch from `main`.
2. Keep secrets in ignored environment files and use synthetic values in tests.
3. Add or update tests for behavior changes.
4. Run the local verification commands before opening a pull request.

```bash
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm test
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm audit --prod --audit-level high
pnpm release:check
```

Integration and E2E tests require a disposable PostgreSQL database whose name ends in `_integration`, `_e2e` or `_test`. See `tests/README.md` for the commands.

## Security and releases

- Report vulnerabilities through GitHub private vulnerability reporting as described in `SECURITY.md`.
- Keep GitHub Actions and Docker image references pinned; Dependabot should update both the version comment/tag and immutable revision.
- Build public releases only from a clean tree after `pnpm release:check -- --history` and an external secret scan pass.
- Back up a private deployment before upgrading and run `pnpm deploy:verify` after the containers restart.
