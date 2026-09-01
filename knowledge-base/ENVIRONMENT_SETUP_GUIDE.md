# Environment Setup Guide

This guide explains where configuration belongs. It never records whether a developer currently has
a secret set and never includes secret values.

Authoritative contracts:

- `apps/web/src/env.ts`
- `apps/admin/src/env.ts`
- `apps/cms/src/payload.config.ts`
- `apps/invoicing/src/env.ts`
- `sst.config.ts`
- `.github/workflows/*.yml`
- [environment-variables.md](./environment-variables.md) for ownership notes

## 1. Hosting and configuration ownership

| Application | Runtime | Configuration owner |
|-------------|---------|---------------------|
| `apps/web` | AWS Lambda + CloudFront through SST | SST Secrets, `sst.config.ts`, GitHub Actions variables |
| `apps/admin` | AWS Lambda + CloudFront through SST | SST Secrets, `sst.config.ts`, GitHub Actions variables |
| `apps/cms` | Render | Render service environment |
| `apps/invoicing` | Google Cloud Run | Cloud Run variables and secret bindings |
| `docs` | Mintlify | Mintlify project configuration |

Cloudflare runs no application compute. It remains authoritative DNS and R2 object storage.

## 2. Local environment files

Local files are plaintext secrets and are ignored by Git:

| File | Used by |
|------|---------|
| `apps/web/.env.local` | Customer web app |
| `apps/admin/.env.local` | Admin portal |
| `apps/cms/.env.local` | Payload CMS |
| `apps/invoicing/.env.local` | Invoice renderer when run locally |
| `packages/db/.env` | Drizzle migration tooling |

Committed starting templates:

- `.env.example` — shared starting point; not a substitute for app validators
- `apps/admin/.env.example` — admin starting point
- `apps/cms/.env.example` — CMS starting point

There is no standalone committed web or invoicing template. Reconcile local files against their
validator before running a validated build.

## 3. Required shared contracts

### Web and admin

Both apps require the same environment-specific values for:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET` — minimum 32 characters and byte-identical across web/admin
- Google OAuth client ID and secret
- Ably private key
- Upstash Redis URL/token for distributed rate limiting
- QStash token and current/next signing keys

Each app has its own `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL`:

| App | Production origin |
|-----|-------------------|
| web | `https://theroyalglow.in` |
| admin | `https://admin.theroyalglow.in` |

`NEXT_PUBLIC_*` values are compiled into browser bundles. They must be supplied during `next build`;
putting them only in SST Secrets cannot update client code.

### CMS

Payload reads configuration directly from `process.env`. Production needs:

- `DATABASE_URL`
- `PAYLOAD_SECRET`
- `PAYLOAD_PUBLIC_SERVER_URL=https://cms.theroyalglow.in`
- `WEB_APP_URL=https://theroyalglow.in`

R2 storage enables only when `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, and
`R2_SECRET_ACCESS_KEY` are all present. Otherwise local development uses disk storage.

`REVALIDATE_SECRET` must match the web value when CMS-triggered revalidation is enabled.

### Invoicing

The Cloud Run service validates at startup:

- `INVOICE_PDF_HMAC_SECRET`
- `R2_BUCKET_NAME`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BASE_URL`

`SENTRY_DSN` is optional. Cloud Run supplies `PORT`; local default is `8080`.

Web/admin callers use `INVOICING_SERVICE_URL` plus the same `INVOICE_PDF_HMAC_SECRET`. When either
caller value is absent, invoice email degrades to no PDF attachment.

## 4. AWS production configuration

Set server secrets with SST under the production stage:

```powershell
bunx sst secret set DatabaseUrl "<value>" --stage production
bunx sst secret set BetterAuthSecret "<value>" --stage production
bunx sst secret set GoogleOauthClientId "<value>" --stage production
bunx sst secret set GoogleOauthClientSecret "<value>" --stage production
bunx sst secret set AblyPrivateKey "<value>" --stage production
bunx sst secret set UpstashRedisRestUrl "<value>" --stage production
bunx sst secret set UpstashRedisRestToken "<value>" --stage production
bunx sst secret set QstashToken "<value>" --stage production
bunx sst secret set QstashCurrentSigningKey "<value>" --stage production
bunx sst secret set QstashNextSigningKey "<value>" --stage production
bunx sst secret set ResendApiKey "<value>" --stage production
bunx sst secret set VapidPrivateKey "<value>" --stage production
bunx sst secret set InvoicePdfHmacSecret "<value>" --stage production
bunx sst secret set InternalJobToken "<value>" --stage production
bunx sst secret set R2AccessKeyId "<value>" --stage production
bunx sst secret set R2SecretAccessKey "<value>" --stage production
```

Use GitHub Actions variables for public/build-time values consumed by
`.github/workflows/deploy-aws.yml`, including Google/Ably/PostHog/VAPID public keys, app/CMS/R2
public URLs, and optional Sentry/Meta/Clarity values.

Database migrations are separate from application deployment. Run committed migrations through
`.github/workflows/migrate.yml` with the direct `DATABASE_URL_UNPOOLED_<BRANCH>` secret, following
`dev → test → pprd → prod`.

## 5. Cloudflare boundary

Keep:

- `CLOUDFLARE_API_TOKEN` — GitHub Actions secret used only by SST DNS automation; scope to
  Zone:Read + DNS:Edit
- `CLOUDFLARE_DEFAULT_ACCOUNT_ID` — GitHub Actions variable selecting the DNS account
- canonical `R2_*`, `NEXT_PUBLIC_R2_PUBLIC_URL`, and `R2_PUBLIC_BASE_URL` storage settings

Do not restore:

- `CLOUDFLARE_ACCOUNT_ID` as an application/compute contract
- `CLOUDFLARE_KV_NAMESPACE_ID`
- `CF_PAGES_BRANCH`
- Worker/Pages bindings, Wrangler settings, or compute deployment credentials

DNS credentials belong only in the deployment environment. Never inject them into Lambda runtime
configuration or app-local env files.

## 6. Local setup

From repository root in PowerShell:

```powershell
Copy-Item .env.example apps/web/.env.local
Copy-Item apps/admin/.env.example apps/admin/.env.local
Copy-Item apps/cms/.env.example apps/cms/.env.local
New-Item -ItemType File apps/invoicing/.env.local -Force
```

Then reconcile each file with the authoritative source listed at the top and fill values from the
correct development service accounts. Generate VAPID keys once:

```powershell
bunx web-push generate-vapid-keys
```

Do not use `SKIP_ENV_VALIDATION` to conceal missing production configuration. It is a CI/build escape
hatch, not a runtime secret strategy.

## 7. Validation

Run from repository root:

```powershell
bun run typecheck
bun run lint
bun run build
```

For app-specific diagnosis:

```powershell
bun run --filter=@rgss/web typecheck
bun run --filter=@rgss/admin typecheck
bun run --filter=@rgss/invoicing typecheck
```

## 8. Secret safety

- Never commit `.env`, `.env.local`, `.dev.vars`, or platform-exported secret files.
- Keep production values separate from dev/test/pprd.
- Rotate any credential pasted into chat, logs, screenshots, tickets, or public storage.
- Keep the repository outside shared/synced folders where possible, or explicitly exclude local env
  files from sync.
- Treat R2 access keys, OAuth client secrets, QStash keys, SST Secrets, HMAC secrets, and webhook URLs
  as credentials.
