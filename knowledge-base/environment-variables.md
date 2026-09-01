# Environment Variables

## Overview

Royal Glow Salon & Spa has four application contracts: `apps/web`, `apps/admin`, `apps/cms`, and `apps/invoicing`. The web and admin apps run on AWS Lambda + CloudFront through SST, the CMS stays on Render, and invoicing stays on Google Cloud Run. Cloudflare provides authoritative DNS and R2 object storage only; Workers/Pages compute, KV bindings, Wrangler configuration, and compute-specific variables are retired.

No hand-maintained document can override the executable contracts. Authoritative sources are:

- `apps/web/src/env.ts`
- `apps/admin/src/env.ts`
- `apps/invoicing/src/env.ts`
- `apps/cms/src/payload.config.ts` and CMS storage configuration
- `sst.config.ts`
- active workflows under `.github/workflows/`
- `packages/db/drizzle.config.ts` for migration connectivity

Web and admin use `@t3-oss/env-nextjs` with Zod. Invoicing parses `process.env` with Zod at startup. Payload and some framework bootstrap files own additional configuration. Sentry bootstrap files intentionally read `process.env` directly because they initialize before typed app modules; ordinary application code should use the app's typed env helper.

---

## File Structure

```text
theroyalglow-webapp/
├── .env.example               # Shared starting template for apps/web
├── .env.local                 # Optional root-local values; gitignored
└── apps/
    ├── web/
    │   └── .env.local         # Create from root .env.example; gitignored
    ├── admin/
    │   ├── .env.example       # Admin template
    │   └── .env.local         # Gitignored
    ├── cms/
    │   ├── .env.example       # CMS template
    │   └── .env.local         # Gitignored
    └── invoicing/
        └── .env.local         # Create from apps/invoicing/src/env.ts; gitignored
```

There is no `apps/web/.env.example`. Next.js loads app-local `.env.local` files. Production platforms inject values and do not consume committed local env files.

---

## Executable Contracts

### Customer app (`apps/web`)

Required server values currently cover:

- Neon: `DATABASE_URL`
- Better Auth and Google OAuth
- Resend
- Ably
- Upstash Redis
- R2 access key, secret, and bucket
- QStash publish and signing credentials
- VAPID private key

Required browser values currently cover the customer origin, Google client ID, Ably key, PostHog key/host, and VAPID public key. Optional values include `BETTER_AUTH_API_KEY`, contact inbox, Meta CAPI/pixel values, reporting destinations, BetterStack heartbeat URLs, admin origin, and invoice-service caller settings.

`DATABASE_URL_UNPOOLED` is not part of the web validator.

### Admin app (`apps/admin`)

Required server values currently cover:

- `DATABASE_URL` and `DATABASE_URL_UNPOOLED`
- Better Auth and Google OAuth
- Ably
- Upstash Redis
- QStash publish and signing credentials

`INVOICING_SERVICE_URL` and `INVOICE_PDF_HMAC_SECRET` are optional caller settings. The job sends an invoice email without the PDF attachment when either is missing. `NEXT_PUBLIC_ADMIN_SENTRY_DSN` is optional; admin Sentry is disabled when absent.

### Invoice renderer (`apps/invoicing`)

`apps/invoicing/src/env.ts` requires:

- `INVOICE_PDF_HMAC_SECRET`
- `R2_BUCKET_NAME`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BASE_URL`

`PORT` and `NODE_ENV` have defaults. `SENTRY_DSN` is optional.

### Payload CMS (`apps/cms`)

Use `apps/cms/.env.example`, `apps/cms/src/payload.config.ts`, and CMS storage configuration together. Core ownership includes the CMS database URL, `PAYLOAD_SECRET`, R2 storage values, and `SERVICE_SYNC_ENABLED`.

`SERVICE_SYNC_ENABLED` defaults on; only the literal string `false` disables catalogue synchronization. Disable it while seeding or during a catalogue-sync rollback.

---

## Shared Contracts

### Neon

| Variable | Used by | Contract |
| --- | --- | --- |
| `DATABASE_URL` | web, admin, CMS | Application connection for the selected Neon branch. |
| `DATABASE_URL_UNPOOLED` | admin, migration workflows | Direct connection. Mandatory for migration/DDL workflows; never substitute pgBouncer. |

Use distinct values for `dev`, `test`, `pprd`, and `prod`. Migration order remains `dev → test → pprd → prod`.

### Better Auth

`BETTER_AUTH_SECRET` must be byte-identical between web and admin in the same environment so the `.theroyalglow.in` session cookie validates across both apps. Each app uses its own public origin in `BETTER_AUTH_URL`.

### Invoice PDF integration

| Variable | Web/admin callers | Cloud Run service |
| --- | --- | --- |
| `INVOICING_SERVICE_URL` | Optional destination origin | Not consumed |
| `INVOICE_PDF_HMAC_SECRET` | Optional until integration is enabled; must match service | Required request-verification secret |
| `R2_*`, `R2_PUBLIC_BASE_URL` | Not the caller contract | Required storage contract |

### Sentry

| Variable | Used by | Contract |
| --- | --- | --- |
| `NEXT_PUBLIC_SENTRY_DSN` | web Sentry config files | Optional direct bootstrap read; no DSN means no Sentry initialization. |
| `NEXT_PUBLIC_ADMIN_SENTRY_DSN` | admin validator/config | Optional. |
| `SENTRY_DSN` | invoicing | Optional. |
| `COMMIT_SHA` | web/admin Sentry bootstrap | Optional release metadata. |
| `APP_ENV` | web/admin Sentry bootstrap | Environment metadata, falling back to `NODE_ENV`. |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | CI/source-map tooling when configured | Workflow/build values, not app-runtime contracts. |

Do not recreate `apps/web/instrumentation.ts` or `apps/admin/instrumentation.ts`. The active server path uses each app's `src/lib/api/sentry-server-init.ts` plus the client/server/edge config files because a root instrumentation file breaks SST/OpenNext packaging.

---

## Cloudflare Boundary

Cloudflare remains active for authoritative DNS and R2 object storage, not application compute.

| Variable | Context | Status |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions/SST deployment secret | Keep. DNS automation only; grant Zone:Read + DNS:Edit. Never inject into app runtimes. |
| `CLOUDFLARE_DEFAULT_ACCOUNT_ID` | GitHub Actions deployment variable | Keep. Selects the account for SST's Cloudflare DNS provider. |
| `R2_ACCOUNT_ID` | Backup/deployment tooling | Keep where the R2 endpoint must be constructed. |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT` | CMS, invoicing, backups, or deployment bindings according to owner | Keep. Active object-storage integration. |
| `NEXT_PUBLIC_R2_PUBLIC_URL`, `R2_PUBLIC_BASE_URL` | Public media/invoice URL construction | Keep where the owning app requires it. |
| `CLOUDFLARE_ACCOUNT_ID` | Retired compute contract | Remove. DNS uses `CLOUDFLARE_DEFAULT_ACCOUNT_ID`; R2 tooling uses `R2_ACCOUNT_ID`. |
| `CLOUDFLARE_KV_NAMESPACE_ID`, `CF_PAGES_BRANCH` | Retired compute/KV contracts | Remove and do not restore. |

Worker/Pages adapters, Wrangler configuration, `cf:*` scripts, and KV bindings are retired. Service-catalogue and availability requests currently read Neon directly. Upstash Redis remains active for distributed rate limiting; a five-minute catalogue/availability read-through cache is planned but not implemented.

---

## Validation Behavior

- Required t3-env values fail when the owning module loads during build or runtime cold start.
- `emptyStringAsUndefined: true` lets optional web/admin values remain unset when GitHub Actions supplies an empty string.
- Invoicing refuses to start without its HMAC and R2 contract.
- Optionality is local to each owner. A value optional in a caller can still be required in the called service.
- `SKIP_ENV_VALIDATION` is a build escape hatch, not permission to deploy an invalid runtime configuration.

Do not duplicate validator source in documentation. Copied schemas drift and can misstate names, ownership, or requiredness.

---

## Platform Injection

| Platform | Where values live | Applied to |
| --- | --- | --- |
| AWS Lambda + CloudFront through SST | SST Secrets for server values; GitHub Actions variables for build-time `NEXT_PUBLIC_*` values | `apps/web`, `apps/admin` |
| Cloudflare authoritative DNS | GitHub Actions secret/variable consumed by `bunx sst deploy` | DNS records and ACM validation only |
| Render | Service environment settings | `apps/cms` |
| Google Cloud Run | Service environment and secret settings | `apps/invoicing` |
| GitHub Actions environments | Per-environment DB URLs and workflow credentials | migrations, backups, schedules, deployments |

`NEXT_PUBLIC_*` values are compiled into browser bundles. Putting them only in a runtime secret store does not change an already-built client bundle.

---

## Local Setup

```powershell
# Create local files from committed starting templates.
Copy-Item .env.example apps/web/.env.local
Copy-Item apps/admin/.env.example apps/admin/.env.local
Copy-Item apps/cms/.env.example apps/cms/.env.local

# Reconcile each file with its current executable contract, then validate.
bun run --filter=@rgss/web typecheck
bun run --filter=@rgss/admin typecheck
bun run --filter=@rgss/invoicing typecheck
```

Never copy values between environments blindly. `BETTER_AUTH_SECRET` is the deliberate exception: it must match between web and admin within one environment.

---

## Secret Safety

- Never commit `.env.local`, `.dev.vars`, tokens, access keys, or private keys.
- Preserve `.dev.vars` ignore rules even though Wrangler is retired; those patterns still protect plaintext secrets.
- Use least-privilege DNS and R2 credentials rather than one broad Cloudflare token.
- Rotate credentials immediately if they appear in logs, terminal output, screenshots, or chat context.
- Treat `NEXT_PUBLIC_*` as public data.

---

## Inventory Maintenance

Do not maintain a fixed variable count. Validators, guarded bootstrap reads, dynamic heartbeat names, SST resources, and workflow-only variables evolve independently. When a contract changes, update the executable source, relevant template, deployment wiring, and ownership documentation in the same change.
