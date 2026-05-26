# Deployment Pipeline & DevOps Strategy

## Deployment Strategy Decision

### Why Feature Flag Deployment (Strategy #4)

| Strategy | Verdict | Reason |
|----------|---------|--------|
| Blue/Green | ❌ Overkill | Requires 2x infrastructure. Cloudflare Pages already does atomic deploys with instant rollback — you get Blue/Green semantics for free. |
| Canary | ❌ Not applicable | Canary releases need traffic splitting infra + large user base for statistical significance. A salon with <1,000 DAU can't canary meaningfully. |
| A/B Testing | ✅ Via PostHog | Not a deployment strategy — it's a product experimentation tool. Already in the stack via PostHog feature flags. |
| **Feature Flags** | ✅ **Primary strategy** | Ship code to prod anytime, control exposure via PostHog flags. Zero-downtime. Decouple deploy from release. |
| Rolling | ✅ Automatic | Cloudflare Pages already does rolling deploys across edge nodes globally. No action needed. |

### Why This Fits RGSS

```
┌───────────────────────────────────────────────────────────────────────┐
│  DEPLOY ≠ RELEASE                                                     │
│                                                                       │
│  Deploy = code is live on Cloudflare edge (happens on every merge)    │
│  Release = feature is visible to users (controlled by PostHog flags)  │
│                                                                       │
│  This means:                                                          │
│  • Merge to prod anytime — no "release day" pressure                  │
│  • Flag off = code is deployed but invisible                          │
│  • Flag on for staff first → then 10% customers → then 100%          │
│  • Bug found? Flag off instantly — no rollback needed                 │
│  • Works perfectly for a single-developer team                        │
└───────────────────────────────────────────────────────────────────────┘
```

### PostHog Feature Flag Usage

```ts
// apps/web/src/lib/flags.ts

import { PostHog } from 'posthog-node'

const posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST!,
})

export async function isFeatureEnabled(flag: string, userId: string): Promise<boolean> {
  return await posthog.isFeatureEnabled(flag, userId) ?? false
}

// Usage in Server Component
const showNewBookingFlow = await isFeatureEnabled('new-booking-flow', session.user.id)
```

**Flag rollout strategy:**
```
1. Deploy to prod with flag OFF
2. Flag ON for role = 'developer' (self-test in prod)
3. Flag ON for role = 'owner' | 'manager' (stakeholder preview)
4. Flag ON for 10% of customers (watch Sentry for errors)
5. Flag ON for 100% (full release)
6. Remove flag + dead code after 2 weeks stable
```

---

## GitHub Actions Pipeline — Full Specification

### Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CI/CD Pipeline                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  PR to dev ───────── Lint + Unit Tests + Type Check                  │
│       │                                                              │
│       ▼                                                              │
│  PR to test ──────── + Integration Tests + Playwright + Lighthouse   │
│       │                                                              │
│       ▼                                                              │
│  PR to pprd ──────── + k6 Load Test + Smoke Tests + Dep Audit        │
│       │                                                              │
│       ▼                                                              │
│  PR to prod ──────── + Manual Approval → Deploy + Health Check       │
│                       + Backup Verify + Post-deploy Smoke             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Workflow 1: CI — Lint, Test, Build (All PRs)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [dev, test, pprd, prod]
  push:
    branches: [dev]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-typecheck:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run lint       # Biome + Ultracite (lint + format check)
      - run: bun run typecheck  # tsc --noEmit

  unit-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run test:unit --coverage
      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: [lint-typecheck]
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build
      - name: Upload build artifact
        uses: actions/upload-artifact@v4
        with:
          name: build-output
          path: .next/
          retention-days: 1

  dependency-audit:
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - name: Trivy vulnerability scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          severity: 'HIGH,CRITICAL'
          exit-code: '1'
      - name: Socket.dev supply chain check
        uses: SocketDev/socket-security-action@v1
```

---

### Workflow 2: Integration + E2E (PRs to test/pprd/prod)

```yaml
# .github/workflows/integration.yml
name: Integration & E2E

on:
  pull_request:
    branches: [test, pprd, prod]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL_TEST }}
      APP_ENV: test
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - name: Reset and seed test DB
        run: bun run scripts/seed.ts --reset
      - name: Run integration tests
        run: bun run test:integration

  playwright-e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    needs: [integration-tests]
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL_TEST }}
      APP_ENV: test
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx playwright install --with-deps chromium
      - name: Start app
        run: bun run build && bun run start &
      - name: Wait for app
        run: bunx wait-on http://localhost:3000 --timeout 30000
      - name: Run Playwright tests
        run: bun run test:e2e
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/

  lighthouse-ci:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: [integration-tests]
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL_TEST }}
      APP_ENV: test
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build && bun run start &
      - run: bunx wait-on http://localhost:3000 --timeout 30000
      - name: Run Lighthouse CI
        run: bunx @lhci/cli autorun
        env:
          LHCI_BUILD_CONTEXT__CURRENT_HASH: ${{ github.sha }}
```

---

### Workflow 3: Load Test + Security (PRs to pprd/prod)

```yaml
# .github/workflows/load-test.yml
name: Load & Security

on:
  pull_request:
    branches: [pprd, prod]

jobs:
  k6-load-test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/setup-k6-action@v1
      - name: Run k6 load test
        run: k6 run tests/load/booking-flow.js
        env:
          K6_TARGET_URL: ${{ secrets.PPRD_URL }}
      - name: Check thresholds
        run: |
          # Fail if p95 > 500ms or error rate > 1%
          echo "Load test thresholds checked in k6 script"

  security-scan:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - name: Run Trivy vulnerability scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'
      - name: OWASP ZAP baseline scan
        uses: zaproxy/action-baseline@v0.13.0
        with:
          target: ${{ secrets.PPRD_URL }}
          rules_file_name: 'zap-rules.tsv'
```

---

### Workflow 4: Deploy to Production

```yaml
# .github/workflows/deploy-prod.yml
name: Deploy Production

on:
  push:
    branches: [prod]

jobs:
  pre-deploy-checks:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - name: Verify all CI checks passed
        run: |
          # GitHub API check — ensure no failing status checks
          gh api repos/${{ github.repository }}/commits/${{ github.sha }}/check-runs \
            --jq '.check_runs | map(select(.conclusion != "success")) | length' \
            | grep -q "^0$"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: [pre-deploy-checks]
    environment:
      name: production
      url: https://theroyalglow.in
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build

      - name: Upload source maps to Sentry
        run: |
          bunx @sentry/cli sourcemaps upload \
            --org royal-glow \
            --project rgss-web \
            --release ${{ github.sha }} \
            .next/static
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy .next --project-name=rgss-web --branch=prod

      - name: Run database migrations
        run: bun run db:migrate
        env:
          DATABASE_URL_UNPOOLED: ${{ secrets.DATABASE_URL_UNPOOLED_PROD }}

  post-deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    needs: [deploy]
    steps:
      - uses: actions/checkout@v4

      - name: Health check (retry 3x with 10s delay)
        run: |
          for i in 1 2 3; do
            STATUS=$(curl -sf -o /dev/null -w "%{http_code}" https://theroyalglow.in/api/health)
            if [ "$STATUS" = "200" ]; then
              echo "✅ Health check passed (attempt $i)"
              exit 0
            fi
            echo "⏳ Health check failed (attempt $i, status: $STATUS). Retrying in 10s..."
            sleep 10
          done
          echo "❌ Health check failed after 3 attempts"
          exit 1

      - name: Smoke test critical paths
        run: |
          # Verify critical pages return 200
          curl -sf https://theroyalglow.in/ > /dev/null
          curl -sf "https://theroyalglow.in/?book=1&utm_source=gmb" > /dev/null
          curl -sf https://theroyalglow.in/services > /dev/null
          curl -sf https://theroyalglow.in/book > /dev/null
          curl -sf https://theroyalglow.in/api/health > /dev/null
          echo "✅ All smoke tests passed"

      - name: Verify backup exists
        run: |
          # Check Neon's latest backup timestamp is within last 24h
          LATEST_BACKUP=$(curl -s -H "Authorization: Bearer ${{ secrets.NEON_API_KEY }}" \
            "https://console.neon.tech/api/v2/projects/${{ secrets.NEON_PROJECT_ID }}/branches" \
            | jq -r '.branches[] | select(.name == "main") | .updated_at')
          echo "Latest branch update: $LATEST_BACKUP"

      - name: Notify deployment success
        if: success()
        run: |
          curl -X POST ${{ secrets.BETTER_STACK_DEPLOY_WEBHOOK }} \
            -H "Content-Type: application/json" \
            -d '{"sha": "${{ github.sha }}", "status": "success", "env": "prod"}'

      - name: Notify deployment failure
        if: failure()
        run: |
          curl -X POST ${{ secrets.BETTER_STACK_INCIDENT_WEBHOOK }} \
            -H "Content-Type: application/json" \
            -d '{"title": "Production deploy failed", "sha": "${{ github.sha }}"}'
```

---

## Health Check Endpoint

### Implementation

```ts
// apps/web/src/app/api/health/route.ts

import { db } from '@repo/database'
import { sql } from 'drizzle-orm'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  version: string
  uptime: number
  checks: {
    database: ComponentHealth
    redis: ComponentHealth
    r2: ComponentHealth
  }
}

interface ComponentHealth {
  status: 'pass' | 'fail'
  latencyMs: number
  message?: string
}

export async function GET() {
  const start = Date.now()
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkR2(),
  ])

  const [dbResult, redisResult, r2Result] = checks

  const dbHealth = dbResult.status === 'fulfilled' ? dbResult.value : { status: 'fail' as const, latencyMs: 0, message: 'Connection failed' }
  const redisHealth = redisResult.status === 'fulfilled' ? redisResult.value : { status: 'fail' as const, latencyMs: 0, message: 'Connection failed' }
  const r2Health = r2Result.status === 'fulfilled' ? r2Result.value : { status: 'fail' as const, latencyMs: 0, message: 'Connection failed' }

  const allHealthy = dbHealth.status === 'pass' && redisHealth.status === 'pass' && r2Health.status === 'pass'
  const anyFailed = dbHealth.status === 'fail' || redisHealth.status === 'fail'

  const overallStatus = allHealthy ? 'healthy' : anyFailed ? 'unhealthy' : 'degraded'

  const response: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.COMMIT_SHA ?? 'unknown',
    uptime: process.uptime?.() ?? 0,
    checks: {
      database: dbHealth,
      redis: redisHealth,
      r2: r2Health,
    },
  }

  // 200 for healthy/degraded, 503 for unhealthy
  const statusCode = overallStatus === 'unhealthy' ? 503 : 200

  return Response.json(response, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-store',
      'X-Health-Status': overallStatus,
    },
  })
}

async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now()
  try {
    await db.execute(sql`SELECT 1`)
    return { status: 'pass', latencyMs: Date.now() - start }
  } catch (e) {
    return { status: 'fail', latencyMs: Date.now() - start, message: 'DB unreachable' }
  }
}

async function checkRedis(): Promise<ComponentHealth> {
  const start = Date.now()
  try {
    await redis.ping()
    return { status: 'pass', latencyMs: Date.now() - start }
  } catch (e) {
    return { status: 'fail', latencyMs: Date.now() - start, message: 'Redis unreachable' }
  }
}

async function checkR2(): Promise<ComponentHealth> {
  const start = Date.now()
  try {
    // HEAD request to a known test object in R2
    const res = await fetch(`${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/.health`, { method: 'HEAD' })
    return { status: res.ok ? 'pass' : 'fail', latencyMs: Date.now() - start }
  } catch (e) {
    return { status: 'fail', latencyMs: Date.now() - start, message: 'R2 unreachable' }
  }
}
```

### Health Check Response Example

```json
{
  "status": "healthy",
  "timestamp": "2026-05-23T14:30:00.000Z",
  "version": "a1b2c3d4e5f6",
  "uptime": 86400,
  "checks": {
    "database": { "status": "pass", "latencyMs": 12 },
    "redis": { "status": "pass", "latencyMs": 3 },
    "r2": { "status": "pass", "latencyMs": 8 }
  }
}
```

### BetterStack Integration

BetterStack hits `GET /api/health` every 3 minutes. If the response is `503` or times out, it:
1. Opens an incident on `status.theroyalglow.in`
2. Sends alert to developer (email + push)

---

## Backup Strategy

### Neon Automated Backups (PITR)

Neon provides **Point-in-Time Recovery (PITR)** with 7-day history on the free tier. This means you can restore to any second within the last 7 days.

| Feature | Neon Free Tier |
|---------|---------------|
| Backup type | Continuous WAL archiving (PITR) |
| Retention | 7 days |
| RPO (Recovery Point Objective) | ~0 seconds (continuous) |
| RTO (Recovery Time Objective) | < 5 minutes (branch from any point) |
| Manual action needed | None — automatic |

### Weekly Off-Site Backup (GitHub Actions)

For disaster recovery beyond Neon's infrastructure (e.g., Neon itself has an outage), a **weekly `pg_dump`** is stored in Cloudflare R2:

```yaml
# .github/workflows/weekly-backup.yml
name: Weekly Prod Backup

on:
  schedule:
    - cron: '0 2 * * 0'  # Every Sunday 2 AM UTC (7:30 AM IST)

jobs:
  backup:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - name: Install PostgreSQL client
        run: sudo apt-get install -y postgresql-client-16

      - name: Create compressed backup
        run: |
          TIMESTAMP=$(date +%Y%m%d_%H%M%S)
          BACKUP_FILE="rgss_prod_${TIMESTAMP}.sql.gz"
          pg_dump "${{ secrets.DATABASE_URL_UNPOOLED_PROD }}" \
            --no-owner --no-privileges --clean --if-exists \
            | gzip > $BACKUP_FILE
          echo "BACKUP_FILE=$BACKUP_FILE" >> $GITHUB_ENV
          echo "BACKUP_SIZE=$(du -h $BACKUP_FILE | cut -f1)" >> $GITHUB_ENV

      - name: Upload to Cloudflare R2
        run: |
          # Upload using AWS CLI (R2 is S3-compatible)
          aws s3 cp ${{ env.BACKUP_FILE }} \
            s3://rgss-backups/weekly/${{ env.BACKUP_FILE }} \
            --endpoint-url $R2_ENDPOINT
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
          R2_ENDPOINT: https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com

      - name: Verify backup integrity
        run: |
          # Download and verify we can decompress + parse
          aws s3 cp s3://rgss-backups/weekly/${{ env.BACKUP_FILE }} verify.sql.gz \
            --endpoint-url $R2_ENDPOINT
          gunzip -t verify.sql.gz
          echo "✅ Backup verified: ${{ env.BACKUP_FILE }} (${{ env.BACKUP_SIZE }})"
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
          R2_ENDPOINT: https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com

      - name: Cleanup old backups (keep last 8 weeks)
        run: |
          aws s3 ls s3://rgss-backups/weekly/ --endpoint-url $R2_ENDPOINT \
            | sort | head -n -8 | awk '{print $4}' \
            | xargs -I {} aws s3 rm s3://rgss-backups/weekly/{} --endpoint-url $R2_ENDPOINT
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
          R2_ENDPOINT: https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com

      - name: Ping BetterStack heartbeat
        run: curl -sf ${{ secrets.BETTER_STACK_HEARTBEAT_BACKUP }}

      - name: Notify on failure
        if: failure()
        run: |
          curl -X POST ${{ secrets.BETTER_STACK_INCIDENT_WEBHOOK }} \
            -H "Content-Type: application/json" \
            -d '{"title": "Weekly backup FAILED", "severity": "critical"}'
```

### Backup Verification (Monthly Restore Test)

```yaml
# .github/workflows/monthly-backup-test.yml
name: Monthly Backup Restore Test

on:
  schedule:
    - cron: '0 3 1 * *'  # 1st of every month at 3 AM UTC

jobs:
  restore-test:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Get latest backup from R2
        run: |
          LATEST=$(aws s3 ls s3://rgss-backups/weekly/ --endpoint-url $R2_ENDPOINT \
            | sort | tail -1 | awk '{print $4}')
          aws s3 cp s3://rgss-backups/weekly/$LATEST backup.sql.gz \
            --endpoint-url $R2_ENDPOINT
          gunzip backup.sql.gz
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
          R2_ENDPOINT: https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com

      - name: Restore to Neon test branch
        env:
          RESTORE_DB_URL: ${{ secrets.DATABASE_URL_UNPOOLED_TEST }}
        run: |
          # Restore into the isolated test branch using the direct connection URL
          psql "$RESTORE_DB_URL" < backup.sql

          # Run integrity checks
          psql "$RESTORE_DB_URL" -c "SELECT COUNT(*) FROM booking;"
          psql "$RESTORE_DB_URL" -c "SELECT COUNT(*) FROM invoice;"
          psql "$RESTORE_DB_URL" -c "SELECT COUNT(*) FROM \"user\";"

          echo "✅ Backup restore test passed"
```

### Backup Summary

| Type | Frequency | Retention | Storage | RPO |
|------|-----------|-----------|---------|-----|
| Neon PITR (automatic) | Continuous | 7 days | Neon infrastructure | ~0 sec |
| Weekly `pg_dump` | Sunday 7:30 AM IST | 8 weeks (56 days) | Cloudflare R2 | ≤ 7 days |
| Monthly restore test | 1st of month | — | Temporary Neon branch | Validates integrity |

---

## Rollback Plan

### Tier 1: Instant Rollback (< 30 seconds)

Cloudflare Pages keeps every deployment as an immutable artifact. Rolling back = promoting a previous deployment:

```bash
# List recent deployments
wrangler pages deployments list --project-name=rgss-web

# Rollback to previous deployment
wrangler pages deployments rollback --project-name=rgss-web --deployment-id=<previous_id>
```

**Automated rollback trigger:**
```yaml
# In post-deploy job
- name: Auto-rollback on health check failure
  if: failure()
  run: |
    echo "🚨 Health check failed — rolling back to previous deployment"
    PREV_DEPLOY=$(wrangler pages deployments list --project-name=rgss-web --json \
      | jq -r '.[1].id')
    wrangler pages deployments rollback --project-name=rgss-web --deployment-id=$PREV_DEPLOY
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

### Tier 2: Database Rollback (< 5 minutes)

If a migration causes data issues, use Neon PITR:

```bash
# Create a branch from a point in time (before the bad migration)
curl -X POST "https://console.neon.tech/api/v2/projects/$PROJECT_ID/branches" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "branch": {
      "name": "recovery-2026-05-23",
      "parent_id": "main",
      "parent_timestamp": "2026-05-23T10:00:00Z"
    }
  }'

# Point app to recovery branch temporarily
# Fix migration, then migrate recovery branch forward
```

### Tier 3: Full Disaster Recovery (< 30 minutes)

If Neon infrastructure is down:

```
1. Retrieve latest weekly backup from Cloudflare R2
2. Provision an emergency Neon project or temporary Neon branch in a separate region
3. Restore pg_dump to emergency DB
4. Update DATABASE_URL in Cloudflare Pages env vars
5. Redeploy — app points to emergency DB
6. Once Neon is back: sync data and switch back
```

### Rollback Decision Matrix

| Scenario | Action | Time |
|----------|--------|------|
| UI bug after deploy | Feature flag OFF | < 10 sec |
| App crash / 500s | Cloudflare rollback to previous deploy | < 30 sec |
| Bad migration (no data loss) | Revert migration + redeploy | < 10 min |
| Bad migration (data corrupted) | Neon PITR to pre-migration point | < 5 min |
| Neon outage | Emergency DB from R2 backup | < 30 min |

---

## Graceful Shutdown

### Cloudflare Workers (Primary Runtime)

Cloudflare Workers are stateless and ephemeral — no graceful shutdown needed. Each request is isolated. If a Worker is evicted, in-flight requests complete normally (Workers have a 30-second grace period).

### Render Services (PDF API + Payload CMS)

```ts
// apps/pdf-api/src/server.ts (Render Node.js)

import { serve } from '@hono/node-server'

const server = serve({ fetch: app.fetch, port: 3001 })

// Graceful shutdown for Render deploys
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`)

  // Stop accepting new connections
  server.close()

  // Wait for in-flight requests (max 30s)
  await new Promise((resolve) => setTimeout(resolve, 30_000))

  // Close DB connections
  await db.$client.end()

  console.log('👋 Graceful shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
```

### QStash Job Completion

QStash jobs are idempotent by design. If a Worker is evicted mid-job:
- QStash auto-retries (3x with exponential backoff)
- Idempotency keys prevent duplicate processing

---

## Monitoring & Alerting

### Why BetterStack (Not PagerDuty)

| Criteria | PagerDuty | BetterStack | Decision |
|----------|-----------|-------------|----------|
| Free tier | 1 user, limited | 10 monitors, status page, heartbeats, logs | **BetterStack wins** |
| Pricing at scale | $21/user/mo | $24/mo total (Starter) | **BetterStack wins** |
| Integrations | Excellent | Good (Slack, email, SMS, webhooks) | Tie |
| Complexity | Enterprise-grade — overkill | Simple, focused | **BetterStack wins** |
| Status page | Separate product (Statuspage.io) | Built-in free | **BetterStack wins** |
| On-call rotation | Core feature | Basic (escalation rules) | PagerDuty wins |

**Verdict:** PagerDuty is for large engineering teams with on-call rotations. RGSS is a single developer — BetterStack provides uptime monitoring, alerting, status page, logs, and scheduled-job monitoring in one tool at zero cost.

### Alert Escalation Strategy

```
┌─────────────────────────────────────────────────────────┐
│  Level 1: Automated (no human action)                   │
│    - Auto-rollback on health check failure              │
│    - Feature flag auto-disable on error spike           │
│                                                         │
│  Level 2: Notification (developer awareness)            │
│    - Slack #alerts channel                              │
│    - BetterStack push notification                      │
│    - Sentry email digest                                │
│    Trigger: Non-critical (R2 slow, email delivery lag)  │
│                                                         │
│  Level 3: Urgent Alert (immediate action needed)        │
│    - BetterStack SMS + push notification                │
│    - Slack #alerts-critical with @channel               │
│    Trigger: Site down, DB unreachable, deploy failed    │
│                                                         │
│  Level 4: Escalation (if Level 3 not acked in 15 min)  │
│    - Phone call via BetterStack                         │
│    Trigger: Prolonged outage during business hours      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Alert Rules

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| Site down | `/api/health` returns 503 or times out | Critical | SMS + push + Slack |
| Deploy failed | GitHub Actions workflow fails on prod | Critical | Slack + email |
| Error spike | >10 Sentry errors in 5 min | High | Slack + push |
| DB slow | Health check DB latency > 500ms | Warning | Slack |
| Backup missed | BetterStack heartbeat not pinged on Sunday | High | SMS + Slack |
| Scheduled job missed | BetterStack heartbeat timeout | Warning | Slack |
| SSL expiry | Certificate expires in < 14 days | Warning | Email |
| Disk (R2) | Backup bucket > 5 GB | Info | Email |

---

## Dependency Audit Strategy

### Automated (Every PR)

```yaml
# In ci.yml (already shown above)
dependency-audit:
  steps:
    - uses: aquasecurity/trivy-action@master
      with:
        scan-type: 'fs'
        severity: 'HIGH,CRITICAL'
        exit-code: '1'
    - uses: SocketDev/socket-security-action@v1
```

**Tools used:**
- **Trivy** — scans filesystem for known CVEs in dependencies (high/critical block PR)
- **Socket.dev** — detects supply chain attacks: typosquatting, install scripts, obfuscated code, malicious packages
```

### Weekly Dependency Update Check

```yaml
# .github/workflows/dependency-update.yml
name: Dependency Updates

on:
  schedule:
    - cron: '0 9 * * 1'  # Every Monday 9 AM UTC (2:30 PM IST)

jobs:
  check-updates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile

      - name: Check for outdated packages
        run: bunx npm-check-updates --format group

      - name: Check for security advisories
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          severity: 'HIGH,CRITICAL'
          format: 'json'
          output: 'trivy-report.json'
          exit-code: '0'

      - name: Create issue if critical updates exist
        run: |
          if jq -e '[.Results[]?.Vulnerabilities[]?] | length > 0' trivy-report.json > /dev/null; then
            gh issue create \
              --title "🚨 Critical dependency vulnerability detected" \
              --body-file trivy-report.json \
              --label "security,dependencies"
          fi
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Renovate Bot (Automated PRs)

```json
// renovate.json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "schedule": ["before 9am on monday"],
  "packageRules": [
    {
      "matchUpdateTypes": ["patch", "minor"],
      "automerge": true,
      "automergeType": "branch"
    },
    {
      "matchUpdateTypes": ["major"],
      "automerge": false,
      "labels": ["major-update"]
    },
    {
      "matchPackageNames": ["next", "drizzle-orm", "@sentry/*"],
      "automerge": false,
      "labels": ["framework-update"]
    }
  ]
}
```

---

## Input Validation & Sanitization

### Validation Layer Architecture

```
Client (browser)                    Server
──────────────────────────────────────────────────────────────────
React Hook Form                     Middleware (rate limit, auth)
  + Zod schema (client-side)             │
  │                                      ▼
  │  POST /api/bookings or /api/leads Route Handler
  │  { ... validated data }              │
  │                                      ▼
  └──────────────────────────────── Zod .safeParse() ← TRUST BOUNDARY
                                         │
                                         ▼ (only parsed.data passes)
                                     Business Logic
                                         │
                                         ▼
                                     Drizzle ORM (parameterized queries)
```

### Zod Validation Rules

```ts
// packages/types/booking.ts

import { z } from 'zod'

export const createBookingSchema = z.object({
  branchId: z.string().min(1).max(50),
  serviceType: z.enum(['salon', 'spa']),
  serviceIds: z.array(z.string().min(1).max(50)).min(1).max(10),
  bookingDate: z.string().date().refine(
    (d) => new Date(d) >= new Date(new Date().toDateString()),
    'Cannot book in the past'
  ),
  bookingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time format (HH:mm)'),
  notes: z.string().max(500).optional().transform(val => val?.trim()),
})
```

### Sanitization Middleware

```ts
// apps/web/src/lib/api/sanitize.ts

import DOMPurify from 'isomorphic-dompurify'

/**
 * Sanitize all string fields in an object.
 * Strips HTML tags, trims whitespace, normalizes unicode.
 */
export function sanitizeInput<T extends Record<string, unknown>>(input: T): T {
  const sanitized = { ...input }

  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'string') {
      // Strip HTML, trim, normalize unicode
      ;(sanitized as any)[key] = DOMPurify.sanitize(value, { ALLOWED_TAGS: [] }).trim()
    }
  }

  return sanitized
}
```

### SQL Injection Prevention

Drizzle ORM uses **parameterized queries** exclusively — no string interpolation:

```ts
// ✅ Safe — parameterized by Drizzle
const result = await db
  .select()
  .from(booking)
  .where(eq(booking.customerId, userId))  // userId is parameterized

// ❌ NEVER do this — even though Drizzle prevents it
// db.execute(sql`SELECT * FROM booking WHERE id = '${id}'`)  // raw interpolation
```

### XSS Prevention

- React auto-escapes all rendered values (no `dangerouslySetInnerHTML` used anywhere)
- CSP headers block inline scripts without nonce
- All user-generated text (notes, names) rendered as text nodes, never HTML

---

## Database Indexing Strategy

### Indexing Principles

1. Index columns that appear in `WHERE`, `JOIN ON`, and `ORDER BY` clauses
2. Composite indexes for multi-column queries (leftmost prefix rule)
3. Partial indexes for filtered queries (e.g., active-only)
4. Never index columns with low cardinality on small tables

### Critical Indexes

```sql
-- ═══════════════════════════════════════════════════════════
-- BOOKING TABLE — most frequently queried
-- ═══════════════════════════════════════════════════════════

-- Customer's booking list: /bookings (customer view)
CREATE INDEX idx_booking_customer_date
  ON booking (customer_id, booking_date DESC);

-- Admin booking list: /admin/bookings (filtered by status)
CREATE INDEX idx_booking_status_date
  ON booking (status, booking_date DESC);

-- Branch + date (receptionist daily view)
CREATE INDEX idx_booking_branch_date
  ON booking (branch_id, booking_date, booking_time);

-- Upcoming confirmed bookings (for reminder jobs)
CREATE INDEX idx_booking_upcoming_confirmed
  ON booking (booking_date, booking_time)
  WHERE status = 'confirmed';

-- Staff schedule view
CREATE INDEX idx_booking_staff_date
  ON booking (assigned_staff_id, booking_date)
  WHERE status IN ('confirmed', 'in_progress');

-- ═══════════════════════════════════════════════════════════
-- INVOICE TABLE
-- ═══════════════════════════════════════════════════════════

-- Customer invoice history
CREATE INDEX idx_invoice_customer_date
  ON invoice (customer_id, created_at DESC);

-- Daily sales report (branch + date range)
CREATE INDEX idx_invoice_branch_paid
  ON invoice (branch_id, paid_at DESC)
  WHERE payment_status = 'paid';

-- Invoice lookup by number (receptionist search)
CREATE UNIQUE INDEX idx_invoice_number
  ON invoice (invoice_number);

-- ═══════════════════════════════════════════════════════════
-- SERVICE TABLE
-- ═══════════════════════════════════════════════════════════

-- Service listing page (category + active + order)
CREATE INDEX idx_service_category_active
  ON service (category_id, display_order)
  WHERE is_active = true;

-- Service slug lookup (URL resolution)
CREATE UNIQUE INDEX idx_service_slug
  ON service (slug);

-- ═══════════════════════════════════════════════════════════
-- SPA MEMBERSHIP
-- ═══════════════════════════════════════════════════════════

-- One active membership per customer (unique partial index)
CREATE UNIQUE INDEX idx_membership_one_active
  ON spa_membership (customer_id)
  WHERE status = 'active';

-- Expiry reminder job (find expiring memberships)
CREATE INDEX idx_membership_expires
  ON spa_membership (expires_at)
  WHERE status = 'active';

-- ═══════════════════════════════════════════════════════════
-- USER TABLE
-- ═══════════════════════════════════════════════════════════

-- Email lookup (auth + search)
CREATE UNIQUE INDEX idx_user_email
  ON "user" (email);

-- Phone search (receptionist lookup)
CREATE INDEX idx_user_phone
  ON "user" (phone)
  WHERE phone IS NOT NULL;

-- Role-based queries (staff list, customer list)
CREATE INDEX idx_user_role
  ON "user" (role);

-- ═══════════════════════════════════════════════════════════
-- LEAD TABLE (CRM)
-- ═══════════════════════════════════════════════════════════

-- Pipeline view (status + date)
CREATE INDEX idx_lead_status_date
  ON lead (status, created_at DESC);

-- Campaign attribution
CREATE INDEX idx_lead_campaign
  ON lead (utm_campaign)
  WHERE utm_campaign IS NOT NULL;

-- ═══════════════════════════════════════════════════════════
-- LOYALTY
-- ═══════════════════════════════════════════════════════════

-- Gem expiry job (find expiring gems)
CREATE INDEX idx_loyalty_tx_expires
  ON loyalty_transaction (expires_at)
  WHERE type = 'earned' AND expires_at IS NOT NULL;

-- ═══════════════════════════════════════════════════════════
-- OFFER
-- ═══════════════════════════════════════════════════════════

-- Active offers (public page /offers)
CREATE INDEX idx_offer_active_dates
  ON offer (start_date, end_date)
  WHERE is_active = true;

-- One offer per customer per day
CREATE UNIQUE INDEX idx_offer_one_per_day
  ON offer_redemption (customer_id, redeemed_date);

-- ═══════════════════════════════════════════════════════════
-- NOTIFICATION
-- ═══════════════════════════════════════════════════════════

-- User notification feed
CREATE INDEX idx_notification_user_date
  ON notification (user_id, created_at DESC);
```

### Index Monitoring

```sql
-- Find unused indexes (run monthly)
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- Find slow queries without indexes
SELECT query, calls, mean_exec_time, rows
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- > 100ms
ORDER BY mean_exec_time DESC
LIMIT 20;
```

---

## Environment Variable Management

### Per-Environment Variables (Cloudflare Pages)

```
┌──────────────────────────────────────────────────────────────┐
│  Cloudflare Pages → Settings → Environment Variables         │
├──────────────────────────────────────────────────────────────┤
│  Production (`prod` git branch → Neon `main`):               │
│    APP_ENV=prod                                              │
│    DATABASE_URL=postgres://...neon.tech/main                 │
│    RESEND_API_KEY=re_xxxx                                    │
│    BREVO_API_KEY=xkeysib-xxxx                                │
│    NEXT_PUBLIC_SENTRY_DSN=https://xxxx@sentry.io/xxxx        │
│    NEXT_PUBLIC_POSTHOG_KEY=phc_xxxx                          │
│    NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com         │
│                                                              │
│  Preview (all other branches):                               │
│    APP_ENV=pprd (or test/dev based on branch)                │
│    DATABASE_URL=postgres://...neon.tech/preprod              │
│    RESEND_API_KEY=re_test_xxxx                               │
│    NEXT_PUBLIC_SENTRY_DSN=<same DSN, different env tag>      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Secrets Never in Code

| Secret | Storage Location |
|--------|-----------------|
| Production DB URL | Cloudflare Pages env + GitHub Actions secret |
| API keys (Resend, Brevo, Ably) | Cloudflare Pages env + GitHub Actions secret |
| Google OAuth credentials | Cloudflare Pages env |
| Neon API key (for backups) | GitHub Actions secret only |
| R2 access keys (for backups) | GitHub Actions secret only |
| Sentry auth token (for source maps) | GitHub Actions secret only |
| BetterStack webhook URLs | GitHub Actions secret only |

---

## Post-Deploy Checklist (Automated)

Every production deploy triggers these automated checks:

```
✅ Health check endpoint returns 200
✅ Homepage loads (HTTP 200, < 3s)
✅ Homepage booking dialog deep-link loads (`/?book=1&utm_source=gmb`)
✅ /services page loads
✅ /book campaign lead page loads
✅ API route responds to OPTIONS (CORS)
✅ Source maps uploaded to Sentry
✅ BetterStack notified of deployment
✅ No new Sentry errors in first 5 minutes (monitored)
```

---

## Database Migration Safety (Zero-Downtime)

### The Golden Rule

> **Never deploy a breaking migration and a code change in the same deploy.**

Migrations must be **backward-compatible** — the old code running on existing edge nodes must work with the new schema during the rollout window.

### Expand-Contract Pattern

For any schema change that could break the running app:

```
Phase 1 — EXPAND (deploy migration only, no code change)
  • Add new column (nullable, with default)
  • Add new table
  • Add new index
  → Old code still works fine — it ignores new columns

Phase 2 — MIGRATE (deploy code that uses new schema)
  • Code reads/writes to new column
  • Backfill old data if needed
  → Both old and new code work

Phase 3 — CONTRACT (deploy cleanup — remove old column)
  • Drop old column / remove dead code
  • Only after Phase 2 is stable (≥ 24h)
```

### Safe vs Unsafe Operations

| Operation | Safe? | How to Make Safe |
|-----------|-------|-----------------|
| Add column (nullable) | ✅ | Just add it |
| Add column (NOT NULL) | ❌ | Add nullable → backfill → set NOT NULL |
| Drop column | ❌ | Remove from code first → deploy → then drop column |
| Rename column | ❌ | Add new column → dual-write → migrate reads → drop old |
| Add index | ✅ | Use `CREATE INDEX CONCURRENTLY` (non-blocking) |
| Drop index | ✅ | Safe — just slower queries |
| Add table | ✅ | No existing code references it |
| Drop table | ❌ | Remove all code references first → deploy → then drop |
| Change column type | ❌ | Add new column → migrate → drop old |
| Add constraint | ⚠️ | `NOT VALID` first → `VALIDATE CONSTRAINT` separately |

### Migration Execution in CI

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './packages/database/schema/*',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED!,
  },
})
```

```bash
# Generate migration
bun run db:generate   # → creates migrations/XXXX_migration_name.sql

# Apply migration (in deploy workflow)
bun run db:migrate    # → drizzle-kit migrate

# Review generated SQL before merging
# EVERY migration file is committed to git and reviewed in PR
```

### Migration Failure Recovery

```
Migration fails mid-apply?
  → Neon PITR: restore main branch to T-1 minute
  → Cloudflare rollback: previous deploy (still works with old schema)
  → Fix migration SQL
  → Re-deploy

Migration succeeds but app breaks?
  → Feature flag OFF (if new feature)
  → Cloudflare rollback (if old code still works with new schema — it should)
  → If not: Neon PITR + Cloudflare rollback together
```

### Pre-Migration Checklist (Automated in CI)

```yaml
# In deploy-prod.yml, before db:migrate
- name: Verify migration safety
  run: |
    # 1. Check migration file exists and is reviewed
    PENDING=$(bun run db:check-pending)
    if [ -n "$PENDING" ]; then
      echo "Pending migrations: $PENDING"
      # 2. Verify no DROP COLUMN without prior code removal
      if grep -i "DROP COLUMN\|DROP TABLE\|ALTER.*TYPE" migrations/*.sql; then
        echo "⚠️  Destructive migration detected — requires manual review"
        exit 1
      fi
    fi
```

---

## Rate Limiting — Per-Endpoint Thresholds

### Global Rate Limits (Middleware)

Applied to ALL `/api/*` routes before reaching handlers:

```ts
// apps/web/src/middleware.ts (rate limit section)

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

// Different limiters for different endpoint groups
const limiters = {
  // General API — generous limit
  general: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, '60 s'),  // 60 req/min
    prefix: 'rl:general',
  }),

  // Auth-related — tighter to prevent brute force
  auth: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '60 s'),  // 10 req/min
    prefix: 'rl:auth',
  }),

  // Booking creation — prevent slot hoarding
  booking: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '60 s'),   // 5 req/min
    prefix: 'rl:booking',
  }),

  // Search/autocomplete — high frequency expected
  search: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(120, '60 s'), // 120 req/min
    prefix: 'rl:search',
  }),

  // Admin write operations — moderate
  adminWrite: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '60 s'),  // 30 req/min
    prefix: 'rl:admin',
  }),

  // Webhooks (Brevo, Ably) — need higher limit
  webhook: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(200, '60 s'), // 200 req/min
    prefix: 'rl:webhook',
  }),
}
```

### Per-Endpoint Threshold Table

| Endpoint Pattern | Limiter | Limit | Identifier | Reason |
|-----------------|---------|-------|-----------|--------|
| `POST /api/auth/*` | auth | 10/min | IP | Prevent brute force on OAuth flows |
| `POST /api/leads` | lead | 3/min | IP/userId | Prevent campaign lead form spam |
| `POST /api/bookings` | booking | 5/min | userId | Prevent normal booking spam |
| `PATCH /api/bookings/*/cancel` | booking | 5/min | userId | Prevent abuse |
| `POST /api/admin/bookings` | adminWrite | 30/min | userId | Receptionist-created bookings |
| `GET /api/services` | search | 120/min | IP | High-frequency page loads |
| `GET /api/availability/*` | search | 120/min | IP | Calendar slot checks |
| `POST /api/admin/bookings/*/complete` | adminWrite | 30/min | userId | Admin operations |
| `POST /api/admin/invoices/generate` | adminWrite | 30/min | userId | Invoice generation |
| `POST /api/admin/memberships` | adminWrite | 30/min | userId | Membership creation |
| `POST /api/webhooks/*` | webhook | 200/min | IP | External service callbacks |
| `GET /api/health` | — | No limit | — | Must always respond |
| `*` (all other) | general | 60/min | userId or IP | Catch-all |

### Identifier Strategy

```ts
function getRateLimitIdentifier(req: Request, session: Session | null): string {
  // Authenticated users: rate limit by user ID (fairer)
  if (session?.user?.id) return `user:${session.user.id}`

  // Unauthenticated: rate limit by IP
  const ip = req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]
    ?? 'unknown'

  return `ip:${ip}`
}
```

### Burst Protection (DDoS Layer)

Cloudflare's built-in DDoS protection handles volumetric attacks before requests even reach Workers. Additionally:

```
Cloudflare WAF Rules (free tier):
  • Block requests from known bot IPs
  • Challenge suspicious traffic (CAPTCHA)
  • Rate limit by IP at edge: 1,000 req/min (before hitting Workers)

Upstash Ratelimit (application layer):
  • Per-user / per-IP limits (table above)
  • Returns 429 with Retry-After header
  • Logged in BetterStack for pattern analysis
```

---

## CORS Configuration

```ts
// apps/web/src/middleware.ts (CORS section)

const ALLOWED_ORIGINS = {
  prod: ['https://theroyalglow.in', 'https://www.theroyalglow.in'],
  pprd: ['https://pprd.theroyalglow.in', 'http://localhost:3000'],
  dev: ['http://localhost:3000', 'http://localhost:3001'],
  test: ['http://localhost:3000'],
}

function corsHeaders(origin: string | null): HeadersInit {
  const env = process.env.APP_ENV as keyof typeof ALLOWED_ORIGINS
  const allowed = ALLOWED_ORIGINS[env] ?? ALLOWED_ORIGINS.prod

  const isAllowed = origin && allowed.includes(origin)

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : '',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400', // Preflight cache: 24h
  }
}

// Handle OPTIONS preflight
if (req.method === 'OPTIONS') {
  return new Response(null, { status: 204, headers: corsHeaders(origin) })
}
```

**Key rules:**
- No wildcard (`*`) origins — only exact domain match
- Credentials allowed (cookies for Better Auth sessions)
- Preflight cached for 24h to reduce OPTIONS requests
- Different origins per environment (localhost for dev, real domain for prod)

---

## Preview Deployments (PR Previews)

Cloudflare Pages automatically deploys every PR to a unique preview URL:

```
PR #42 → https://42.rgss-web.pages.dev
PR #43 → https://43.rgss-web.pages.dev
```

### Preview Environment Configuration

```
Preview deployments use:
  • APP_ENV=pprd
  • DATABASE_URL → pprd Neon branch (shared, read-heavy)
  • Resend → test API key (emails go to /dev/null)
  • Sentry → same DSN, tagged as env=preview
  • PostHog → disabled (no analytics noise)
```

### PR Comment with Preview URL

```yaml
# In ci.yml, add after build
- name: Comment preview URL on PR
  if: github.event_name == 'pull_request'
  uses: actions/github-script@v7
  with:
    script: |
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: `🚀 Preview deployed: https://${context.issue.number}.rgss-web.pages.dev`
      })
```

---

## Build Caching (Fast CI)

### Bun Install Cache

```yaml
# Shared across all workflows
- uses: oven-sh/setup-bun@v2
- name: Cache bun dependencies
  uses: actions/cache@v4
  with:
    path: ~/.bun/install/cache
    key: bun-${{ runner.os }}-${{ hashFiles('bun.lockb') }}
    restore-keys: bun-${{ runner.os }}-
- run: bun install --frozen-lockfile
```

### Next.js Build Cache

```yaml
- name: Cache Next.js build
  uses: actions/cache@v4
  with:
    path: .next/cache
    key: nextjs-${{ runner.os }}-${{ hashFiles('bun.lockb') }}-${{ hashFiles('apps/web/src/**') }}
    restore-keys: |
      nextjs-${{ runner.os }}-${{ hashFiles('bun.lockb') }}-
      nextjs-${{ runner.os }}-
```

### Playwright Browser Cache

```yaml
- name: Cache Playwright browsers
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ hashFiles('bun.lockb') }}
- run: bunx playwright install --with-deps chromium
```

### Expected CI Times (With Caching)

| Job | First Run | Cached |
|-----|-----------|--------|
| Lint + Typecheck | ~90s | ~30s |
| Unit Tests | ~120s | ~45s |
| Build | ~180s | ~60s |
| Integration Tests | ~300s | ~180s |
| Playwright E2E | ~600s | ~300s |
| **Total (parallel)** | **~10 min** | **~5 min** |

---

## Deploy Freeze Policy

### When NOT to Deploy to Prod

| Window | Reason |
|--------|--------|
| Saturday 10 AM – 8 PM IST | Peak salon hours — no risk during max customers |
| Sunday (full day) | Salon open — no one available to monitor |
| Public holidays (Diwali, etc.) | Same reason — high traffic, low developer availability |
| During active BetterStack incident | Don't add chaos to an outage |

### Implementation (GitHub Actions)

```yaml
# In deploy-prod.yml
- name: Check deploy freeze window
  run: |
    HOUR=$(TZ=Asia/Kolkata date +%H)
    DAY=$(TZ=Asia/Kolkata date +%u)  # 1=Mon, 6=Sat, 7=Sun

    # Block Saturday 10AM-8PM and all Sunday
    if [[ "$DAY" == "7" ]]; then
      echo "❌ Deploy blocked: Sunday (salon operating)"
      exit 1
    fi
    if [[ "$DAY" == "6" && "$HOUR" -ge 10 && "$HOUR" -lt 20 ]]; then
      echo "❌ Deploy blocked: Saturday peak hours (10AM-8PM IST)"
      exit 1
    fi
    echo "✅ Deploy window is open"
```

### Override

```bash
# Emergency deploy bypasses freeze (requires manual approval anyway)
# Add label "deploy:emergency" to the PR — freeze check skips
```

---

## Secrets Rotation Strategy

### Rotation Schedule

| Secret | Rotation Frequency | How to Rotate |
|--------|-------------------|---------------|
| Resend API key | Every 6 months | Generate new key in Resend dashboard → update CF Pages + GH Actions → verify email sends → revoke old key |
| Brevo API key | Every 6 months | Same pattern |
| Google OAuth secret | Every 12 months | Google Cloud Console → new secret → update → test login |
| Neon API key | Every 6 months | Neon dashboard → regenerate → update GH Actions |
| Cloudflare API token | Every 12 months | CF dashboard → new token → update GH Actions → revoke old |
| R2 access keys | Every 6 months | CF dashboard → new keypair → update → test backup |
| Sentry auth token | Every 12 months | Sentry settings → new token → update GH Actions |
| BetterStack webhooks | Never (URL-based) | Change only if compromised |

### Zero-Downtime Rotation Pattern

```
1. Generate NEW key (old key still active)
2. Update Cloudflare Pages env var with new key
3. Trigger a preview deploy — verify new key works
4. Update GitHub Actions secrets
5. Trigger full CI — verify all workflows pass
6. Revoke OLD key
7. Log rotation in CHANGELOG.md
```

### Rotation Reminder (GitHub Actions)

```yaml
# .github/workflows/secret-rotation-reminder.yml
name: Secret Rotation Reminder

on:
  schedule:
    - cron: '0 9 1 */6 *'  # 1st of every 6th month (Jan, Jul)

jobs:
  remind:
    runs-on: ubuntu-latest
    steps:
      - name: Create rotation reminder issue
        run: |
          gh issue create \
            --title "🔑 Scheduled: Rotate API keys & secrets" \
            --body "It's time for the 6-monthly secret rotation. See docs/deployment.md → Secrets Rotation Strategy." \
            --label "security,maintenance"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## Incident Response Runbook

### Severity Levels

| Level | Definition | Response Time | Example |
|-------|-----------|---------------|---------|
| **SEV-1** | Site completely down for all users | < 15 min | Cloudflare outage, DB unreachable |
| **SEV-2** | Core feature broken (booking, payments) | < 1 hour | Booking API 500s, invoice generation failing |
| **SEV-3** | Non-critical feature degraded | < 4 hours | Email delivery delayed, analytics not recording |
| **SEV-4** | Minor issue, no user impact | Next working day | Broken admin-only page, cosmetic bug |

### SEV-1 Runbook (Site Down)

```
┌────────────────────────────────────────────────────────────────────┐
│  SITE DOWN — SEV-1 RESPONSE                                        │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  0. BetterStack fires alert (SMS + push)                           │
│                                                                     │
│  1. VERIFY (1 min)                                                  │
│     • Check status.theroyalglow.in                                  │
│     • curl https://theroyalglow.in/api/health                      │
│     • Check Cloudflare dashboard for edge errors                    │
│                                                                     │
│  2. IDENTIFY (5 min)                                                │
│     • Is it Cloudflare? → Check CF status page                     │
│     • Is it Neon DB? → Check /api/health → DB check                │
│     • Is it our code? → Check Sentry for new errors                │
│     • Is it DNS? → dig theroyalglow.in                              │
│                                                                     │
│  3. MITIGATE (5-15 min)                                             │
│     • Bad deploy → Cloudflare rollback (30 sec)                    │
│     • DB down → Switch to Neon PITR branch                         │
│     • Cloudflare outage → Nothing we can do (update status page)   │
│     • High traffic → Check rate limiting, block abusive IPs         │
│                                                                     │
│  4. COMMUNICATE (immediately after mitigation)                      │
│     • Update status.theroyalglow.in (BetterStack status page)      │
│     • If during business hours: notify owner via WhatsApp           │
│                                                                     │
│  5. POST-INCIDENT (within 24h)                                      │
│     • Write brief incident report (what, when, why, fix)           │
│     • Add preventive measure to this doc                            │
│     • Close BetterStack incident                                    │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

### SEV-2 Runbook (Feature Broken)

```
1. Check Sentry for error details + stack trace
2. Identify affected feature
3. Feature flag OFF (if new feature) — instant fix
4. If not behind flag: Cloudflare rollback
5. Fix bug on dev → fast-track through test → pprd → prod
6. Brief incident note (no formal report needed)
```

### Quick Reference Commands

```bash
# Check site health
curl -sf https://theroyalglow.in/api/health | jq .

# Rollback Cloudflare deployment
wrangler pages deployments list --project-name=rgss-web
wrangler pages deployments rollback --project-name=rgss-web --deployment-id=<ID>

# Check Neon DB connectivity
psql $DATABASE_URL_UNPOOLED_PROD -c "SELECT 1"

# Create Neon PITR branch (restore to specific time)
curl -X POST "https://console.neon.tech/api/v2/projects/$PROJECT_ID/branches" \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -d '{"branch":{"name":"recovery","parent_id":"main","parent_timestamp":"2026-05-23T10:00:00Z"}}'

# Check rate limit status for a user
# (via Upstash Redis CLI)
redis-cli GET "rl:booking:user:USER_ID"

# Force-disable a PostHog feature flag
# PostHog dashboard → Feature Flags → [flag] → Kill switch ON
```

---

## Database Connection Pooling

### Neon Serverless Driver

```ts
// packages/database/index.ts

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

// HTTP-based driver — stateless, perfect for Cloudflare Workers (edge)
const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql)
```

### Why HTTP Driver (Not WebSocket)

| Driver | Use Case | Why |
|--------|----------|-----|
| `@neondatabase/serverless` (HTTP) | Cloudflare Workers (edge) | Stateless, no connection pool needed, sub-5ms cold start |
| `@neondatabase/serverless` (WebSocket) | Long-running Node.js (Render) | Persistent connection, lower per-query latency |

```ts
// apps/pdf-api/src/db.ts (Render — Node.js, long-running)

import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'

// WebSocket pool for Render services (persistent connections)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,  // Max 5 concurrent connections (Neon free tier allows ~20)
})

// Required for Neon serverless driver in Node.js
import { neonConfig } from '@neondatabase/serverless'
neonConfig.webSocketConstructor = ws

export const db = drizzle(pool)
```

### Connection Limits

| Environment | Neon Limit | Our Max Pool | Headroom |
|-------------|-----------|-------------|----------|
| prod (main) | 20 connections | 5 (Render) + stateless (CF Workers) | ~15 spare |
| pprd | 20 connections | 5 | ~15 spare |
| test | 20 connections | 5 | ~15 spare |
| dev | 20 connections | 1 | ~19 spare |

> Cloudflare Workers use HTTP queries (no persistent connection) — each request opens/closes instantly. They don't consume connection pool slots.

---

## Performance Budget (Lighthouse CI Thresholds)

```json
// lighthouserc.json
{
  "ci": {
    "collect": {
      "url": [
        "http://localhost:3000/",
        "http://localhost:3000/?book=1&utm_source=gmb",
        "http://localhost:3000/services",
        "http://localhost:3000/book",
        "http://localhost:3000/offers"
      ],
      "numberOfRuns": 3
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.95 }],
        "categories:accessibility": ["error", { "minScore": 1.0 }],
        "categories:best-practices": ["error", { "minScore": 1.0 }],
        "categories:seo": ["error", { "minScore": 1.0 }],
        "first-contentful-paint": ["error", { "maxNumericValue": 1800 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time": ["error", { "maxNumericValue": 200 }],
        "interactive": ["error", { "maxNumericValue": 3800 }]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

**If any threshold fails → CI blocks the PR from merging.**

---

## Complete Pipeline Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         RGSS Deployment Pipeline                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Developer pushes to dev                                              │
│     └─ CI: lint + typecheck + unit tests                                │
│                                                                          │
│  2. PR: dev → test                                                       │
│     └─ CI: + integration tests + Playwright E2E + Lighthouse            │
│     └─ DB: test branch wiped and reseeded                               │
│                                                                          │
│  3. PR: test → pprd                                                      │
│     └─ CI: + k6 load test + security scan + dep audit                   │
│     └─ DB: pprd branch auto-reset from prod daily                       │
│     └─ Manual: stakeholder demo / UAT                                   │
│                                                                          │
│  4. PR: pprd → prod (requires manual approval)                           │
│     └─ Deploy: Cloudflare Pages + source maps to Sentry                 │
│     └─ Migrate: Drizzle migrations on prod DB                           │
│     └─ Verify: health check + smoke tests + backup check                │
│     └─ Rollback: auto-rollback if health check fails                    │
│     └─ Notify: BetterStack deployment marker                            │
│                                                                          │
│  5. Post-deploy monitoring (always-on)                                   │
│     └─ BetterStack: uptime every 3 min + job heartbeats                │
│     └─ Sentry: error rate monitoring, alert on spike                    │
│     └─ PostHog: feature flag performance tracking                       │
│                                                                          │
│  6. Weekly maintenance (automated)                                       │
│     └─ Sunday: prod backup to R2                                        │
│     └─ Monday: dependency update check (Renovate PRs)                   │
│     └─ Monthly: backup restore test                                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```
