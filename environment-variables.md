# Environment Variables

## Overview

Royal Glow Salon & Spa runs a monorepo with two Next.js apps (`apps/web`, `apps/cms`), deployed across two platforms (Cloudflare Pages + Render), and relies on ~15 external services. Environment variables are:

- **Validated at build time** using `@t3-oss/env-nextjs` + Zod — build fails if a required var is missing or malformed
- **Never committed** to Git — `.env.local` is gitignored
- **Injected at deploy time** via GitHub Secrets + platform environment variable settings
- **Split by app** — `apps/web` and `apps/cms` each have their own `.env.example`

---

## File Structure

```
rgss_solutions/
├── .env.example               # Root template — lists all vars with descriptions (committed)
├── .env.local                 # Local dev secrets — NEVER commit
├── .env.development           # Shared dev non-secret defaults (can commit)
├── .env.pprd                  # Pre-prod defaults for CI/deploy scripts (custom name, not auto-loaded by Next.js)
├── .env.production            # Production non-secret defaults (can commit — no actual secrets)
└── apps/
    ├── web/
    │   ├── .env.example       # web-specific required vars (committed)
    │   └── .env.local         # Local overrides for apps/web (gitignored)
    └── cms/
        ├── .env.example       # cms-specific required vars (committed)
        └── .env.local         # Local overrides for apps/cms (gitignored)
```

**Next.js native load order:** `.env.local` → `.env.[NODE_ENV]` → `.env`

Custom files like `.env.pprd` are **not** auto-loaded by Next.js. Use them only if a CI/deploy script explicitly loads them, or inject the values through your hosting platform.

---

## Complete Variable Reference

### Database (Neon)

| Variable | Used by | Visibility | Description |
|----------|---------|------------|-------------|
| `DATABASE_URL` | web, cms | Private | Pooled connection via Neon pgBouncer — used by all app queries |
| `DATABASE_URL_UNPOOLED` | web | Private | Direct (non-pooled) connection — recommended for migrations and admin tasks that need a direct connection |

> **Per-environment branches:** Neon provides 4 branches (`main`, `preprod`, `test`, `dev`). Use GitHub Environments so `DATABASE_URL` points to the correct branch per environment — same variable name, different values.

---

### Auth — Better Auth

| Variable | Used by | Visibility | Description |
|----------|---------|------------|-------------|
| `BETTER_AUTH_SECRET` | web | Private | Random string min 32 chars — signs sessions and tokens. Rotate if compromised. |
| `BETTER_AUTH_URL` | web | Private | Public app origin used by Better Auth callbacks: `https://theroyalglow.in` |
| `GOOGLE_OAUTH_CLIENT_ID` | web | Private | Google OAuth 2.0 client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | web | Private | Google OAuth 2.0 client secret |

---

### Email — Transactional (Resend)

| Variable | Used by | Visibility | Description |
|----------|---------|------------|-------------|
| `RESEND_API_KEY` | web | Private | Starts with `re_` — used for all transactional emails (invoices, booking confirmations) |

---

### PDF Invoice Service (Render)

| Variable | Used by | Visibility | Description |
|----------|---------|------------|-------------|
| `PDF_API_URL` | web | Private | Internal URL of the Render PDF service — `https://rgss-pdf-api.onrender.com` |

---

### Email — Marketing (Brevo)

| Variable | Used by | Visibility | Description |
|----------|---------|------------|-------------|
| `BREVO_API_KEY` | web | Private | Used for bulk/marketing email sends (offers, birthday, re-engagement) |

---

### Realtime — Ably

| Variable | Used by | Visibility | Description |
|----------|---------|------------|-------------|
| `NEXT_PUBLIC_ABLY_KEY` | web | **Public** | Publishable key — sent to browser for client-side subscriptions |
| `ABLY_PRIVATE_KEY` | web | Private | Server-only key — used in API routes for publishing events |

---

### File Storage — Cloudflare R2

| Variable | Used by | Visibility | Description |
|----------|---------|------------|-------------|
| `R2_ACCOUNT_ID` | web, cms | Private | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | web, cms | Private | R2 S3-compatible access key |
| `R2_SECRET_ACCESS_KEY` | web, cms | Private | R2 S3-compatible secret key |
| `R2_BUCKET_NAME` | web, cms | Private | Bucket name: `theroyalglow-uploads` |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | web | **Public** | Public CDN URL for serving uploaded files: `https://uploads.theroyalglow.in` |

---

### Cache — Upstash Redis

| Variable | Used by | Visibility | Description |
|----------|---------|------------|-------------|
| `UPSTASH_REDIS_REST_URL` | web | Private | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | web | Private | Upstash Redis auth token |

---

### Queue — Upstash QStash

| Variable | Used by | Visibility | Description |
|----------|---------|------------|-------------|
| `QSTASH_TOKEN` | web | Private | Publishing token — used to enqueue jobs (send to QStash) |
| `QSTASH_CURRENT_SIGNING_KEY` | web | Private | Verifies incoming QStash callbacks — current key |
| `QSTASH_NEXT_SIGNING_KEY` | web | Private | Verifies incoming QStash callbacks — rotated key |

> `QSTASH_TOKEN` is for publishing. `QSTASH_CURRENT_SIGNING_KEY` + `QSTASH_NEXT_SIGNING_KEY` are for receiving and verifying callbacks via `@upstash/qstash` `Receiver`. All three are required.

---

### Web Push — VAPID Keys

| Variable | Used by | Visibility | Description |
|----------|---------|------------|-------------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | web | **Public** | VAPID public key — sent to browser to create push subscription |
| `VAPID_PRIVATE_KEY` | web | Private | VAPID private key — used server-side to send push notifications |

**Generate once:**
```bash
bunx web-push generate-vapid-keys
```

Store the output. These never change unless you intentionally rotate (which invalidates all existing push subscriptions).

---

### Cloudflare — KV + CI/CD

| Variable | Used by | Visibility | Description |
|----------|---------|------------|-------------|
| `CLOUDFLARE_ACCOUNT_ID` | CI/CD, web | Private | Required for `wrangler deploy` and KV REST API writes from Render |
| `CLOUDFLARE_API_TOKEN` | CI/CD, web | Private | Token with Pages + Workers + KV permissions — used by GitHub Actions and any server-side KV REST writes |
| `CLOUDFLARE_KV_NAMESPACE_ID` | web | Private | KV namespace ID for edge-cached service listings and static data |

> In Cloudflare Workers, KV is accessed as a binding (`env.KV`) configured in `wrangler.toml`. For writes originating from Render (origin server), the REST API uses `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`.

---

### Observability — Sentry

| Variable | Used by | Visibility | Description |
|----------|---------|------------|-------------|
| `NEXT_PUBLIC_SENTRY_DSN` | web, cms | **Public** | Sentry DSN — browser-side error capture |
| `SENTRY_AUTH_TOKEN` | CI/CD | Private | Used by `@sentry/nextjs` during build to upload source maps |
| `SENTRY_ORG` | CI/CD | Private | Your Sentry organisation slug |
| `SENTRY_PROJECT` | CI/CD | Private | Your Sentry project slug: `rgss` |

---

### Observability — BetterStack

| Variable | Used by | Visibility | Description |
|----------|---------|------------|-------------|
| `BETTER_STACK_TOKEN` | web | Private | Log drain source token — server logs streamed to BetterStack |
| `BETTER_STACK_HEARTBEAT_NIGHTLY_SALES` | web | Private | Shared heartbeat for DB-only sales/GST/offer/gems summary jobs |
| `BETTER_STACK_HEARTBEAT_PREPROD_SYNC` | CI/CD | Private | GitHub Actions cron: preprod DB sync (`30 19 * * *` UTC) |
| `BETTER_STACK_HEARTBEAT_REMINDERS` | web | Private | QStash: appointment reminder scheduler (every 15 min) |
| `BETTER_STACK_HEARTBEAT_MEMBERSHIP_EXPIRY` | web | Private | pg_cron + QStash: membership auto-expire + expiry alerts (`30 18 * * *` UTC) |
| `BETTER_STACK_HEARTBEAT_SESSION_CLEANUP` | web | Private | pg_cron: session cleanup (`0 21 * * 0` UTC) |
| `BETTER_STACK_HEARTBEAT_BACKUP` | CI/CD | Private | GitHub Actions cron: weekly R2 backup verification |
| `BETTER_STACK_DEPLOY_WEBHOOK` | CI/CD | Private | Deployment marker webhook called by GitHub Actions after prod deploy |
| `BETTER_STACK_INCIDENT_WEBHOOK` | CI/CD | Private | Incident webhook called by GitHub Actions on deploy/backup failure |

---

### Analytics — PostHog & Clarity

| Variable | Used by | Visibility | Description |
|----------|---------|------------|-------------|
| `NEXT_PUBLIC_POSTHOG_KEY` | web | **Public** | PostHog project API key: `phc_xxx` |
| `NEXT_PUBLIC_POSTHOG_HOST` | web | **Public** | PostHog ingestion host: `https://us.i.posthog.com` |
| `NEXT_PUBLIC_CLARITY_ID` | web | **Public** | Microsoft Clarity project ID |

---

### Ads & Tracking — Meta

| Variable | Used by | Visibility | Description |
|----------|---------|------------|-------------|
| `NEXT_PUBLIC_META_PIXEL_ID` | web | **Public** | Meta Pixel ID — browser-side PageView, ViewContent events |
| `META_PIXEL_ACCESS_TOKEN` | web | Private | Conversions API (CAPI) access token — server-side Purchase events |
| `META_CAPI_WEBHOOK_TOKEN` | web | Private | Verifies incoming Meta webhook payloads |
| `META_TEST_EVENT_CODE` | web | Private, **dev/pprd only** | Test event code from Meta Events Manager → Test Events tab. Set in dev and preprod only. Omit in production. Routes CAPI events to the test panel without polluting real data. |

---

### Reporting — Slack & Email

| Variable | Used by | Visibility | Description |
|----------|---------|------------|-------------|
| `SLACK_WEBHOOK_URL` | web | Private | Slack incoming webhook URL — daily and weekly sales reports posted to owner/manager channel |
| `DAILY_REPORT_EMAIL_RECIPIENTS` | web | Private | Comma-separated emails for daily + weekly reports: `owner@theroyalglow.in,manager@theroyalglow.in` |

---

### CRM & Leads — AiSensy

| Variable | Used by | Visibility | Description |
|----------|---------|------------|-------------|
| `AISENSY_API_KEY` | web | Private | AiSensy API key for WhatsApp integration |
| `AISENSY_WEBHOOK_SECRET` | web | Private | Verifies incoming AiSensy webhook payloads |

---

### CMS — Payload (apps/cms only)

| Variable | Used by | Visibility | Description |
|----------|---------|------------|-------------|
| `PAYLOAD_SECRET` | cms | Private | Random secret used by Payload to encrypt tokens and cookies |

---

### App Configuration

| Variable | Used by | Visibility | Dev value | Prod value |
|----------|---------|------------|-----------|------------|
| `NODE_ENV` | web, cms | — | `development` | `production` |
| `APP_ENV` | web | Private | `dev` | `prod` |
| `NEXT_PUBLIC_APP_URL` | web | **Public** | `http://localhost:3000` | `https://theroyalglow.in` |
| `NEXT_PUBLIC_CMS_URL` | web | **Public** | `http://localhost:3001` | `https://admin.theroyalglow.in` |

> **`NODE_ENV` vs `APP_ENV`:** `NODE_ENV` is always `development` or `production` (Next.js convention). `APP_ENV` distinguishes between our 4 deployment environments: `dev`, `test`, `pprd`, `prod`. Use `APP_ENV` for environment-specific logic like data seeding guards.

---

## Monorepo Split

Each app only receives the variables it needs:

| Variable category | apps/web | apps/cms |
|------------------|:--------:|:--------:|
| Database | ✅ | ✅ |
| Better Auth | ✅ | ❌ |
| Resend | ✅ | ❌ |
| PDF Invoice Service | ✅ | ❌ |
| Brevo | ✅ | ❌ |
| Ably | ✅ | ❌ |
| Cloudflare R2 | ✅ | ✅ |
| Upstash Redis | ✅ | ❌ |
| QStash | ✅ | ❌ |
| VAPID keys | ✅ | ❌ |
| Cloudflare KV | ✅ | ❌ |
| Sentry | ✅ | ✅ |
| BetterStack | ✅ | ❌ |
| PostHog + Clarity | ✅ | ❌ |
| Meta Pixel + CAPI | ✅ | ❌ |
| Reporting | ✅ | ❌ |
| AiSensy | ✅ | ❌ |
| Payload Secret | ❌ | ✅ |

---

## Validation — @t3-oss/env-nextjs

```typescript
// apps/web/src/env.ts
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    DATABASE_URL_UNPOOLED: z.string().url(),
    APP_ENV: z.enum(['dev', 'test', 'pprd', 'prod']),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    GOOGLE_OAUTH_CLIENT_ID: z.string(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string(),
    RESEND_API_KEY: z.string().startsWith('re_'),
    PDF_API_URL: z.string().url(),
    BREVO_API_KEY: z.string(),
    ABLY_PRIVATE_KEY: z.string(),
    R2_ACCOUNT_ID: z.string(),
    R2_ACCESS_KEY_ID: z.string(),
    R2_SECRET_ACCESS_KEY: z.string(),
    R2_BUCKET_NAME: z.string(),
    UPSTASH_REDIS_REST_URL: z.string().url(),
    UPSTASH_REDIS_REST_TOKEN: z.string(),
    QSTASH_TOKEN: z.string(),
    QSTASH_CURRENT_SIGNING_KEY: z.string(),
    QSTASH_NEXT_SIGNING_KEY: z.string(),
    VAPID_PRIVATE_KEY: z.string(),
    CLOUDFLARE_ACCOUNT_ID: z.string(),
    CLOUDFLARE_API_TOKEN: z.string(),
    CLOUDFLARE_KV_NAMESPACE_ID: z.string(),
    BETTER_STACK_TOKEN: z.string(),
    BETTER_STACK_HEARTBEAT_NIGHTLY_SALES: z.string().url(),
    BETTER_STACK_HEARTBEAT_REMINDERS: z.string().url(),
    BETTER_STACK_HEARTBEAT_MEMBERSHIP_EXPIRY: z.string().url(),
    BETTER_STACK_HEARTBEAT_SESSION_CLEANUP: z.string().url(),
    META_PIXEL_ACCESS_TOKEN: z.string(),
    META_CAPI_WEBHOOK_TOKEN: z.string(),
    META_TEST_EVENT_CODE: z.string().optional(),   // dev/pprd only — omit in prod
    SLACK_WEBHOOK_URL: z.string().url(),
    DAILY_REPORT_EMAIL_RECIPIENTS: z.string().min(1),
    AISENSY_API_KEY: z.string(),
    AISENSY_WEBHOOK_SECRET: z.string(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_CMS_URL: z.string().url(),
    NEXT_PUBLIC_R2_PUBLIC_URL: z.string().url(),
    NEXT_PUBLIC_ABLY_KEY: z.string(),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().url(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().startsWith('phc_'),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().url(),
    NEXT_PUBLIC_CLARITY_ID: z.string(),
    NEXT_PUBLIC_META_PIXEL_ID: z.string(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    APP_ENV: process.env.APP_ENV,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    PDF_API_URL: process.env.PDF_API_URL,
    BREVO_API_KEY: process.env.BREVO_API_KEY,
    ABLY_PRIVATE_KEY: process.env.ABLY_PRIVATE_KEY,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_KV_NAMESPACE_ID: process.env.CLOUDFLARE_KV_NAMESPACE_ID,
    BETTER_STACK_TOKEN: process.env.BETTER_STACK_TOKEN,
    BETTER_STACK_HEARTBEAT_NIGHTLY_SALES: process.env.BETTER_STACK_HEARTBEAT_NIGHTLY_SALES,
    BETTER_STACK_HEARTBEAT_REMINDERS: process.env.BETTER_STACK_HEARTBEAT_REMINDERS,
    BETTER_STACK_HEARTBEAT_MEMBERSHIP_EXPIRY: process.env.BETTER_STACK_HEARTBEAT_MEMBERSHIP_EXPIRY,
    BETTER_STACK_HEARTBEAT_SESSION_CLEANUP: process.env.BETTER_STACK_HEARTBEAT_SESSION_CLEANUP,
    META_PIXEL_ACCESS_TOKEN: process.env.META_PIXEL_ACCESS_TOKEN,
    META_CAPI_WEBHOOK_TOKEN: process.env.META_CAPI_WEBHOOK_TOKEN,
    META_TEST_EVENT_CODE: process.env.META_TEST_EVENT_CODE,
    SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL,
    DAILY_REPORT_EMAIL_RECIPIENTS: process.env.DAILY_REPORT_EMAIL_RECIPIENTS,
    AISENSY_API_KEY: process.env.AISENSY_API_KEY,
    AISENSY_WEBHOOK_SECRET: process.env.AISENSY_WEBHOOK_SECRET,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CMS_URL: process.env.NEXT_PUBLIC_CMS_URL,
    NEXT_PUBLIC_R2_PUBLIC_URL: process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
    NEXT_PUBLIC_ABLY_KEY: process.env.NEXT_PUBLIC_ABLY_KEY,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_CLARITY_ID: process.env.NEXT_PUBLIC_CLARITY_ID,
    NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID,
  },
});
```

CI-only secrets like `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `BETTER_STACK_HEARTBEAT_PREPROD_SYNC`, `BETTER_STACK_HEARTBEAT_BACKUP`, `BETTER_STACK_DEPLOY_WEBHOOK`, and `BETTER_STACK_INCIDENT_WEBHOOK` are **not** part of `apps/web/src/env.ts`; validate them in the workflow or script that uses them.

**If any variable is missing or fails validation → build fails immediately.** Import `env` from this file everywhere instead of using `process.env` directly.

---

## GitHub Secrets & Environments

Runtime code always reads generic names like `DATABASE_URL` and `DATABASE_URL_UNPOOLED`, but the workflow examples in this docs set use **explicit GitHub secret names per target environment** to make branch routing obvious.

```
Repository Settings → Secrets and variables → Actions
├── DATABASE_URL_DEV                 → neon.tech/.../dev
├── DATABASE_URL_TEST                → neon.tech/.../test
├── DATABASE_URL_PPRD                → neon.tech/.../preprod
├── DATABASE_URL_PROD                → neon.tech/.../main
├── DATABASE_URL_UNPOOLED_DEV        → direct Neon URL for dev
├── DATABASE_URL_UNPOOLED_TEST       → direct Neon URL for test
├── DATABASE_URL_UNPOOLED_PPRD       → direct Neon URL for preprod
└── DATABASE_URL_UNPOOLED_PROD       → direct Neon URL for prod
```

GitHub Environments can still be used for approvals and protection rules, but the examples below map the explicit secret into the generic runtime variable expected by the app.

Reference in GitHub Actions:

```yaml
# .github/workflows/deploy.yml
jobs:
  deploy:
    environment: production       # ← selects the GitHub Environment
    steps:
      - run: bun run build
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_PROD }}
          DATABASE_URL_UNPOOLED: ${{ secrets.DATABASE_URL_UNPOOLED_PROD }}
          BETTER_AUTH_SECRET: ${{ secrets.BETTER_AUTH_SECRET }}
          # ... all others injected the same way
```

---

## Platform Injection

| Platform | Where to set | Applied to |
|----------|-------------|-----------|
| **Cloudflare Pages** | Pages → Settings → Environment Variables | `apps/web` (edge) |
| **Render** | Service → Environment tab | `apps/web` (SSR origin) + `apps/cms` |

Both platforms inject vars at runtime — no `.env` file is needed or present in production.

---

## Local Setup — Quick Start

```bash
# 1. Copy templates
cp apps/web/.env.example apps/web/.env.local
cp apps/cms/.env.example apps/cms/.env.local

# 2. Fill in values from your service dashboards

# 3. Generate VAPID keys (one-time only)
bunx web-push generate-vapid-keys
# Paste output into NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env.local

# 4. Validate — build fails fast if anything is missing
cd apps/web && bun run build
```

---

## Summary — Variable Count

| Category | Count | Apps |
|----------|:-----:|------|
| Database | 2 | web, cms |
| Auth | 4 | web |
| Email (transactional) | 1 | web |
| PDF Invoice Service | 1 | web |
| Email (marketing) | 1 | web |
| Realtime (Ably) | 2 | web |
| File Storage (R2) | 5 | web, cms |
| Cache (Redis) | 2 | web |
| Queue (QStash) | 3 | web |
| Web Push (VAPID) | 2 | web |
| Cloudflare KV + CI/CD | 3 | web, CI/CD |
| Sentry | 4 | web, cms, CI/CD |
| BetterStack | 9 | web, CI/CD |
| Analytics | 3 | web |
| Meta Pixel + CAPI | 4 | web |
| Reporting | 2 | web |
| AiSensy | 2 | web |
| Payload | 1 | cms |
| App Config | 4 | web, cms |
| **Total** | **55** | |
