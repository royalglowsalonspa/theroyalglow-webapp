<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CMS development instructions

Applies to `apps/cms/**`, together with the [repository instructions](../../AGENTS.md).
Read the [CMS README](README.md) for architecture and operations. Check current
implementation before relying on historical comments or plans.

## Start with the owning files

| Change | Read first |
| --- | --- |
| Collections, plugins, storage, email | `src/payload.config.ts`, relevant `src/collections/` file |
| Access or authentication | `src/access/published.ts`, `src/collections/Users.ts` |
| Bookable catalogue | `Service.ts`, `ServiceCategory.ts`, `src/hooks/`, `src/lib/sync-db.ts` |
| Public content rendering | Matching collection and `../web/src/lib/cms/` consumer |
| Database structure | `src/migrations/index.ts`, owning collection, root migration guidance |
| Admin routes and components | `src/app/(payload)/`, `next.config.ts`, installed Next.js docs |
| Deployment | `infra/render/render.yaml`, `.github/workflows/cms-migrate.yml`, package scripts |

This app owns Payload content management and Payload admin authentication. Web
and staff portal authentication use Better Auth in their own apps. Do not merge
their user tables, cookies, or access assumptions into this CMS.

## Commands

Run these from the **repository root**, unless a row specifies otherwise.

| Task | Command |
| --- | --- |
| Local CMS on port 3002 | `bun run --filter=@rgss/cms dev` |
| Type checking | `bun run --filter=@rgss/cms typecheck` |
| Isolated CMS tests | `bunx vitest run --project cms` |
| Focused hook tests | `bunx vitest run --project cms apps/cms/src/hooks/__tests__/sync-service.test.ts` |
| Repository lint / dependency audit | `bun run lint` / `bun audit` |
| CMS production build | `bun run --filter=@rgss/cms build` |
| Generate collection types | `bun run --filter=@rgss/cms generate:types` |
| Generate admin import map | From `apps/cms`: `bunx payload generate:importmap` |
| Create a migration | From `apps/cms`: `bun run migrate:create <name>` |
| Apply committed migrations | `bun run --filter=@rgss/cms migrate` (writes to the configured database) |
| Discover browser tests | `bun run --filter=@rgss/cms test:e2e:list` |

- Keep `dev` on `--webpack`; it is intentional for the maintainer's Windows
  environment. `dev:turbo` is an explicit alternative, not a replacement default.
- Keep `payload` and all six direct `@payloadcms/*` dependencies on the same exact
  version. Inspect lockfile compatibility and the shared Drizzle version on upgrades.
- Generated `src/payload-types.ts` and `src/app/(payload)/admin/importMap.js`
  come from Payload. Regenerate after relevant collection/plugin/component changes.
- Do not edit the generated Next.js block above or hand-maintain generated output.

## Data and synchronization invariants

- Payload owns the `cms` PostgreSQL schema. Drizzle owns the app's `public`
  schema. Both schemas share one physical database for catalogue transactions.
- Keep `schemaName: 'cms'` and `push: false`. Use forward Payload migrations for
  CMS changes; do not use Drizzle migrations to remodel Payload-owned tables.
- `service` and `service_category` are operational records mirrored into the
  booking catalogue. `service-card` and CMS `offer` are marketing content.
- Preserve custom text IDs, category relationships, integer `pricePaise`, allowed
  durations, gems validation, and `isActive` retirement behavior. Service/category
  deletion remains denied because booking history refers to them.
- Synchronization must use `await txDb(req)` in `src/lib/sync-db.ts`. Do not use
  the shared HTTP database client or the adapter's base pool in an active request;
  these would bypass the Payload transaction.
- Keep the sync hook ahead of cache revalidation. Re-throw sync failures so the
  CMS transaction can roll back. Preserve idempotent create/upsert behavior and
  timestamp handling; test missing/malformed relationships and failure paths.
- Only `SERVICE_SYNC_ENABLED=false` disables synchronization. Unset means enabled.
  Disabling sync permits CMS/public divergence; do not toggle it to hide a failing save.
- Revalidation is a separate best-effort POST to the web app. Match collection
  cache tags with `../web/src/lib/cms/` and the web revalidation endpoint.
  A successful CMS save alone does not prove the website cache refreshed.

## Access, secrets, and external services

- Preserve the blog's anonymous `status: published` filter. Other public content
  collections use unrestricted reads; active/scheduling fields are not automatically
  authorization controls.
- `adminsWrite` currently checks `Boolean(req.user)`; its name does not imply
  a role hierarchy. Review actual identity and collection access on auth changes.
- Keep `Users.access.unlock: () => false` and its regression tests. A dependency
  upgrade is not permission to restore Payload's permissive unlock default.
- Payload MCP at `/api/mcp` exposes selected `find` capabilities only. Keep
  `users` excluded and create/update/delete capabilities disabled. Capabilities
  also require per-key enablement; do not broaden either layer incidentally.
- Keep the four-variable R2 guard, `cms/` storage prefix, image MIME allowlist,
  generated image sizes, and required alt text. Missing R2 configuration uses
  local files; those files are not durable storage on Render.
- Resend is enabled only with `RESEND_API_KEY`. Use a verified sender domain and
  avoid triggering real password-reset/invite mail during routine verification.
- Use `.env.example` for names, with local values in ignored `.env.local`.
  Never log database credentials, Payload secrets, MCP keys, or admin personal data.

## Migration and deployment discipline

1. Generate with the app's `migrate:create` wrapper; it corrects runtime/type imports.
2. Review SQL, generated snapshots, and migration index together. The wrapper
   scans migration files, so inspect its entire diff and preserve applied history.
3. Commit the reviewed migration before applying it to shared environments.
4. Use a direct, unpooled connection in **`DATABASE_URL`**; this adapter does not
   read `DATABASE_URL_UNPOOLED`. Verify the environment before any DDL.
5. Use the CMS migration workflow for managed environment rollout and inspect its
   preflight/ledger evidence. Historical catalogue recreation requires its data-loss preflight.

Render's configured CMS start command runs `migrate` before `start:prod`; the
free-plan Blueprint does not enable `preDeployCommand`. A failed migration must
prevent startup. Its `/admin` health check is liveness, not a catalogue-sync test.
The legacy CMS Dockerfile is not the current deployment recipe; see README gaps.

## Verification and handoff

- Root Vitest's `cms` project excludes live integration suites by default. Use
  focused unit/property tests for mappings, IDs, flag gating, access, and hook behavior.
- `sync-atomicity.test.ts` and `scripts/__tests__/seed-services.test.ts` boot real
  Payload/PostgreSQL. Run via the integration config only against a verified
  disposable database with the required public and CMS migrations applied.
- CMS Playwright uses `apps/cms/playwright.config.ts`, one worker, `.env.local`,
  and optionally `PLAYWRIGHT_CMS_BASE_URL`. It writes through the admin UI and
  checks real catalogue rows. Root web E2E does not collect this suite.
- Seeds and MCP key scripts mutate data or credentials. They are operational
  tools, not smoke tests; inspect their scope before running them.
- Documentation changes need path, command, and consistency checks. Code changes
  need the relevant CMS checks; report live suites not run and builds not completed.
- Summarize collection/API changes, cross-app effects, migration artifacts,
  validation performed, and operational limitations in the handoff.
