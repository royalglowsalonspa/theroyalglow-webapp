# Database Strategy & Selection

## Final Decision: Neon DB as Primary Database

After a detailed comparison of all major serverless/managed database options, **Neon DB** is chosen as the primary database.

The single killer feature is **branching** — Neon treats database environments exactly like Git branches. One free project gives you **10 branches**, solving all 4 environments at zero cost.

---

## 4-Environment Setup (Neon Branches)

| Neon Branch | Environment | Purpose |
|-------------|-------------|---------|
| `main` | prod | Live data, protected, pg_cron runs here |
| `preprod` | pre-production | Auto-reset from main every 24h via GitHub Actions + Neon API, PII stripped |
| `test` | QA / CI | Seeded fixtures, wiped and reseeded on every CI run |
| `dev` | development | Developer sandbox, scales to zero when idle |

> No other free-tier database solves the 4-environment requirement in a single project.

---

## Full DB Comparison

### Serverless / Managed Databases

| Database | Engine | Branching | Cron | Drizzle Fit | Verdict |
|----------|--------|-----------|------|-------------|---------|
| **Neon DB** | PostgreSQL | ✅ 10 branches free | pg_cron native | ✅ Excellent | **Winner** |
| Supabase | PostgreSQL | ❌ 2 free projects only | pg_cron | ✅ Excellent | Eliminated as primary — R2 + Ably replace storage/realtime |
| Xata | PostgreSQL-compatible | ✅ Unlimited branches | ❌ None | ✅ Good | Strong alt, but no native cron |
| Turso | SQLite | ✅ 500 DBs | ❌ None | ✅ Good | SQLite limits complex booking/reporting queries |
| PlanetScale | MySQL | ❌ Free tier removed (2024) | ❌ | ✅ Good | Eliminated |
| Convex | Reactive NoSQL | ❌ 1 project | ✅ Built-in | ❌ Not SQL/Drizzle | No SQL, no relational schema — out |

### Cloudflare Data Stack (use alongside Neon)

| Product | Type | Free Tier | Use |
|---------|------|-----------|-----|
| **R2** | Object storage | 10 GB + 10M ops/mo | Profile photos, service images, PDF invoices ✅ |
| **KV** | Edge key-value | 100k reads/day | Static page cache, service listings ✅ |
| D1 | SQLite | 5 GB | Skip — SQLite limitations |
| Durable Objects | Stateful edge | Paid only | Not needed |

### Big Cloud (AWS / GCP / Azure)

Honest verdict: their free tiers are **12-month trials**, not permanent. After the trial you're paying full RDS / Cloud SQL pricing. They also require significant DevOps overhead (IAM, VPC, security groups, billing alerts) that kills solo developer velocity. Come back to big cloud when there is an SRE team. For now, Neon + Cloudflare delivers enterprise-grade infrastructure at zero ops cost.

---

## Why Each Option Was Eliminated

| Option | Reason Eliminated |
|--------|-------------------|
| Supabase (primary) | Only 2 free projects — not enough for 4 environments |
| Firebase | NoSQL, no Drizzle/relational schema fit |
| Convex | NoSQL reactive store — no SQL, no Drizzle schema, no relational model. Included only because it was explicitly requested for comparison. It never fit the stack. |
| PlanetScale | Removed free tier entirely in 2024 |
| Turso / Cloudflare D1 | SQLite underneath — no concurrent writes, weak JOIN performance at scale |
| CockroachDB | Serious distributed Postgres but serious overkill for a solo developer |
| Xata | Unlimited branches, strong free tier, but no built-in cron — external infra needed for business jobs |
| AWS / GCP / Azure | 12-month trial only; heavy DevOps overhead; expensive at scale |

---

## Redis — Do We Need It?

**Yes**, for three specific things:

| Use Case | Why |
|----------|-----|
| **Booking availability cache** | Customer opens the homepage booking dialog → don't hit DB for every slot. Cache available slots in Redis with 5-minute TTL |

**Availability cache — detailed flow:**

Computing available slots requires 3-4 DB queries per request (staff schedules + existing bookings + approved leave + slot computation). Without caching, 100 customers browsing at the same time means 300+ DB queries in seconds — Neon gets hammered and slot pickers feel slow.

```
Customer 1 picks a date (e.g., June 15th)
    ↓
GET /api/availability?date=2026-06-15&branch=RS
    ↓ Redis: cache MISS (key "availability:RS:2026-06-15" not found)
    ↓ Query Neon DB (3 queries) → compute free slots
    ↓ Response: [10:00, 11:00, 14:00, 15:00, 16:00]
    ↓ Store in Redis: key = "availability:RS:2026-06-15", TTL = 5 minutes
    ↓ Return to customer (first request: ~100ms)

Customer 2, 3, 4... (within next 5 min) pick same date
    ↓
GET /api/availability?date=2026-06-15&branch=RS
    ↓ Redis: cache HIT → return cached slots instantly (< 5ms)
    ↓ No DB query needed — Neon is not touched
```

**Cache invalidation — on booking confirm:**
```
Receptionist confirms booking for June 15th at 10:00
    ↓ Business logic: booking saved to Neon
    ↓ Invalidate: DELETE Redis key "availability:RS:2026-06-15"
    ↓ Next customer who checks June 15th gets fresh DB query (without 10:00 slot)
```

**Key format:** `availability:{branch_code}:{YYYY-MM-DD}` — one key per branch per date.

**TTL:** 5 minutes. Acceptable staleness window — worst case a slot shows as available for up to 5 min after being booked (the booking creation itself will fail with `BOOKING_SLOT_UNAVAILABLE` error if there's a race condition, so double-booking is impossible regardless of cache).

**Implementation priority:** Not needed on day one (< 50 customers/day, Neon handles it fine). Add in week 2-4 post-launch when traffic grows. ~30 minute implementation using `@upstash/redis` already in the stack.
| **API rate limiting** | Protect the booking API from abuse — critical for a premium service |
| **Background job queue** | Upstash QStash handles async job queuing elegantly |

> **NOT needed for search.** Postgres full-text search with the `pg_trgm` extension handles searching customers, services, and staff at this scale entirely inside Neon — for free. Upgrade to Algolia later if needed.

**Recommended: Upstash Redis**
- Serverless Redis — 10k requests/day free
- Works natively on Cloudflare Workers and Vercel Edge
- Upstash **QStash** included for background job queuing
- Zero servers to manage

---

## Scheduled Data & Operations Jobs

RGSS uses multiple scheduling mechanisms. `pg_cron` is only one of them, so this document keeps the summary high-level and treats [background-jobs.md](./background-jobs.md) as the detailed source of truth.

| Mechanism | Examples | Why |
|-----------|----------|-----|
| **pg_cron in Neon (`main`)** | Nightly sales summary, membership auto-expire, offer auto-expire, session cleanup, monthly GST summary, gems auto-expire | SQL-first maintenance jobs run closest to the data |
| **GitHub Actions cron** | Preprod DB sync + PII anonymisation | Best place for branch reset and operational workflows outside the database |
| **QStash scheduled jobs** | Appointment reminders, membership alerts, birthday offers, membership usage nudges | HTTP-triggered application jobs with retries and signatures |
| **Triggered jobs** | Post-service follow-up, stale pending booking alerts, no-show checks, membership expired notices | Fired from business events instead of a fixed schedule |

> See [background-jobs.md](./background-jobs.md) for the full job inventory, schedules, endpoints, and heartbeat mapping.

---

## Realtime — Neon Does NOT Have This Built In

**Neon is pure serverless PostgreSQL — it has no websocket or live-subscription layer.** This is a real gap for Royal Glow because several features require live data push:

| Feature | Realtime Needed |
|---------|----------------|
| Live booking status (confirmed → in-progress → done) | ✅ Staff & customer views |
| Receptionist queue board | ✅ New walk-in / booking appears instantly |
| Staff availability display | ✅ When a therapist becomes free |
| Admin dashboard counters | ✅ Today's bookings, revenue ticking up |

### Why Not Supabase Realtime Pointed at Neon?
Supabase Realtime is tightly coupled to Supabase's own internal Postgres — it cannot subscribe to an external Neon database. They are not the same product.

### Recommended: Ably (Free Tier)

**Ably** is a managed realtime messaging platform. It is the cleanest fit for this stack:

| Factor | Detail |
|--------|--------|
| Free tier | 6 million messages/month + 200 concurrent connections — more than enough for a salon |
| How it works | Your Next.js API route publishes a message to an Ably channel when a booking status changes in Neon. The customer/staff browser is subscribed to that channel and receives the update instantly. |
| Works on Cloudflare Workers | ✅ Ably's SDK is edge-compatible |
| No extra database needed | Neon remains the source of truth — Ably is only the delivery pipe |
| TypeScript SDK | ✅ First-class |

```
Neon DB (source of truth)
      │
      │  booking status written
      ▼
Next.js API route
      │  publishes to Ably channel
      ▼
    Ably ───────────────────────────┐
      │                            │
  Customer browser           Staff / receptionist browser
  (booking status updates)   (queue board updates)
```

### Alternative: Pusher
- 200k messages/day, 100 concurrent connections free
- Very similar to Ably, slightly lower free tier
- Choose Ably over Pusher — 6M/month vs 200k/day is not comparable

### Alternative: SSE (Server-Sent Events)
- Built into Next.js, zero cost, zero external service
- One-directional (server → browser only, which covers booking status)
- Simpler than websockets but less flexible
- Good fallback if you want to avoid any external dependency at launch
- Limitation: not compatible with Cloudflare Workers' CPU limits for long-lived connections — needs Render fallback as the SSE origin

### Decision
**Add Ably to the stack.** It is free within salon scale, edge-compatible, and requires no infrastructure management.

---

## ✅ Final Locked Stack — ₹0/month at Launch

| Layer | Technology | Plan | Details |
|-------|-----------|------|---------|
| **Primary DB** | Neon DB | Free forever | All business data · 4 branches = 4 environments · pg_cron for DB-only scheduled jobs · Drizzle ORM + Better Auth native |
| **Realtime** | Ably | Free tier | Live booking status, queue board, staff availability push — 6M messages/mo + 200 concurrent connections |
| **File storage** | Cloudflare R2 | 10 GB free | Photos · service images · generated PDF invoices — no egress fees unlike AWS S3 |
| **Cache + queue** | Upstash Redis + QStash | Free tier | Booking slot cache · API rate limiting · QStash job queue — serverless, zero infra |
| **Edge cache** | Cloudflare KV | Free tier | Service listings · static page data · menu cache served at edge globally |
| **Search** | Postgres FTS in Neon | Free (pg_trgm) | Fuzzy search across customers, services, staff — upgrade to Algolia later if needed |

### Deployment Region
Deploy Cloudflare on the region closest to India — **Mumbai (in-mum) / Singapore (ap-sea)** — for lowest latency to the primary user base.

### Cost Comparison
| | This Stack | AWS Equivalent |
|--|--|--|
| **Monthly at launch** | **₹0** | $150–300/mo |
| **At 20k users** | ₹0–$19/mo | $300–600/mo |

### First Paid Upgrade
**Neon Launch plan at $19/mo** — only triggered when exceeding 0.5 GB storage. At salon scale this will take a while. Everything else stays free well past launch.

---

## Supabase — Not Used

Supabase is fully replaced:

| Supabase Feature | Replacement |
|-----------------|-------------|
| Postgres (primary DB) | Neon DB |
| Auth | Better Auth (sessions stored in Neon) |
| Storage | Cloudflare R2 |
| Realtime | Ably |
