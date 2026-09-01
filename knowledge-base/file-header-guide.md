# File Header Guide — Royal Glow Salon & Spa

## Purpose

Every source file in this monorepo carries a **production-grade header block** that provides instant context about what the file does, where it sits in the architecture, and who owns it. This eliminates guesswork when navigating the codebase — especially useful for onboarding, code reviews, and future maintainers.

---

## Header Format

```typescript
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - DD-MM-YYYY & Updated - DD-MM-YYYY
 *
 * Project      : theroyalglow-webapp
 * Module Name  : {name}
 * Scope        : {scope / domain area}
 *
 * Description  : {1-2 line summary of what this file does}
 *
 * Responsibilities :
 * - {what this file is accountable for}
 * - {second responsibility}
 * - {third responsibility}
 *
 * Features / Functionality :
 * - {key capability or behaviour}
 * - {second feature}
 * - {third feature}
 *
 * Tech Stack   : {frameworks, libraries, runtimes used}
 * Layer        : {architectural layer — see below}
 *
 * Dependencies : {imported packages / internal modules}
 *
 * Notes        :
 * - {gotchas, design decisions, TODOs}
 ************************************************************/
```

---

## Header Fields Explained

| Field | What It Captures | Example |
|-------|-----------------|---------|
| **Author** | Code owner / creator | `KATABATHUNI BOSE` |
| **Date** | Creation + last meaningful update (DD-MM-YYYY, Indian format) | `Created - 04-06-2026 & Updated - 04-06-2026` |
| **Project** | Monorepo name | `theroyalglow-webapp` |
| **Module Name** | Exported component/function name or endpoint path | `BookingDialog`, `POST /api/bookings` |
| **Scope** | Business domain this file belongs to | `Booking Management`, `Admin Portal — CRM` |
| **Description** | Plain-English summary (max 2 lines) | What does this file *do*? |
| **Responsibilities** | Accountability list (3-5 bullets) | What is this file *responsible for*? |
| **Features / Functionality** | User-facing or developer-facing capabilities | What does it *deliver*? |
| **Tech Stack** | Technologies actively used in this file | `Next.js 16, React, Tailwind CSS v4` |
| **Layer** | Architectural layer (see section below) | `Presentation (Page)` |
| **Dependencies** | Key imports (packages + internal modules) | `@rgss/db/queries, zod` |
| **Notes** | Gotchas, constraints, TODOs, design reasoning | Edge-runtime limitations, etc. |

---

## Architectural Layers

The monorepo is organised into **7 distinct layers**, each with clear boundaries on what it can import and what it's responsible for.

### Layer 1 — Presentation (Pages & Components)

| Property | Detail |
|----------|--------|
| **Location** | `apps/web/src/app/` (pages), `apps/web/src/components/` |
| **Responsibility** | Render UI, handle user interactions, apply styling |
| **Can Import** | Business logic, DB queries, types, errors, lib utilities |
| **Cannot Import** | Nothing restricted (top of the stack) |
| **Sub-layers** | `Page` (route-level), `Component` (reusable), `Layout` (structural) |

**Header examples:**
- `Layer : Presentation (Page)` — route-level page files
- `Layer : Presentation (Component)` — reusable UI components
- `Layer : Presentation (Layout)` — layout wrappers

---

### Layer 2 — API (Thin Orchestrators)

| Property | Detail |
|----------|--------|
| **Location** | `apps/web/src/app/api/` |
| **Responsibility** | Parse request → validate with Zod → call business logic → return JSON |
| **Can Import** | Business logic, DB queries, types, errors |
| **Cannot Import** | UI components, React |
| **Rule** | NO database queries directly — delegate to `packages/db/queries/` |

**Header example:** `Layer : API (Thin Orchestrator)`

---

### Layer 3 — Business Logic (Pure Functions)

| Property | Detail |
|----------|--------|
| **Location** | `packages/business/src/` |
| **Responsibility** | Implement domain rules, calculations, state machines |
| **Can Import** | `packages/types/`, `packages/errors/` |
| **Cannot Import** | DB, framework code, UI, I/O of any kind |
| **Rule** | Pure functions only — receives data as args, throws `AppError` on violations |

**Header example:** `Layer : Business Logic`

---

### Layer 4 — Data Access (Queries & Schema)

| Property | Detail |
|----------|--------|
| **Location** | `packages/db/src/` |
| **Responsibility** | Define database schema, provide reusable query builders |
| **Can Import** | `packages/types/` |
| **Cannot Import** | Business logic, framework code, UI |
| **Sub-layers** | `Schema` (table definitions), `Queries` (parameterised reads/writes), `Relations` (Drizzle ORM relations) |

**Header examples:**
- `Layer : Data Access (Schema)` — table definitions
- `Layer : Data Access (Queries)` — query builder functions
- `Layer : Data Access (Relations)` — Drizzle relation definitions

---

### Layer 5 — Shared Types & Validation

| Property | Detail |
|----------|--------|
| **Location** | `packages/types/src/` |
| **Responsibility** | Define Zod schemas used for both client and server validation |
| **Can Import** | Nothing (leaf package) |
| **Cannot Import** | Everything else |

**Header example:** `Layer : Shared Package`

---

### Layer 6 — Infrastructure & Configuration

| Property | Detail |
|----------|--------|
| **Location** | `apps/web/src/lib/`, `apps/web/src/env.ts`, SEO files, PWA files |
| **Responsibility** | Platform wiring — auth, caching, jobs, email, realtime, SEO, environment |
| **Can Import** | Types, errors, external SDKs |
| **Cannot Import** | UI components |

**Header examples:**
- `Layer : Infrastructure (Request)` — middleware, routing helpers
- `Layer : Infrastructure (SEO)` — sitemap, robots, JSON-LD
- `Layer : Infrastructure (PWA)` — manifest, service worker
- `Layer : Infrastructure (Configuration)` — env.ts, feature flags
- `Layer : Infrastructure (Auth)` — auth-client, auth-server

---

### Layer 7 — CMS (Content Management)

| Property | Detail |
|----------|--------|
| **Location** | `apps/cms/src/` |
| **Responsibility** | Define Payload CMS collections, access control, and configuration |
| **Can Import** | Payload SDK |
| **Cannot Import** | Web app code, business logic, DB queries |

**Header examples:**
- `Layer : CMS (Collection)` — individual collection definitions
- `Layer : CMS (Access)` — access control helpers
- `Layer : CMS (Configuration)` — payload.config.ts

---

## Layer Dependency Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Presentation (Pages + Components)                  │
│  ↓ imports from                                              │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: API Routes (Thin Orchestrators)                    │
│  ↓ imports from                                              │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Business Logic (Pure Functions)                    │
│  ↓ imports from                                              │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Data Access (Schema + Queries)                     │
│  ↓ imports from                                              │
├─────────────────────────────────────────────────────────────┤
│  Layer 5: Shared Types & Validation (Zod)                    │
└─────────────────────────────────────────────────────────────┘

  Layer 6: Infrastructure — cross-cuts layers 1-4 (auth, cache, jobs)
  Layer 7: CMS — isolated app, talks to same DB but separate deployment
```

---

## Scope Naming Conventions

| Domain | Scope Value |
|--------|-------------|
| Homepage, services, about, contact, gallery | `Customer Pages` |
| Booking creation and management | `Booking Management` |
| Admin portal (general) | `Admin Portal` |
| Admin sub-domains | `Admin Portal — {sub-domain}` (e.g. `Admin Portal — CRM`) |
| Authentication and onboarding | `Authentication UI` |
| Lead capture and pipeline | `Lead Capture` / `Lead Management` |
| SPA memberships | `SPA Memberships` |
| Loyalty/gems programme | `Loyalty Programme` |
| Staff self-service | `Staff Portal` |
| Background jobs | `API — Background Jobs` |
| Database schema/queries | `Database Schema — {domain}` / `Database Queries — {domain}` |
| Shared validation | `Shared Types & Validation` |
| Error handling | `Error Handling` |
| SEO and PWA | `SEO Configuration` / `PWA Configuration` |
| CMS content | `CMS Collections` / `CMS Configuration` |
| Legal pages | `Legal Pages` |
| Landing pages | `Landing Pages` |

---

## Rules for Maintaining Headers

1. **Every new `.ts` / `.tsx` file** must have a header before any code or `'use client'` directive.
2. **Update the `Updated` date** when making meaningful changes (not typo fixes).
3. **Module Name** should match the primary export or describe the endpoint.
4. **Keep descriptions honest** — update them when the file's purpose changes.
5. **Layer must be accurate** — if a file moves layers, update the header.
6. **No headers on:** config files (`turbo.json`, `tsconfig.json`, `package.json`), CSS files, markdown docs, test files, or generated code.

---

## File Count by Layer (as of 04-06-2026)

| Layer | File Count |
|-------|-----------|
| Presentation (Pages + Components) | ~65 |
| API (Route Handlers) | ~55 |
| Business Logic | ~30 |
| Data Access (Schema + Queries + Relations) | ~44 |
| Shared Types | ~10 |
| Infrastructure (Lib) | ~25 |
| CMS | ~9 |
| Error Handling + Logger | ~4 |
| **Total** | **~242** |

---

## Quick Reference

```
Header goes → BEFORE 'use client' and imports
Layer tells → WHERE in the architecture stack this file lives
Scope tells → WHICH business domain this file serves
Module Name → WHAT this file exports or represents
```
