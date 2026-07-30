# Project Overview — Royal Glow Salon & Spa (RGSS)

## What This Is

Full-stack digital operations platform for **Royal Glow Salon & Spa** — a premium beauty and wellness business in Bengaluru, India. Single developer project covering: customer website, booking system, admin portal, CRM, billing, memberships, loyalty programme, marketing automation, analytics, and backend automations.

**Domain:** `theroyalglow.in`

---

## Architecture

### Monorepo Structure (Turborepo + Bun Workspaces)

```
theroyalglow-webapp/
├── apps/
│   ├── web/           ← Next.js 16.2.9 (App Router) — theroyalglow.in
│   ├── admin/         ← Next.js 16.2.9 (App Router) — admin.theroyalglow.in
│   ├── cms/           ← Payload CMS v3 — cms.theroyalglow.in
│   └── invoicing/     ← Node.js (Hono) + @react-pdf/renderer — Google Cloud Run (rgss-invoicing)
├── docs/              ← Fumadocs — docs.theroyalglow.in
├── packages/
│   ├── db/            ← Drizzle ORM schemas, queries, migrations
│   ├── business/      ← Pure business logic functions (NO I/O, NO framework deps)
│   ├── types/         ← Shared Zod schemas + TypeScript types
│   ├── errors/        ← AppError class, error codes registry
│   ├── logger/        ← Structured JSON logger
│   └── ui/            ← Shared React UI components (@rgss/ui)
├── turbo.json
├── package.json       ← Root Bun workspaces config
└── bun.lockb
```

### Subdomain Map

| Subdomain | Application | Hosting |
|-----------|-------------|---------|
| `theroyalglow.in` | `apps/web` — customer website | Cloudflare Workers (`rgss-web`) |
| `admin.theroyalglow.in` | `apps/admin` — admin portal | Cloudflare Workers (`rgss-admin`) |
| `cms.theroyalglow.in` | `apps/cms` — Payload CMS (marketing content + service catalogue) | Render |
| `docs.theroyalglow.in` | `docs/` — Fumadocs documentation | Cloudflare Workers |
| `r2.theroyalglow.in` | Cloudflare R2 object storage | Cloudflare R2 |

The admin portal is served from `admin.theroyalglow.in` at root paths (no `/admin` prefix — the subdomain provides the admin namespace). Sessions are shared across subdomains via a `.theroyalglow.in` scoped cookie.

### Layer Rules (STRICT)

| Layer | Location | Can Import | Cannot Import |
|-------|----------|-----------|---------------|
| Presentation | `apps/web/app/`, `apps/web/components/` | business, db, types, errors | — |
| API (Thin) | `apps/web/app/api/` | business, db, types, errors | UI components |
| Presentation (Admin) | `apps/admin/app/`, `apps/admin/components/` | business, db, types, errors | — |
| API (Admin, Thin) | `apps/admin/app/api/` | business, db, types, errors | UI components |
| Business Logic | `packages/business/` | types, errors | db, framework, UI |
| Data Access | `packages/db/` | types | business, framework, UI |
| Types/Validation | `packages/types/` | — | Everything else |

**API routes are thin orchestrators:** Parse → Zod validate → Call business logic → Return JSON. No DB queries in API routes.

### Infrastructure

| Layer | Technology |
|-------|-----------|
| Edge Hosting | Cloudflare Workers (OpenNext adapter) |
| SSR Origin + CMS | Render (Singapore, free tier) |
| Primary DB | Neon PostgreSQL 16 (4 branches: prod/pprd/test/dev) |
| ORM | Drizzle ORM (pure TypeScript, edge-native) |
| Auth | Better Auth (Google OAuth only, RBAC plugin) |
| Realtime | Ably (6M messages/mo free) |
| File Storage | Cloudflare R2 (S3-compatible, zero egress) |
| Cache + Queue | Upstash Redis + QStash |
| Edge Cache | Cloudflare KV (service catalog, 5-min TTL) |
| Email (Transactional) | Resend + React Email |
| Email (Marketing) | Brevo |
| CMS | Payload CMS v3 (marketing content + service catalogue authoring) |
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
| Framework | Next.js 16.2.9 (App Router) — `params`/`searchParams` are Promises |
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
| `pprd` | Pre-production | `pprd` |
| `prod` | Production | `prod` |

Flow: `dev → test → pprd → prod`
Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, etc.)

---

## Key Documentation References

- #[[file:README.md]] — Complete project context
- #[[file:knowledge-base/architecture.md]] — Infrastructure & routing decisions
- #[[file:knowledge-base/tech-stack.md]] — Technology choices with rationale
- #[[file:knowledge-base/database-schema.md]] — All 38 tables, conventions, ERD
- #[[file:knowledge-base/features.md]] — Full feature specifications
- #[[file:knowledge-base/authentication.md]] — Auth design & RBAC
- #[[file:knowledge-base/system-design/HLD.md]] — High-level design
- #[[file:knowledge-base/system-design/LLD.md]] — Low-level design
- #[[file:knowledge-base/error-handling.md]] — Error patterns & codes
- #[[file:knowledge-base/background-jobs.md]] — All 19 background jobs
- #[[file:knowledge-base/deployment.md]] — CI/CD pipeline & deployment
- #[[file:knowledge-base/environment-variables.md]] — All env vars (count is maintained in that doc)
- #[[file:knowledge-base/service-catalogue-management.md]] — Service catalogue: managed in Payload CMS, sync mechanism & failure modes
- #[[file:knowledge-base/service-catalogue-migration.md]] — Service catalogue migration runbook (backup, checklist, rollback)
