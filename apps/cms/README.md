# Royal Glow CMS

`@rgss/cms` provides the Payload content editor, public content APIs, and
bookable service catalogue authoring for Royal Glow Salon & Spa. The configured
production origin is `https://cms.theroyalglow.in`; local development uses port
`3002`. The staff operations portal is a separate app in `apps/admin`.

For development rules, read [AGENTS.md](AGENTS.md). [CLAUDE.md](CLAUDE.md) imports
those same rules for Claude Code. The [root README](../../README.md) covers the
whole monorepo; this document explains the CMS implementation and its boundaries.

## Technology and responsibilities

The app uses Payload 3, Next.js App Router, React, TypeScript, Lexical rich text,
the Payload PostgreSQL adapter, Sharp, Cloudflare R2 through the S3 plugin, Resend,
and the Payload MCP plugin. [package.json](package.json) and the root lockfile are
the source of truth for versions; all seven Payload packages are pinned together.

Payload stores its tables in the `cms` schema. The booking application uses
Drizzle-managed tables in `public` in the same database. The CMS edits content
and catalogue definitions; customer bookings, payments, loyalty transactions,
staff operations, and invoice rendering belong to sibling apps and shared packages.

## Collection map

| Slug | Purpose and important distinction |
| --- | --- |
| `users` | Payload admin authentication; separate from customer/staff Better Auth accounts |
| `media` | Shared images, alt text, and generated responsive sizes |
| `blog` | Lexical articles, publication status, authors, tags, and SEO fields |
| `gallery` | Categorized photographs and captions |
| `team` | Public team profiles and blog authors; not staff employment records |
| `banner` | Announcement banners, links, and optional display windows |
| `faq` | Public questions and answers consumed by the website |
| `testimonial` | Customer review cards for marketing pages |
| `offer` | Promotional copy/cards; actual booking discount rules are separate |
| `service-card` | Homepage category cards and display prices; not bookable service records |
| `service_category` | Operational salon/spa taxonomy, mirrored to the booking database |
| `service` | Bookable services, paise prices, durations, buffers, and gems settings |
| `payload-mcp-api-keys` | Plugin-managed MCP credentials and per-key capabilities |

The first twelve collections are registered in
[src/payload.config.ts](src/payload.config.ts); the MCP plugin adds its key collection.
No Payload globals are configured.

## Source layout

| Path | Contents |
| --- | --- |
| `src/payload.config.ts` | Collections, database, editor, R2, Resend, CORS/CSRF, MCP |
| `src/collections/` | Collection fields, access, validation, and hook wiring |
| `src/access/published.ts` | Public/published reads and authenticated write helper |
| `src/hooks/` | Catalogue mapping/synchronization and web cache notifications |
| `src/lib/sync-db.ts` | Payload transaction resolver and sync feature flag |
| `src/app/(payload)/admin/` | Payload admin routes and generated component import map |
| `src/app/(payload)/api/[...slug]/` | Payload REST handler, including plugin endpoints |
| `src/migrations/` | Payload migration TypeScript, snapshots, and ordered index |
| `src/payload-types.ts` | Generated Payload collection types |
| `scripts/` | Migration wrapper, catalogue seed, MCP key and verification tools |
| `src/**/__tests__/` | Collection/hook unit and property tests, plus a live atomicity suite |
| `tests/` | Separate Playwright admin-to-database synchronization suite |

## Local development

1. Install the Bun version declared in the root `packageManager`, plus compatible
   Node.js tooling. Run `bun install --frozen-lockfile` from the repository root.
2. Copy [`.env.example`](.env.example) to an ignored `apps/cms/.env.local` and fill
   the values for a development database. Do not copy production credentials into
   documentation, test fixtures, or shell output.
3. Use a direct database connection. The CMS disables automatic schema push;
   apply reviewed migrations to the intended development database before opening
   an empty installation. Catalogue editing also needs the app's public schema.
4. Run `bun run --filter=@rgss/cms dev` from the root, then open
   `http://localhost:3002/admin`. For local content integration, point
   `PAYLOAD_PUBLIC_SERVER_URL` at the local CMS and `WEB_APP_URL` at the local web app.

The `dev` script deliberately uses Webpack because the maintainer's Windows
application-control policy blocks the native path required by Turbopack.
`dev:turbo` is available for environments that support it.

## Commands

Commands run from the **repository root** except where noted.

| Task | Command |
| --- | --- |
| Start CMS | `bun run --filter=@rgss/cms dev` |
| Check types | `bun run --filter=@rgss/cms typecheck` |
| Run isolated CMS tests | `bunx vitest run --project cms` |
| Lint repository | `bun run lint` |
| Audit dependencies strictly | `bun audit` |
| Build CMS | `bun run --filter=@rgss/cms build` |
| Generate Payload types | `bun run --filter=@rgss/cms generate:types` |
| Generate component import map | From `apps/cms`: `bunx payload generate:importmap` |
| Generate migration | From `apps/cms`: `bun run migrate:create <name>` |
| Apply migrations to selected database | `bun run --filter=@rgss/cms migrate` |
| List browser tests | `bun run --filter=@rgss/cms test:e2e:list` |
| Run browser tests against selected test environment | `bun run --filter=@rgss/cms test:e2e` |

`start:prod` uses `${PORT:-3002}` for the configured Render/Linux runtime. Build
output is generated under `.next`; it is not source material to edit or commit.

## Environment and integrations

| Variable(s) | Role |
| --- | --- |
| `DATABASE_URL` | Direct/unpooled PostgreSQL URL used by Payload for queries and migrations |
| `PAYLOAD_SECRET` | Stable signing/encryption secret; use a strong production secret |
| `PAYLOAD_PUBLIC_SERVER_URL` | Canonical CMS origin |
| `WEB_APP_URL` | Web origin in CORS/CSRF configuration and revalidation destination |
| `SERVICE_SYNC_ENABLED` | Defaults to enabled; only literal `false` disables catalogue mirroring |
| `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | All four must be nonempty to enable R2 media storage |
| `RESEND_API_KEY` | Enables the email adapter when nonempty |
| `RESEND_FROM_ADDRESS`, `RESEND_FROM_NAME` | Optional sender overrides; address must use a verified domain |
| `REVALIDATE_SECRET` | Shared with web to authenticate cache revalidation requests |
| `PORT`, `NODE_ENV` | Hosting runtime settings |

R2 uses region `auto`, path-style requests, and the `cms/` key prefix. Without its
full configuration, uploads fall back to local disk. This fallback is convenient
locally but is not durable storage on Render. The media collection allows JPEG,
PNG, and WebP, requires alt text, and generates 400/800/1600-pixel image variants.

Resend is optional in the config. Without an API key, real email delivery is not
configured. Sender defaults are `contact@theroyalglow.in` and `Royal Glow Salon & Spa`.
The Blueprint also lists `NEXT_PUBLIC_R2_PUBLIC_URL`, but the current CMS Payload
storage configuration does not read it; distinguish hosting declarations from
variables actually used by the app.

## Catalogue synchronization and cache refresh

`Service` and `ServiceCategory` attach `afterChange` hooks that mirror writes into
`public.service` and `public.service_category`. They reuse the shared Drizzle
table definitions and resolve the active Payload transaction via `await txDb(req)`.
For transactional requests, the CMS write and public mirror commit or roll back
together. Sync errors are rethrown rather than allowing an apparently successful save.

Create operations upsert by ID; updates target the same ID. Custom text IDs and
category relationships preserve references used by bookings. Service prices are
integer paise, not rupees. Services and categories are retired through `isActive`;
their access configuration rejects deletion.

Only `SERVICE_SYNC_ENABLED=false` stops the mirroring. It is an operational
control used by migration/seed procedures, and it permits the two schemas to
diverge while disabled. The seed script copies existing public catalogue rows
into Payload, validates them, and processes categories before services. Review
[the migration runbook](../../knowledge-base/service-catalogue-migration.md)
before using it; seeding is not part of ordinary app startup.

Content hooks separately POST `{ secret, tag }` to `WEB_APP_URL/api/revalidate`.
The hook skips the request if the origin or secret is absent and does not fail a
CMS save on a network error. Cache tags must match the web CMS client. The current
implementation does not inspect non-2xx responses, so a completed save is not
evidence that cache invalidation succeeded.

## Authentication, access, and MCP

Payload's `users` collection authenticates CMS editors. The `adminsWrite` helper
checks whether `req.user` exists; it does not implement the staff portal's role
model. Anonymous blog reads are restricted to `status: published`. Other public
content collections use public reads, so their `active` and scheduling fields
must be interpreted by consumers rather than assumed to hide data at the API layer.

`Users.access.unlock` explicitly returns `false`, retaining the project's account
lockout protection. The dependency audit remains strict; a Payload upgrade must
not silently change this application access policy.

The configured Payload MCP endpoint is `/api/mcp`. Selected content collections
expose **find only**; the authentication `users` collection is excluded. Each API
key must also enable the permitted capabilities. Neither collection writes nor
new capabilities should be enabled as a routine integration change.

`scripts/create-mcp-api-key.ts` creates or updates credentials, and
`scripts/verify-mcp.ps1` checks the MCP surface. Inspect their inputs and secret
handling before running them. This app's Payload MCP endpoint is distinct from
the developer Neon MCP configured elsewhere in the repository.

## Migrations and deployment

Payload owns `src/migrations/` and tracks applied migrations in
`cms.payload_migrations`. Follow **generate → review → commit → migrate**. The
`migrate:create` wrapper fixes generated migration type imports for the ESM
runtime; review snapshots, SQL, and `index.ts` together. Do not edit applied history
or enable automatic schema push to bypass a migration problem.

The [CMS migration workflow](../../.github/workflows/cms-migrate.yml) selects the
environment's direct database URL, runs forward migrations, and records ledger
and schema checks. It includes a preflight for the historical service-table
replacement. A database containing legacy rows needs the documented preservation
decision; a newer package version alone does not make that operation safe.

The current deployment recipe is the root [Render Blueprint](../../render.yaml):

- Service `rgss-cms`, Node runtime, Singapore, free plan, source branch `prod`.
- Build: `bun install --frozen-lockfile && bun run --filter=@rgss/cms build`.
- Start: `cd apps/cms && bun run migrate && bun run start:prod`.
- Health check: `/admin`; secret values are supplied through Render configuration.

The free-plan Blueprint runs migration at startup, not in a pre-deploy hook.
`DATABASE_URL` must therefore be direct/unpooled for that process. A migration
failure prevents startup. The `/admin` check demonstrates route liveness, not
successful R2 uploads, email delivery, or catalogue synchronization. Source
configuration alone does not prove the current live deployment matches it.

## Verification and known gaps

Root Vitest's `cms` project covers mappings, schema fields, generated IDs,
idempotency, timestamps, feature-flag gating, and account-unlock access. Its
default configuration excludes the live atomicity and seed suites.

Those live suites use real Payload/PostgreSQL and are collected through the root
integration configuration. CMS Playwright is separate from root web Playwright;
it loads `.env.local`, uses one worker, and starts a local CMS unless
`PLAYWRIGHT_CMS_BASE_URL` is set. It writes catalogue data and validates public
rows. Use intentionally selected disposable infrastructure for both kinds of test.

Current source discrepancies to account for during operational work:

- Render pins Bun `1.3.13`, while the root manifest specifies `1.4.0`; validate
  and align these as a deployment change rather than assuming they already match.
- [Dockerfile](Dockerfile) is a legacy Koyeb recipe, not a verified alternative:
  it refers to `bun.lockb`, copies an outdated Payload config path, and continues
  after a migration failure. Do not use it as the current production procedure.
- Media comments describe a 10 MB upload cap, but the collection's executable
  upload config does not establish that cap. Verify enforcement before claiming it.

Further references: [repository testing](../../knowledge-base/testing.md),
[migration discipline](../../.kiro/steering/migration-discipline.md),
[deployment](../../knowledge-base/deployment.md), and
[branch promotion](../../knowledge-base/branch-promotions.md).
