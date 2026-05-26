# Observability, Analytics & Monitoring

## Five Distinct Layers

| Layer | Question It Answers | Tool Chosen |
|-------|-------------------|-------------|
| **Error Monitoring** | What broke and why? Stack traces, error context | **Sentry** |
| **Uptime + Status + Logs + Jobs** | Is the site up? Did scheduled jobs run? | **BetterStack** |
| **Product Analytics** | How do users behave? Where do they drop off? | **PostHog** |
| **Heatmaps + Session Replay** | What did the user actually do on screen? | **Microsoft Clarity** |
| **Synthetic Monitoring** | Does the app actually work from a real browser? | **Checkly** |

**Total monthly cost: ₹0**

---

## Layer 1 — Error Monitoring: Sentry

**Why Sentry:**
- Industry standard for Next.js — official SDK, first-class Cloudflare Workers support
- When an API route throws at 2am, Sentry sends an alert with full stack trace, user context, and request payload
- Captures errors from both Cloudflare Workers (edge) and Render (Node.js/Payload CMS)
- Source maps support — errors point to original TypeScript lines, not minified output

**Free tier:** 5,000 errors/month — more than sufficient at launch for a salon app.

**Alternatives evaluated:**
| Tool | Reason Not Chosen |
|------|------------------|
| Highlight.io | Smaller community, fewer Next.js examples |
| Datadog APM | $31/host/mo — eliminated entirely |
| BetterStack Logs | Log aggregation, not error tracking with stack traces |

**What Sentry captures:**
- Unhandled API route exceptions
- Client-side React errors
- Edge Worker errors (Cloudflare)
- Performance traces (slow DB queries, slow API responses)

---

## Layer 2 — Uptime, Status Page, Logs & Job Monitoring: BetterStack

**Why BetterStack over alternatives:**

BetterStack replaces three separate tools (UptimeRobot + Cronitor + a log tool) in one platform with a single dashboard:

| BetterStack Product | What It Does | Free Tier |
|--------------------|-------------|-----------|
| **Uptime** | HTTP monitors for every endpoint | 10 monitors |
| **Status Page** | Public `status.theroyalglow.in` — customers see it during outages | ✅ Free, custom domain |
| **Heartbeats** | Scheduled job monitoring — alert if pg_cron, QStash, or GitHub Actions jobs miss their window | ✅ Free |
| **Logs** | Ship Cloudflare Workers + Render logs, searchable | 1 GB/mo free |

### Monitors Required (10 of 10 free slots used)

| Monitor | Endpoint | Type |
|---------|----------|------|
| Homepage | `theroyalglow.in` | HTTP |
| GMB booking dialog deep link | `theroyalglow.in/?book=1&utm_source=gmb` | HTTP |
| In-store QR booking dialog deep link | `theroyalglow.in/?book=1&utm_source=walkin` | HTTP |
| Campaign lead page | `theroyalglow.in/book` | HTTP |
| API health | `theroyalglow.in/api/health` | HTTP |
| Payload CMS admin | `admin.theroyalglow.in` | HTTP |
| Neon DB probe | Via API health endpoint | HTTP |
| Ably connectivity | Via test endpoint | HTTP |
| Upstash Redis probe | Via API probe | HTTP |
| Cloudflare R2 probe | Via test asset endpoint | HTTP |

All free BetterStack HTTP monitor slots are used at launch. If another production endpoint needs uptime monitoring, consolidate the two booking dialog deep-links into one monitor or upgrade.

### Heartbeat Monitors for Scheduled Jobs

Scheduled work pings a BetterStack heartbeat URL on successful completion. This covers DB-only pg_cron jobs, QStash schedulers, and the GitHub Actions preprod sync. If BetterStack doesn't receive the ping within the expected window, it fires an alert.

| Heartbeat | Jobs Covered | Expected Window |
|-----------|--------------|----------------|
| `BETTER_STACK_HEARTBEAT_NIGHTLY_SALES` | Daily sales, offer expiry, monthly GST, gems auto-expire | Nightly/monthly after scheduled run |
| `BETTER_STACK_HEARTBEAT_MEMBERSHIP_EXPIRY` | Membership auto-expire + expiry alerts | Daily after scheduled run |
| `BETTER_STACK_HEARTBEAT_SESSION_CLEANUP` | Session cleanup | Weekly after scheduled run |
| `BETTER_STACK_HEARTBEAT_PREPROD_SYNC` | Prod → preprod branch reset + PII anonymization | Daily after GitHub Actions run |
| `BETTER_STACK_HEARTBEAT_REMINDERS` | Appointment reminders | Every 15 min |

### Check Interval: 3 Minutes
Free tier checks every 3 minutes. Average detection time ~1.5 minutes. Acceptable for a salon operating 10am–8pm — not a financial system requiring sub-30s detection.

**Upgrade path:** BetterStack Starter ($24/mo) for 30-second checks if needed post-launch.

---

## Layer 3 — Product Analytics: PostHog

**Why PostHog:**
- 1 million events/month free — won't hit this limit for a very long time at salon scale
- Covers the full funnel: page views → service browsing → booking → conversion
- Session replay — watch exactly what a user did before dropping off the booking flow
- Feature flags — A/B test offers (e.g., "Free consultation" vs "20% off first visit") without deploying new code
- Funnels — identify drop-off in booking flow
- Cohort analysis — customers acquired via Meta campaign vs organic vs GMB vs in-store QR

**Key events to track for Royal Glow:**

| Event | Trigger |
|-------|---------|
| `page_view` | Every page |
| `service_viewed` | Customer opens a service detail |
| `booking_started` | Customer opens the homepage booking dialog |
| `booking_step_completed` | Each step of booking flow |
| `booking_request_submitted` | Customer submits normal booking flow; booking row created as `pending` |
| `booking_confirmed` | Receptionist/manager approves and assigns the booking |
| `booking_completed` | Service completed and invoice generated |
| `booking_abandoned` | Left booking mid-flow |
| `lead_form_submitted` | Meta/Instagram landing form submitted; lead row created |
| `lead_converted_to_booking` | Captured lead later links to a booking |
| `offer_clicked` | Any promotional banner click |

**Funnels to build:**
1. Organic root-domain discovery → Homepage → Book Now clicked → Dialog opened → Booking request submitted → Booking confirmed
2. GMB/Google Maps → `/?book=1&utm_source=gmb` → Dialog auto-opened → Booking request submitted → Booking confirmed
3. In-store QR → `/?book=1&utm_source=walkin` → Sign in/onboarding → Dialog auto-opened → Booking request submitted → Booking confirmed
4. Meta/Instagram ad → `/book` lead form submitted → Lead created with source `meta_ad` → Homepage dialog via `leadId` → Lead converted to booking
5. Homepage → Services → Profile → Book

**Full analytics coverage — PostHog + Clarity handles everything:**

| Need | Covered By |
|------|-----------|
| Traffic, referrals, UTM tracking | PostHog ✅ |
| Booking funnel drop-off | PostHog ✅ |
| Meta campaign attribution | PostHog + CAPI ✅ |
| Session replay | PostHog ✅ |
| Feature flags / A/B offers | PostHog ✅ |
| Heatmaps | Microsoft Clarity ✅ |
| Lightweight script | Clarity is 2 KB; PostHog loads async |

**Alternatives evaluated:**
| Tool | Reason Not Chosen |
|------|------------------|
| Google Analytics 4 | Sends data to Google — GDPR/India DPDP Act concern |
| Plausible | No free tier ($9/mo), basic stats only |
| Umami | Self-hosted only, additional infra to manage |
| Mixpanel | Good, but PostHog's free tier is more generous and includes session replay |

---

## Layer 4 — Heatmaps & Session Replay: Microsoft Clarity

**Why Clarity alongside PostHog:**
- Completely free, no event caps, no session limits
- Heatmaps show where users click and scroll on every page
- Session recordings show full user journeys including rage clicks and dead clicks
- Complements PostHog — Clarity is better at visual heatmaps, PostHog is better at funnel analytics
- GDPR compliant, no PII captured in recordings

**What Clarity reveals:**
- Are users clicking the booking CTA or ignoring it?
- How far do users scroll on the services page?
- Where do users get confused on the booking form?
- Which parts of the homepage get the most attention?

---

## Complete Observability Stack Summary

| Tool | Layer | Free Tier | Monthly Cost |
|------|-------|-----------|-------------|
| **Sentry** | Error monitoring | 5k errors/mo | ₹0 |
| **BetterStack** | Uptime + status page + job heartbeats + logs | 10 monitors, 1 GB logs | ₹0 |
| **PostHog** | Product analytics + funnels + feature flags + session replay | 1M events/mo | ₹0 |
| **Microsoft Clarity** | Heatmaps + session recordings | Unlimited | ₹0 |
| **Checkly** | Synthetic monitoring (real browser checks) | 5 checks, 10K runs/mo | ₹0 |
| **Total** | | | **₹0/mo** |

---

## Layer 5 — Synthetic Monitoring: Checkly

**Why Checkly alongside BetterStack:**

BetterStack answers "Is the server responding?" (HTTP 200 check). **Checkly** answers "Does the app actually work?" — it runs real Playwright scripts against production on a schedule.

| What | BetterStack | Checkly |
|------|-------------|---------|
| Check type | HTTP ping (is it up?) | Real browser interaction (does it work?) |
| Detects | Server down, timeouts, 5xx | JS errors, broken UI flows, auth failures |
| Speed | Every 3 min | Every 5–30 min |
| Scripts | None needed | Playwright test scripts |

**Free tier:** 5 checks, 10,000 check runs/month — sufficient for key user journeys.

**RGSS Checkly Checks:**

| # | Check | Schedule | Validates |
|---|-------|----------|-----------|
| 1 | Homepage loads + services render | Every 10 min | CDN + SSR |
| 2 | Homepage booking dialog: slots load for tomorrow (`?book=1`) | Every 15 min | API + DB |
| 3 | Sign-in page renders | Every 30 min | Auth system |
| 4 | Admin dashboard loads (with auth) | Every 30 min | Protected routes |
| 5 | API health + response < 500ms | Every 5 min | System health |

> See [testing.md](./testing.md) for the full testing and monitoring strategy.

---

## Upgrade Path

| When | Upgrade |
|------|---------|
| Errors exceed 5k/mo | Sentry Team $26/mo |
| Need <30s uptime checks | BetterStack Starter $24/mo |
| Need unlimited analytics | PostHog paid (scales by event volume) |

All upgrades are triggered by growth — not required at launch.
