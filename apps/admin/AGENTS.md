# Admin app agent guide

This file adds admin-specific guidance to the repository's root `AGENTS.md`.
For the contributor overview, configuration, and route map, read [README.md](README.md).

## Start with the relevant boundary

- `src/app/`: App Router pages and colocated feature components.
- `src/app/api/`: HTTP orchestration; shared queries, schemas, and business rules
  live in `@rgss/db`, `@rgss/types`, and `@rgss/business` respectively.
- `src/lib/rbac.ts`: pure role hierarchy, page access decisions, and navigation.
- `src/lib/api/session.ts`: server session and minimum-role checks for handlers.
- `src/lib/jobs/`: QStash verification, publishing, schedule definitions, heartbeats.
- `src/components/ui/` and `src/lib/admin/`: reusable presentation components and
  presentation helpers. Keep domain calculations in the shared business package.

## Routing and authorization

- Routes on the admin origin start at `/`, `/bookings`, `/me`, etc. Do not add an
  `/admin` prefix here; legacy customer-site redirects belong to `apps/web`.
- The hierarchy is `customer < staff < receptionist < manager < owner < developer`.
  Keep `src/lib/rbac.ts` and `src/lib/api/session.ts` consistent when changing roles.
  A filtered sidebar or layout alone does not authorize an API operation.
- Use `requireRole()` for privileged operations and `requireSession()` plus the
  relevant ownership checks for self-service handlers. Unknown roles fail low.
  `/me/*` is staff self-service; `/staff` is manager-level staff administration.
- Keep the RBAC decision core free of framework imports, database calls, and I/O.
  Route matching uses path-segment boundaries and the longest matching prefix.
- Middleware is edge-compatible. It verifies Better Auth's signed cookie cache,
  then falls back to same-origin `/api/auth/get-session`; do not import
  `auth-server`, the database client, or Node-only cryptography into middleware.
- Preserve recognition of both bare and `__Secure-` session cookie names.
  Preserve failure-closed authentication, the per-request CSP nonce, and noindex
  metadata/headers for this private app.
- Web and admin use the same database branch and `BETTER_AUTH_SECRET` per
  environment. Each has its own `BETTER_AUTH_URL`. Cookie-domain behavior comes
  from `buildCrossSubdomainAdvanced()` in `@rgss/business`.
- The custom Better Auth `role` field has `input: false`; clients cannot assign
  their own privileges. Review web auth configuration when changing shared auth.
- `ADMIN_DEV_BYPASS_AUTH=1` bypasses middleware and displays the full shell only
  outside production; it does not create an authenticated API session.
  `ADMIN_DEV_IMPERSONATE_EMAIL` uses a real database user and can perform real
  writes. Preserve both production guards and use the intended development DB.

## API and data contracts

- Follow neighboring handlers: shared Zod input validation, `withErrorHandler`,
  `apiSuccess`/response helpers, typed `AppError`, and appropriate role checks.
  Preserve the `{ success, data, meta? }` and structured error envelopes.
- `requireSession()` applies the per-user Upstash limit. Preserve the 429
  `Retry-After` header. Its explicit outage behavior is fail-open; authentication
  and authorization remain separate checks.
- Record successful admin mutations through `src/lib/api/audit.ts` where the
  existing feature records an audit trail. Audit failure is best-effort.
  Client IP is intentionally null: forwarded headers are not trusted identity
  under the current CloudFront/Lambda topology.
- Payload CMS owns service and category authoring. Admin catalogue reads remain;
  retired writes return 410 and `/services` redirects to CMS. Do not reintroduce
  writes to those catalogue tables from the admin UI or API.
- Preserve integer-paise amounts and shared pricing/GST calculations. Use
  `src/lib/admin/format.ts` for INR and IST display, rather than browser-local
  time or ad hoc divisions and date parsing in components.

## Jobs and external services

- `/api/jobs/*` is excluded from session middleware because QStash has no browser
  session. Every job must read the raw body once and verify it with
  `verifyQStashSignature()` before executing work or parsing trusted input.
- Signing keys take precedence; the verifier supports an internal-token fallback
  when keys are absent and a non-production fallback when neither is configured.
  Production without signing keys or an internal token rejects requests.
- Preserve each job's deduplication/idempotency behavior for QStash retries.
  `enqueueJob()` and heartbeat delivery are best-effort and must not turn a
  successful core mutation into an upstream-provider failure.
- Recurring schedule definitions belong in `src/lib/jobs/schedules.ts`; cron
  expressions are UTC. Registration replaces schedules with matching destination
  URLs and requires a reachable admin origin. Preview with `--dry` when reviewing
  schedule changes; registration changes the remote QStash configuration.
- Invoice orchestration calls `apps/invoicing` for PDF rendering. Preserve its
  signed request contract and documented no-attachment fallback.
- `service-drift-reconcile` detects and reports CMS/public divergence; it does not
  repair catalogue data. Do not turn a monitoring job into an implicit migration.
- Ably browser tokens are admin-scoped and subscribe-only. Keep publishing on the
  server and preserve the existing graceful-degradation behavior.

## UI, configuration, and deployment

- Reuse `src/components/ui/` primitives and `src/components/layout/` shell.
  Brand tokens live in `packages/ui/src/styles/theme.css`; admin's
  `src/styles/shadcn-theme.css` maps semantic roles onto those tokens.
  Avoid local copies of brand colors, fonts, radii, and shadows.
- The admin is currently light-only. Keep keyboard interaction, accessible
  names, focus management, reduced motion, and loading/empty/error states when
  extending the UI.
- `src/env.ts` and `.env.example` define the typed configuration surface. Some
  server integrations deliberately read guarded `process.env` values to degrade
  without credentials; preserve this distinction instead of eagerly importing
  required environment validation into those helpers.
- `SKIP_ENV_VALIDATION` uses `!!process.env.SKIP_ENV_VALIDATION`: any nonempty
  value, including `"false"`, skips validation. Unset it to exercise validation.
- Sentry uses a separate admin DSN. Server initialization comes through
  `src/lib/api/sentry-server-init.ts`; inspect its OpenNext rationale before
  adding a root instrumentation hook or moving initialization.
- SST in root `sst.config.ts` deploys this app to AWS. Old Cloudflare/Render
  deployment references are historical for admin; CMS and invoicing have their
  own deployment boundaries.

## Focused commands

Run these from the **repository root**, choosing checks relevant to the change:

```sh
bun run --filter @rgss/admin dev
bun run --filter @rgss/admin typecheck
bun run --filter @rgss/admin lint
bunx vitest run --project admin
bun run --filter @rgss/admin check:tokens
bun run check:admin-no-literals
bun run check:admin-root-path
bun run --filter @rgss/admin build
```

Keep `dev`'s explicit `--webpack` flag: it supports the maintainer's Windows
environment. `dev:turbo` is the opt-in alternative. Unit tests use root Vitest
configuration; there is no admin package `test` script. Narrow Vitest by file
when only one behavior changes. Live integration suites are a separate opt-in.

For browser checks, see README setup for the explicit admin/web origins and role
state files. Missing role fixtures skip RBAC specs and do not prove access works.
The existing `check:admin-path-allowlist` gate rejects semantic API/RBAC/schema
changes mixed with presentation changes; inspect its actual diff when it fails.
