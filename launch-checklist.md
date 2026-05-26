# Launch Checklist — Production Readiness Review (PRR)

> **Estimated Time:** 2–3 hours (execution on launch day)  
> **Preparation:** 3 days before launch  
> **Style:** Inspired by Google PRR, Meta Launch Checklist, Amazon Operational Readiness Review

---

## Launch Timeline Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    RGSS LAUNCH TIMELINE                                      │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  T-72h (3 days before)                                                      │
│  ├─ External service onboarding complete                                   │
│  ├─ All API keys in GitHub Secrets + Cloudflare                            │
│  └─ DNS propagation started                                                 │
│                                                                             │
│  T-48h (2 days before)                                                      │
│  ├─ Production data seeded                                                  │
│  ├─ Monitoring configured + verified                                       │
│  └─ SSL certificates confirmed                                             │
│                                                                             │
│  T-24h (1 day before)                                                       │
│  ├─ Full E2E test suite passing                                            │
│  ├─ Load testing complete (k6)                                             │
│  ├─ Lighthouse 100% across all pages                                       │
│  └─ Go/No-Go decision                                                      │
│                                                                             │
│  T-2h (Launch Day — morning)                                                │
│  ├─ Final smoke test on pprd                                               │
│  ├─ Production deploy                                                       │
│  └─ Feature flags configured                                               │
│                                                                             │
│  T-0 (GO LIVE)                                                              │
│  ├─ DNS cutover (if needed)                                                │
│  ├─ Feature flags: enable for 100%                                         │
│  └─ Status page: OPERATIONAL                                               │
│                                                                             │
│  T+1h (Post-launch)                                                         │
│  ├─ Health checks green                                                     │
│  ├─ Sentry: no new errors                                                  │
│  └─ First real booking test                                                │
│                                                                             │
│  T+24h (Day after)                                                          │
│  ├─ Analytics data flowing                                                  │
│  ├─ Email delivery confirmed                                               │
│  └─ Launch retrospective                                                    │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## T-72h: External Service Onboarding

### Authentication — Better Auth (Google OAuth)

| # | Task | Verify |
|---|------|--------|
| 1 | Create Google Cloud project `rgss-production` | Console accessible |
| 2 | Enable Google Identity API | API status: Enabled |
| 3 | Create OAuth 2.0 Client ID (Web application) | Client ID generated |
| 4 | Set authorized redirect URI: `https://theroyalglow.in/api/auth/callback/google` | URI saved |
| 5 | Set authorized JavaScript origin: `https://theroyalglow.in` | Origin saved |
| 6 | Request OAuth consent screen verification (production) | Submitted |
| 7 | Store `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` | In Cloudflare Pages env vars |

### Email — Resend

| # | Task | Verify |
|---|------|--------|
| 1 | Create Resend account + verify email | Account active |
| 2 | Add domain `theroyalglow.in` | DNS records added |
| 3 | Verify domain (DKIM, SPF, DMARC) | Status: Verified ✅ |
| 4 | Set sending address: `Royal Glow <hello@theroyalglow.in>` | Test email received |
| 5 | Generate production API key | Key stored securely |
| 6 | Store `RESEND_API_KEY` | In Cloudflare Pages env vars |
| 7 | Configure webhook URL: `https://theroyalglow.in/api/webhooks/resend` | Webhook active |

### Email Marketing — Brevo

| # | Task | Verify |
|---|------|--------|
| 1 | Create Brevo account (free tier — 300 emails/day) | Account active |
| 2 | Verify sender domain `theroyalglow.in` | DKIM + DMARC verified |
| 3 | Create 5 email templates (see email-strategy.md) | Templates saved |
| 4 | Set up automation workflows (birthday, re-engagement, etc.) | Workflows active |
| 5 | Create contact lists (All, Active, VIP, Dormant, Birthdays) | Lists created |
| 6 | Generate API key | Key stored |
| 7 | Store `BREVO_API_KEY` | In Cloudflare Pages env vars |
| 8 | Configure webhook URL: `https://theroyalglow.in/api/webhooks/brevo` | Webhook active |

### Realtime — Ably

| # | Task | Verify |
|---|------|--------|
| 1 | Create Ably app `rgss-production` | App created |
| 2 | Note API key (root key for server-side) | Key generated |
| 3 | Configure channel rules: `bookings:*`, `notifications:*`, `queue:*` | Rules set |
| 4 | Set capability restrictions (publish/subscribe per channel) | Capabilities locked |
| 5 | Store `ABLY_PRIVATE_KEY` | In Cloudflare Pages env vars |
| 6 | Store `NEXT_PUBLIC_ABLY_KEY` (subscribe-only key) | In Cloudflare Pages env vars |

### WhatsApp — AiSensy

| # | Task | Verify |
|---|------|--------|
| 1 | Create AiSensy account | Account active |
| 2 | Register WhatsApp Business number | Number verified |
| 3 | Create message templates (booking confirm, reminder, feedback) | Templates approved by Meta |
| 4 | Generate API key | Key stored |
| 5 | Store `AISENSY_API_KEY` | In Cloudflare Pages env vars |
| 6 | Test WhatsApp delivery to test number | Message received |

### Analytics — PostHog

| # | Task | Verify |
|---|------|--------|
| 1 | Create PostHog project `rgss-production` | Project created |
| 2 | Note project API key | Key generated |
| 3 | Store `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` | In Cloudflare Pages env vars |
| 4 | Create feature flags (all OFF initially) | Flags created |
| 5 | Set up dashboards: Bookings, Revenue, User Funnel | Dashboards created |
| 6 | Configure session recording (opt-in, exclude admin pages) | Recording configured |
| 7 | Verify events flowing (test from pprd) | Events visible in PostHog |

### Heatmaps — Microsoft Clarity

| # | Task | Verify |
|---|------|--------|
| 1 | Create Clarity project | Project ID generated |
| 2 | Store `NEXT_PUBLIC_CLARITY_ID` | In Cloudflare Pages env vars |
| 3 | Set up masking rules (PII fields: phone, email, name) | Rules active |
| 4 | Verify recording (test from pprd) | Session visible in Clarity |

### Ads — Meta Pixel

| # | Task | Verify |
|---|------|--------|
| 1 | Create Meta Pixel in Business Manager | Pixel ID generated |
| 2 | Store `NEXT_PUBLIC_META_PIXEL_ID` | In Cloudflare Pages env vars |
| 3 | Configure Conversions API (CAPI) for server-side events | CAPI token stored |
| 4 | Set up standard events: ViewContent, Lead, Schedule, Purchase | Events mapped |
| 5 | Verify with Meta Pixel Helper extension | Events firing |

### Error Tracking — Sentry

| # | Task | Verify |
|---|------|--------|
| 1 | Create Sentry project `rgss-web` (Next.js) | Project created |
| 2 | Note DSN | DSN generated |
| 3 | Store `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` | In Cloudflare Pages + GH Actions |
| 4 | Configure alert rules (see error-handling.md) | Alerts created |
| 5 | Set up source map uploads in deploy workflow | Working in CI |
| 6 | Test error capture (throw test error on pprd) | Error appears in Sentry |

### Uptime & Monitoring — BetterStack

| # | Task | Verify |
|---|------|--------|
| 1 | Create BetterStack account | Account active |
| 2 | Add uptime monitor: `https://theroyalglow.in/api/health` (3 min interval) | Monitor green |
| 3 | Add uptime monitor: `https://admin.theroyalglow.in` (5 min interval) | Monitor green |
| 4 | Create status page: `status.theroyalglow.in` | Page accessible |
| 5 | Set up heartbeat URLs for cron jobs | Heartbeat IDs generated |
| 6 | Store heartbeat URLs in Cloudflare env vars | Stored |
| 7 | Configure alert escalation (push → SMS after 5 min) | Tested |
| 8 | Connect Sentry integration | Sentry errors visible in BetterStack |

### Storage — Cloudflare R2

| # | Task | Verify |
|---|------|--------|
| 1 | Create R2 bucket: `rgss-invoices` | Bucket created |
| 2 | Create R2 bucket: `rgss-backups` | Bucket created |
| 3 | Generate R2 API tokens (read/write for invoices, write for backups) | Tokens generated |
| 4 | Store `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | In Cloudflare Pages env vars |
| 5 | Configure CORS on `rgss-invoices` (allow theroyalglow.in) | CORS set |
| 6 | Set lifecycle rule on `rgss-backups`: delete after 90 days | Rule active |

### Cache & Queue — Upstash

| # | Task | Verify |
|---|------|--------|
| 1 | Create Upstash Redis database (region: ap-south-1) | DB created |
| 2 | Store `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | In Cloudflare Pages env vars |
| 3 | Create QStash topic for async jobs | Topic created |
| 4 | Store `QSTASH_TOKEN` + `QSTASH_CURRENT_SIGNING_KEY` + `QSTASH_NEXT_SIGNING_KEY` | Stored |
| 5 | Test rate limiting from pprd | 429 returned correctly |

### PDF Generation — Render

| # | Task | Verify |
|---|------|--------|
| 1 | Create Render web service `rgss-pdf-api` | Service running |
| 2 | Set environment: Node.js, region: Singapore (nearest to Bengaluru) | Configured |
| 3 | Set env vars: `DATABASE_URL`, `R2_*` keys | In Render dashboard |
| 4 | Configure health check: `/health` | Green |
| 5 | Set auto-deploy: OFF (manual deploy only) | Manual mode |
| 6 | Store `PDF_API_URL` | In Cloudflare Pages env vars |
| 7 | Test invoice PDF generation from pprd | PDF generated + stored in R2 |

### Database — Neon

| # | Task | Verify |
|---|------|--------|
| 1 | Create Neon project `rgss-production` | Project created |
| 2 | Create branches: `main` (prod), `pprd`, `test`, `dev` | All 4 branches exist |
| 3 | Note connection strings for each branch | Strings stored |
| 4 | Store `DATABASE_URL` (prod) in Cloudflare Pages (Production env) | Stored |
| 5 | Store all branch URLs in GitHub Secrets | Stored |
| 6 | Run initial migration: `bun run db:migrate` | Schema created |
| 7 | Verify PITR (Point-in-Time Recovery) enabled | Enabled (7-day window) |
| 8 | Test connection from Cloudflare Worker (HTTP driver) | Query succeeds |

---

## T-72h: Environment Setup

### GitHub Repository Secrets

```
# Authentication
GOOGLE_OAUTH_CLIENT_ID=<from Google Cloud Console>
GOOGLE_OAUTH_CLIENT_SECRET=<from Google Cloud Console>

# Database
DATABASE_URL_PROD=<Neon main branch>
DATABASE_URL_PPRD=<Neon pprd branch>
DATABASE_URL_TEST=<Neon test branch>

# Email
RESEND_API_KEY=<from Resend dashboard>
BREVO_API_KEY=<from Brevo dashboard>

# Monitoring
SENTRY_AUTH_TOKEN=<from Sentry settings>
SENTRY_ORG=rgss
SENTRY_PROJECT=rgss-web

# Deployment
CLOUDFLARE_API_TOKEN=<from Cloudflare dashboard>
CLOUDFLARE_ACCOUNT_ID=<from Cloudflare dashboard>
NEON_API_KEY=<from Neon dashboard>
RENDER_API_KEY=<from Render dashboard>

# Notifications (for deploy alerts)
BETTERSTACK_API_TOKEN=<from BetterStack>
```

### Cloudflare Pages — Production Environment Variables

```
# App
APP_ENV=prod
NEXT_PUBLIC_APP_URL=https://theroyalglow.in
NEXT_PUBLIC_CMS_URL=https://admin.theroyalglow.in

# Auth
GOOGLE_OAUTH_CLIENT_ID=<value>
GOOGLE_OAUTH_CLIENT_SECRET=<value>
BETTER_AUTH_SECRET=<generated: openssl rand -base64 32>
BETTER_AUTH_URL=https://theroyalglow.in

# Database
DATABASE_URL=<Neon prod connection string>

# Email
RESEND_API_KEY=<value>
BREVO_API_KEY=<value>

# Realtime
ABLY_PRIVATE_KEY=<value>
NEXT_PUBLIC_ABLY_KEY=<subscribe-only key>

# WhatsApp
AISENSY_API_KEY=<value>

# Storage
R2_ACCOUNT_ID=<value>
R2_ACCESS_KEY_ID=<value>
R2_SECRET_ACCESS_KEY=<value>
R2_INVOICES_BUCKET=rgss-invoices
R2_BACKUPS_BUCKET=rgss-backups

# Cache & Queue
UPSTASH_REDIS_REST_URL=<value>
UPSTASH_REDIS_REST_TOKEN=<value>
QSTASH_TOKEN=<value>
QSTASH_CURRENT_SIGNING_KEY=<value>
QSTASH_NEXT_SIGNING_KEY=<value>

# PDF Service
PDF_API_URL=https://rgss-pdf-api.onrender.com

# Analytics & Tracking
NEXT_PUBLIC_POSTHOG_KEY=<value>
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_CLARITY_ID=<value>
NEXT_PUBLIC_META_PIXEL_ID=<value>
META_PIXEL_ACCESS_TOKEN=<value>

# Error Tracking
NEXT_PUBLIC_SENTRY_DSN=<value>

# Monitoring
BETTERSTACK_HEARTBEAT_BOOKING_CLEANUP=<URL>
BETTERSTACK_HEARTBEAT_BREVO_SYNC=<URL>
BETTERSTACK_HEARTBEAT_BACKUP=<URL>
```

### Cloudflare Pages — Project Configuration

| Setting | Value |
|---------|-------|
| Project name | `rgss-web` |
| Production branch | `prod` (git branch that Cloudflare Pages watches for production deploys) |
| Preview branches | `dev`, `test`, `pprd` |
| Build command | `bun run build` |
| Build output directory | `.next` |
| Root directory | `apps/web` |
| Node.js version | `20.x` |
| Compatibility flags | `nodejs_compat` |
| Custom domains | `theroyalglow.in`, `www.theroyalglow.in` |

### Render — PDF API Service Configuration

| Setting | Value |
|---------|-------|
| Service name | `rgss-pdf-api` |
| Environment | Node.js |
| Region | Singapore |
| Instance type | Starter ($7/mo) |
| Build command | `bun install && bun run build` |
| Start command | `bun run start` |
| Health check path | `/health` |
| Auto-deploy | OFF |

---

## T-72h: DNS & Domain Setup

### Domain: `theroyalglow.in`

| Record | Type | Name | Value | Proxy |
|--------|------|------|-------|-------|
| Root | CNAME | `@` | `rgss-web.pages.dev` | ☁️ Proxied |
| WWW | CNAME | `www` | `rgss-web.pages.dev` | ☁️ Proxied |
| Admin | CNAME | `admin` | `rgss-web.pages.dev` | ☁️ Proxied |
| Status | CNAME | `status` | `betteruptime.com` (BetterStack) | DNS only |
| Email (MX) | MX | `@` | `feedback-smtp.us-east-1.amazonses.com` (Resend) | — |
| Email (SPF) | TXT | `@` | `v=spf1 include:amazonses.com ~all` | — |
| Email (DKIM) | CNAME | `resend._domainkey` | `<from Resend dashboard>` | DNS only |
| Email (DMARC) | TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@theroyalglow.in` | — |

### Cloudflare Settings

| Setting | Value |
|---------|-------|
| SSL/TLS mode | Full (strict) |
| Always Use HTTPS | ON |
| Minimum TLS Version | 1.2 |
| HTTP/3 (QUIC) | ON |
| Brotli compression | ON |
| Early Hints | ON |
| Auto Minify | JS + CSS + HTML |
| Browser Cache TTL | 4 hours |
| Caching Level | Standard |
| Rocket Loader | OFF (conflicts with Next.js) |

### SSL Verification

```bash
# Verify SSL is active (after DNS propagation — can take up to 24h)
curl -vI https://theroyalglow.in 2>&1 | grep "SSL certificate"
# Expected: SSL certificate verify ok

# Verify redirect
curl -I http://theroyalglow.in
# Expected: 301 → https://theroyalglow.in

# Verify www redirect
curl -I https://www.theroyalglow.in
# Expected: 301 → https://theroyalglow.in
```

---

## T-48h: Production Data Seeding

### Seed Execution Order

Run in this exact order (respects FK constraints):

```bash
# Connect to prod Neon branch
export DATABASE_URL=$DATABASE_URL_PROD

# 1. Core data (MUST be first)
bun run scripts/seed.ts --env=prod --only=branches        # 2 branches
bun run scripts/seed.ts --env=prod --only=roles           # admin, receptionist, staff
bun run scripts/seed.ts --env=prod --only=settings        # system settings (business hours, etc.)

# 2. Service catalog
bun run scripts/seed.ts --env=prod --only=categories      # 10 categories
bun run scripts/seed.ts --env=prod --only=services        # ~40 salon + 23 SPA services
bun run scripts/seed.ts --env=prod --only=packages        # combo packages

# 3. Staff
bun run scripts/seed.ts --env=prod --only=staff           # 7 staff members (real data from owner)

# 4. Membership & Loyalty
bun run scripts/seed.ts --env=prod --only=memberships     # 3 tiers (Silver, Gold, Platinum)
bun run scripts/seed.ts --env=prod --only=loyalty         # Gems earning/redemption rules

# 5. Offers (only if launching with active offers)
bun run scripts/seed.ts --env=prod --only=offers          # Launch offer (optional)
```

### Seed Data Verification

```bash
# Verify counts
bun run scripts/verify-seed.ts --env=prod

# Expected output:
# ✅ Branches: 2
# ✅ Categories: 10
# ✅ Services: 63
# ✅ Staff: 7
# ✅ Membership tiers: 3
# ✅ System settings: configured
# ✅ Roles: 3
# ❌ Customers: 0 (correct — no demo data in prod)
# ❌ Bookings: 0 (correct — clean slate)
```

### First Admin User Creation

```bash
# Create the first admin user via one-time script
bun run scripts/create-admin.ts \
  --email="owner@theroyalglow.in" \
  --name="Royal Glow Admin" \
  --role=admin

# This creates the user record that will be linked
# when the owner first signs in with Google OAuth.
# The Google account email must match exactly.
```

**Post-creation verification:**
1. Open `https://theroyalglow.in` in incognito
2. Click "Sign in with Google"
3. Use the owner's Google account (`owner@theroyalglow.in`)
4. Verify redirect to admin dashboard
5. Verify role shows as "Admin"

---

## T-24h: Pre-Launch Testing

### Lighthouse Audit (Target: 100% All Categories)

```bash
# Run Lighthouse CI against pprd (which mirrors prod config)
bunx lhci autorun --config=lighthouserc.json \
  --collect.url="https://pprd.theroyalglow.in/" \
  --collect.url="https://pprd.theroyalglow.in/?book=1&utm_source=gmb" \
  --collect.url="https://pprd.theroyalglow.in/services" \
  --collect.url="https://pprd.theroyalglow.in/book" \
  --collect.url="https://pprd.theroyalglow.in/offers" \
  --collect.url="https://pprd.theroyalglow.in/membership"
```

**Required scores (must ALL be 100 or action needed):**

| Page | Performance | Accessibility | Best Practices | SEO |
|------|------------|---------------|----------------|-----|
| `/` (Home) | ≥ 95 | 100 | 100 | 100 |
| `/?book=1` (Normal booking dialog) | ≥ 95 | 100 | 100 | 100 |
| `/services` | ≥ 95 | 100 | 100 | 100 |
| `/book` (Campaign lead capture) | ≥ 95 | 100 | 100 | 100 |
| `/offers` | ≥ 95 | 100 | 100 | 100 |
| `/membership` | ≥ 95 | 100 | 100 | 100 |

> Performance ≥95 is acceptable because Cloudflare edge caching makes real-world performance faster than synthetic tests.

### E2E Test Suite (Playwright)

```bash
# Full E2E suite against pprd
bunx playwright test --project=chromium --project=firefox --project=webkit

# Critical user journeys that MUST pass:
# ✅ Customer: Browse services → Select slot → Book → Receive confirmation
# ✅ Customer: View membership plans → Sign up → Verify Gems
# ✅ Customer: Cancel booking → Receive cancellation email
# ✅ Admin: Sign in → View dashboard → See today's bookings
# ✅ Admin: Complete booking → Generate invoice → PDF stored in R2
# ✅ Admin: Create walk-in booking → Assign staff → Bill → Mark paid
# ✅ Admin: View customer profile → Booking history → Membership status
# ✅ Receptionist: Mark attendance → Start service → Complete → Bill
# ✅ System: Slot conflict prevention (double-booking blocked)
# ✅ System: Booking reminder trigger (QStash)
# ✅ System: Rate limiting (429 on excess requests)
```

**All tests MUST pass. Zero failures tolerated for launch.**

### Load Testing (k6)

```bash
# Run k6 load test against pprd
k6 run tests/load/booking-flow.js --env TARGET=https://pprd.theroyalglow.in
```

```javascript
// tests/load/booking-flow.js
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // Ramp up to 20 users
    { duration: '1m', target: 50 },    // Peak: 50 concurrent (10x expected max)
    { duration: '30s', target: 100 },  // Stress: 100 concurrent (20x expected)
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],  // 95th < 500ms, 99th < 1s
    http_req_failed: ['rate<0.01'],                   // <1% error rate
    http_reqs: ['rate>100'],                          // >100 req/sec throughput
  },
}

export default function () {
  // Simulate real user flow
  const home = http.get(`${__ENV.TARGET}/`)
  check(home, { 'homepage 200': (r) => r.status === 200 })

  sleep(1)

  const services = http.get(`${__ENV.TARGET}/api/services`)
  check(services, { 'services 200': (r) => r.status === 200 })

  sleep(0.5)

  const availability = http.get(`${__ENV.TARGET}/api/availability/2026-05-25`)
  check(availability, { 'availability 200': (r) => r.status === 200 })

  sleep(2)
}
```

**Pass criteria:**
- p95 latency < 500ms
- p99 latency < 1000ms
- Error rate < 1%
- Zero 5xx errors
- Rate limiting kicks in correctly at threshold

### Security Scan

```bash
# OWASP ZAP baseline scan
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t https://pprd.theroyalglow.in -r zap-report.html

# Trivy vulnerability scan
trivy fs . --severity HIGH,CRITICAL --exit-code 1

# Expected: ZERO high/critical vulnerabilities
```

---

## T-48h: Monitoring Setup Verification

### Sentry Configuration

| Check | How to Verify |
|-------|--------------|
| Source maps uploading | Deploy to pprd → check Sentry releases |
| Error capture working | `throw new Error('sentry-test')` on pprd → appears in Sentry |
| Alert rules configured | See error-handling.md alert rules |
| Performance monitoring ON | Transactions appearing in Sentry Performance |
| User context enriched | Errors show user email + role |
| Environment tag correct | Filter by `env:prod` works |

### BetterStack Heartbeat URLs

| Cron Job | Heartbeat URL | Expected Interval |
|----------|--------------|-------------------|
| Booking reminder (hourly) | `https://uptime.betterstack.com/api/v1/heartbeat/<ID1>` | Every 1 hour |
| Brevo contact sync (daily) | `https://uptime.betterstack.com/api/v1/heartbeat/<ID2>` | Every 24 hours |
| Expired booking cleanup (daily) | `https://uptime.betterstack.com/api/v1/heartbeat/<ID3>` | Every 24 hours |
| Weekly backup (Sunday) | `https://uptime.betterstack.com/api/v1/heartbeat/<ID4>` | Every 7 days |

**Verification:** After heartbeat URLs are configured in env vars, trigger each cron job manually once → confirm BetterStack shows "healthy" for each heartbeat.

### PostHog Dashboards

Create these dashboards before launch:

| Dashboard | Panels |
|-----------|--------|
| **Overview** | DAU, WAU, MAU, page views, sessions |
| **Bookings** | Bookings/day, conversion funnel (visit → service page → homepage booking dialog → confirm), drop-off points |
| **Revenue** | Invoices/day, avg invoice value, payment method split (cash/upi/card), membership revenue |
| **User Funnel** | New signups/day, Google OAuth success rate, repeat booking rate |
| **Feature Flags** | Flag exposure count, feature adoption rate |

---

## T-2h: Launch Day Execution

### Final Pre-Deploy Smoke Test (pprd)

```
□ Visit https://pprd.theroyalglow.in — loads correctly
□ Sign in with Google OAuth — works
□ Browse services page — all 63 services listed
□ Check availability calendar — slots showing
□ Create a test booking — confirmation email received
□ Admin: complete the booking — invoice generated
□ Check R2: invoice PDF stored
□ Check Sentry: no new errors
□ Check BetterStack: all monitors green
□ Check PostHog: events flowing
```

### Production Deploy

```bash
# 1. Merge pprd → main (this triggers deploy-prod workflow)
git checkout main
git merge pprd --no-ff
git push origin main

# 2. GitHub Actions runs:
#    - CI checks (lint, typecheck, unit tests)
#    - Build
#    - Deploy to Cloudflare Pages
#    - Run migrations on prod DB
#    - Upload source maps to Sentry
#    - Health check + smoke tests
#    - Notify BetterStack

# 3. Monitor deployment in GitHub Actions (should take ~5 min)
```

### Feature Flag Configuration

| Flag | Initial State | Purpose |
|------|--------------|---------|
| `booking-enabled` | ON (100%) | Kill switch for booking system |
| `membership-enabled` | ON (100%) | Kill switch for membership signups |
| `offers-enabled` | ON (100%) | Kill switch for offers display |
| `whatsapp-notifications` | OFF → 10% → 100% | Gradual WhatsApp rollout |
| `gems-loyalty` | ON (100%) | Kill switch for loyalty program |
| `spa-services` | ON (100%) | Kill switch for SPA services |

---

## T-0: Go Live

### DNS Cutover (if domain was previously pointed elsewhere)

```bash
# If domain was on a holding page / coming soon:
# 1. Update Cloudflare DNS to point to Pages
# 2. Clear Cloudflare cache
# 3. Test from multiple locations (use https://check-host.net/)
```

### Status Page Update

```
BetterStack Status Page (status.theroyalglow.in):
  → Update all components to "Operational"
  → Post update: "Royal Glow Salon & Spa is now live! 🎉"
```

### Immediate Post-Launch Checks (within 5 minutes)

```
□ https://theroyalglow.in loads (< 2s LCP)
□ https://theroyalglow.in/api/health returns 200 + all green
□ https://admin.theroyalglow.in loads
□ https://status.theroyalglow.in shows all operational
□ Google OAuth login works (test with owner's account)
□ No errors in Sentry
□ BetterStack monitor: UP
□ Cloudflare Analytics: requests coming through
```

---

## T+1h: Post-Launch Verification

### Real User Test (Golden Path)

Perform a real booking flow with the salon owner:

```
1. Owner opens theroyalglow.in on phone (mobile Chrome)
2. Tap Book Now or open `/?book=1` to launch the homepage booking dialog
3. Browse services → select "Hair Smoothening"
4. Select date + time slot + staff
5. Sign in with Google
6. Confirm booking
7. ✓ Confirmation page shown
8. ✓ Confirmation email received (check spam folder)
9. ✓ Booking appears in admin dashboard
10. ✓ WhatsApp message received (if enabled)

Admin side:
11. Receptionist signs in
12. Views today's bookings
13. Marks the test booking as "completed"
14. Generates invoice (Cash payment)
15. ✓ Invoice PDF stored in R2
16. ✓ Post-service thank you email sent
```

### Monitoring Dashboard Check

| System | Expected State |
|--------|---------------|
| BetterStack uptime | ✅ UP (green) |
| Sentry | ✅ 0 unresolved errors |
| PostHog | ✅ Events flowing (page_view, booking_created) |
| Cloudflare | ✅ Requests served, no 5xx |
| Neon | ✅ Connections active, queries < 50ms |
| Upstash Redis | ✅ Commands executing |
| Render (PDF API) | ✅ Healthy |

---

## T+24h: Day-After Verification

| Check | Verify |
|-------|--------|
| Booking reminder cron fired | BetterStack heartbeat healthy |
| Brevo contact sync ran | Heartbeat healthy + contacts in Brevo |
| Analytics data accurate | PostHog shows yesterday's sessions |
| Email deliverability | Check Resend dashboard — no bounces |
| No error spikes | Sentry quiet |
| Performance stable | Cloudflare analytics: avg response < 200ms |
| SSL renewal scheduled | Cloudflare auto-renews (verify date) |
| Backup ran (if Sunday) | R2 has backup file |

---

## Go / No-Go Decision Gates

### Gate 1: External Services Ready (T-72h)

| Criterion | Required | Status |
|-----------|----------|--------|
| All API keys generated and stored | Yes | □ |
| DNS propagation complete (< 24h TTL) | Yes | □ |
| Email domain verified (Resend + Brevo) | Yes | □ |
| Google OAuth consent screen approved | Yes | □ |
| WhatsApp templates approved by Meta | No (can launch without) | □ |
| Render PDF API health check passing | Yes | □ |

**Gate 1 Pass:** All "Yes" items checked → proceed to Gate 2.

### Gate 2: Testing Complete (T-24h)

| Criterion | Required | Status |
|-----------|----------|--------|
| E2E tests: 100% passing | Yes | □ |
| Lighthouse Performance ≥ 95 | Yes | □ |
| Lighthouse Accessibility = 100 | Yes | □ |
| Load test: p95 < 500ms | Yes | □ |
| Load test: 0 errors at 50 concurrent | Yes | □ |
| Security scan: 0 high/critical vulns | Yes | □ |
| Production data seeded + verified | Yes | □ |
| First admin user can sign in | Yes | □ |

**Gate 2 Pass:** All "Yes" items checked → proceed to Gate 3.

### Gate 3: Launch Day (T-2h)

| Criterion | Required | Status |
|-----------|----------|--------|
| pprd smoke test passing | Yes | □ |
| No active BetterStack incidents | Yes | □ |
| No critical Sentry errors (last 24h) | Yes | □ |
| Deploy freeze window check: OPEN | Yes | □ |
| Salon owner available for 2h post-launch | Yes | □ |
| Developer available for 4h post-launch | Yes | □ |
| Rollback plan reviewed and ready | Yes | □ |

**Gate 3 Pass:** All "Yes" items checked → **GO FOR LAUNCH** ✅

### No-Go Triggers (Automatic Block)

Any of these = **DO NOT LAUNCH**, fix first:

- ❌ Any E2E test failing
- ❌ Lighthouse Accessibility < 100
- ❌ Security scan has HIGH/CRITICAL findings
- ❌ Google OAuth not working
- ❌ Email delivery failing (Resend domain not verified)
- ❌ Database migration errors
- ❌ Health check endpoint returning unhealthy
- ❌ Load test showing > 1% error rate
- ❌ Rate limiting not working (can be DDoS'd)
- ❌ BetterStack monitor showing DOWN

---

## Post-Launch Stabilization (Week 1)

### Day 1-3: Hypercare Mode

```
• Monitor Sentry every 2 hours
• Check BetterStack every 4 hours
• Review PostHog funnel for drop-offs
• Be ready for instant rollback (Cloudflare < 30 sec)
• No new feature deploys — stability only
• Fix any issues found as hotfixes (dev → test → pprd → prod fast-track)
```

### Day 4-7: Stabilize

```
• Collect user feedback from salon owner
• Review Clarity heatmaps for UX issues
• Analyze booking conversion funnel
• Fine-tune rate limits if needed
• First weekly backup verification
• Prepare first sprint retrospective
```

### Week 1 Success Metrics

| Metric | Target |
|--------|--------|
| Uptime | > 99.9% (< 8.6 min downtime) |
| Sentry errors | < 5 unique issues |
| Avg response time | < 200ms |
| Booking conversion | > 60% (start → confirm) |
| Email delivery rate | > 98% |
| Page load (LCP) | < 2.5s |
| Zero security incidents | True |

---

## Launch Day Communication Template

### Stakeholder Notification (Send T-0)

```
Subject: 🚀 Royal Glow Salon & Spa — Website is LIVE!

Hi [Owner Name],

Great news — theroyalglow.in is now live and accepting bookings!

What's ready:
✅ Online booking system (all 63 services)
✅ Membership plans (Silver, Gold, Platinum)
✅ Gems loyalty program
✅ Invoice generation
✅ Email confirmations & reminders

What to do now:
1. Try booking a service: theroyalglow.in/?book=1
2. Sign in as admin: theroyalglow.in (use your Google account)
3. Check the admin dashboard

If anything feels off, let me know immediately — I'm monitoring everything for the next 4 hours.

Status page: status.theroyalglow.in
```
