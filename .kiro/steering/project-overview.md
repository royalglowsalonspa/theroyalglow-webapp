# Project Overview — Royal Glow Salon & Spa (RGSS)

## What This Is

Full-stack digital operations platform for **Royal Glow Salon & Spa** — a premium beauty and wellness business in Bengaluru, India. Single developer project covering: customer website, booking system, admin portal, CRM, billing, memberships, loyalty programme, marketing automation, analytics, and backend automations.

**Domain:** `theroyalglow.in`

---

## Architecture

### Monorepo Structure (Turborepo + Bun Workspaces)

```
rgss_solutions/
├── apps/
│   ├── web/           ← Next.js 16.2.6 (App Router) — theroyalglow.in
│   └── cms/           ← Payload CMS v3 — admin.theroyalglow.in
├── docs/              ← Fumadocs — docs.theroyalglow.in
├── packages/
│   ├── db/            ← Drizzle ORM schemas, queries, migrations
│   ├── business/      ← Pure business logic functions (NO I/O, NO framework deps)
│   ├── types/         ← Shared Zod schemas + TypeScript types
│   ├── errors/        ← AppError class, error codes registry
│   └── logger/        ← Structured JSON logger
├── turbo.json
├── package.json       ← Root Bun workspaces config
└── bun.lockb
```

### Layer Rules (STRICT)

| Layer | Location | Can Import | Cannot Import |
|-------|----------|-----------|---------------|
| Presentation | `apps/web/app/`, `apps/web/components/` | business, db, types, errors | — |
| API (Thin) | `apps/web/app/api/` | business, db, types, errors | UI components |
| Business Logic | `packages/business/` | types, errors | db, framework, UI |
| Data Access | `packages/db/` | types | business, framework, UI |
| Types/Validation | `packages/types/` | — | Everything else |

**API routes are thin orchestrators:** Parse → Zod validate → Call business logic → Return JSON. No DB queries in API routes.

### Infrastructure

| Layer | Technology |
|-------|-----------|
| Edge Hosting | Cloudflare Pages + Workers |
| SSR Origin + CMS | Render (Singapore, free tier) |
| Primary DB | Neon PostgreSQL 16 (4 branches: main/preprod/test/dev) |
| ORM | Drizzle ORM (pure TypeScript, edge-native) |
| Auth | Better Auth (Google OAuth only, RBAC plugin) |
| Realtime | Ably (6M messages/mo free) |
| File Storage | Cloudflare R2 (S3-compatible, zero egress) |
| Cache + Queue | Upstash Redis + QStash |
| Edge Cache | Cloudflare KV (service catalog, 5-min TTL) |
| Email (Transactional) | Resend + React Email |
| Email (Marketing) | Brevo |
| CMS | Payload CMS v3 (marketing content only) |
| Validation | Zod (`.safeParse()` everywhere) |

### Key Constraints

- **Solo developer** — no microservices, minimal ops overhead
- **₹0/month infrastructure** at launch (all free tiers)
- **India-first** — DPDP Act, IST timezone, INR (paise), GST 18%, DD/MM/YYYY dates
- **Premium brand** — Lighthouse ≥95 performance, 100 accessibility/SEO
- **Edge-first** — sub-100ms responses globally via Cloudflare

---

## Tech Stack Quick Reference

| Category | Choice |
|----------|--------|
| Runtime | Bun |
| Language | TypeScript (strict mode) |
| Framework | Next.js 16.2.6 (App Router) — `params`/`searchParams` are Promises |
| UI | React + shadcn/ui + Radix primitives |
| Styling | Tailwind CSS v4 |
| Animation | motion (motion.dev) |
| Linting | Biome + Ultracite (replaces ESLint + Prettier) |
| Testing | Vitest (unit) + Playwright (E2E) + MSW (API mocking) |
| Monorepo | Turborepo + Bun workspaces |

---

## Authentication & Roles

- **Google OAuth only** — callback on own domain for branding
- **6 RBAC roles** (hierarchy): Customer < Staff < Receptionist < Manager < Owner < Developer
- Sessions stored in Neon (HttpOnly, Secure, SameSite=Lax cookies)
- First sign-in → `/onboarding` (collect phone, DOB, gender, consents)
- `sessionStorage` preserves booking/UTM context across OAuth redirect

---

## Git Workflow

| Branch | Environment | Neon Branch |
|--------|-------------|-------------|
| `dev` | Development | `dev` |
| `test` | QA/CI | `test` |
| `pprd` | Pre-production | `preprod` |
| `prod` | Production | `main` |

Flow: `dev → test → pprd → prod`
Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, etc.)

---

## Key Documentation References

- #[[file:README.md]] — Complete project context
- #[[file:architecture.md]] — Infrastructure & routing decisions
- #[[file:tech-stack.md]] — Technology choices with rationale
- #[[file:database-schema.md]] — All 38 tables, conventions, ERD
- #[[file:features.md]] — Full feature specifications
- #[[file:authentication.md]] — Auth design & RBAC
- #[[file:system-design/HLD.md]] — High-level design
- #[[file:system-design/LLD.md]] — Low-level design
- #[[file:error-handling.md]] — Error patterns & codes
- #[[file:background-jobs.md]] — All 19 background jobs
- #[[file:deployment.md]] — CI/CD pipeline & deployment
- #[[file:environment-variables.md]] — All 55 env vars
