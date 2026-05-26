# Tech Stack

## Overview

Royal Glow Salon & Spa is built for scale (20k–50k users), premium feel, and long-term maintainability by a single developer. Every technology choice is made with that constraint in mind.

---

## Core Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Runtime | **Bun** | Faster than Node.js for installs, test runs, and scripts |
| Language | **TypeScript + JavaScript** | Type safety across the full stack |
| Framework | **Next.js 16.2.6** (App Router) | SSR, SSG, API routes, edge-ready — `params`/`searchParams` are Promises, `PageProps<>` / `LayoutProps<>` global type helpers |
| UI Library | **React** | Component model, ecosystem |
| Styling | **Tailwind CSS v4** | Utility-first, consistent design tokens, fast iteration |
| Component Library | **shadcn/ui** | Copy-paste Radix-based components — fully owned, zero runtime overhead |
| Animations | **motion** (motion.dev) | Page transitions, staggered reveals, micro-interactions — free tier |
| Monorepo | **Turborepo + Bun workspaces** | Bun manages packages; Turborepo handles task orchestration + incremental build caching |
| Database | **Neon DB (PostgreSQL)** | Serverless Postgres with branching — 1 project, 4 environment branches, free tier |
| ORM | **Drizzle ORM** | Pure TypeScript, no binary — edge-native, works on Cloudflare Workers without adapters. Prisma was considered but its Rust query engine binary cannot run in V8 isolate (Cloudflare Workers) without workarounds or paid Prisma Accelerate. |
| Realtime | **Ably** | Live booking status, queue board, staff availability — 6M messages/mo free |
| File Storage | **Cloudflare R2** | 10 GB free object storage — photos, service images, PDF invoices |
| Cache + Queue | **Upstash Redis + QStash** | Serverless Redis for slot caching, rate limiting, background jobs |
| Edge Cache | **Cloudflare KV** | Service listings and static data at the edge |
| CMS | **Payload CMS v3** | Marketing content only: blog, gallery, team bios, homepage banners, FAQ — self-hosted on Render, media to Cloudflare R2. Service catalog, bookings, billing are managed in the custom `/admin` portal, NOT in Payload. |
| Documentation | **Fumadocs + fumadocs-openapi** | Documentation portal at `docs.theroyalglow.in` — Next.js-native, TypeScript-first, premium out of the box. `fumadocs-openapi` auto-generates the entire API reference from the OpenAPI/Swagger spec — no manual API docs writing |
| Validation | **Zod** | TypeScript-first schema validation — all API inputs validated at system boundary |
| PWA | **Service Worker + manifest.json** | Installable on phone, offline service menu/prices/contact, add-to-homescreen prompt |
| Push Notifications | **Web Push API** (`web-push`) | Appointment reminders (24h + 1h before), booking confirmations — free, unlimited |
| Image Optimization | **Next.js `<Image>` + Cloudflare Polish** | Auto WebP/AVIF, responsive srcset, lazy loading, blur placeholders |

---

## Authentication

| Tool | Role |
|------|------|
| **Better Auth** | Primary auth library — Google OAuth, RBAC, session management |
| **Better Auth Cloud** | Free dashboard, audit logs, user management UI |

> See [authentication.md](./authentication.md) for full auth design.

---

## Email

| Tool | Role |
|------|------|
| **Resend** | Transactional emails (welcome, invoices) |
| **React Email** | Email templates in React/TypeScript |
| **Brevo** | Marketing/bulk emails with unsubscribe management |

> See [email-strategy.md](./email-strategy.md) for full email design.

---

## Infrastructure & Hosting

| Layer | Technology |
|-------|-----------|
| Edge Hosting | **Cloudflare Pages + Workers** |
| Node.js Origin / CMS Host | **Render** — heavy SSR fallback + Payload CMS admin panel (free tier, Singapore region) |
| Primary Database | **Neon DB** (PostgreSQL, 4 branches, pg_cron) |
| Realtime | **Ably** (live push — booking status, queue board) |
| File Storage | **Cloudflare R2** (photos, invoices) |
| Cache + Queue | **Upstash Redis + QStash** |
| Edge Cache | **Cloudflare KV** |
| CMS | **Payload CMS v3** (self-hosted on Render, writes to Neon, media to R2) |
| Documentation Site | **Fumadocs** — `docs.theroyalglow.in` |

> See [architecture.md](./architecture.md) for full infrastructure decisions.
> See [database.md](./database.md) for full database selection and comparison.

---

## Testing & Code Quality

| Tool | Purpose |
|------|---------|
| **Biome + Ultracite** | Linting + formatting (replaces ESLint + Prettier) |
| **Vitest** | Unit & integration testing |
| **React Testing Library** | Component testing |
| **Playwright** | End-to-end testing (5 browsers) |
| **MSW** | API mocking (network-level, works in browser + Node) |
| **k6** | Load testing (target: 50 concurrent on preprod) |
| **Lighthouse CI** | Performance gate — 95+ score required to merge |
| **Meticulous AI** | Zero-effort visual regression (records real sessions) |
| **Trivy + Semgrep + Socket.dev** | Security scanning (deps, SAST, supply chain) |
| **Husky + lint-staged** | Pre-commit hooks (lint + format on staged files) |
| **Stryker** | Mutation testing (quarterly audit) |
| **Checkly** | Synthetic monitoring (real Playwright scripts in prod) |

> See [testing.md](./testing.md) for full testing strategy, tool ratings, and decision log.

---

## CRM & Lead Tracking

| Tool | Role |
|------|------|
| **AiSensy** | WhatsApp lead management — shared team inbox, pipeline, Meta Click-to-WhatsApp integration. Free tier: 1,000 conversations/month |
| **Meta Pixel** | Browser-side event tracking — PageView, ViewContent, Purchase events sent to Meta |
| **Meta Conversions API (CAPI)** | Server-side event tracking from Next.js API routes — reliable Purchase events unaffected by iOS privacy blocking or ad blockers |
| **Custom `/admin/leads`** | In-house lead pipeline page — reads directly from Neon DB, no sync needed |

> **Why no external CRM (HubSpot, Attio, Zoho):** All customer and booking data lives in Neon DB. An external CRM would require a continuous sync pipeline, creating two sources of truth. The CRM is built as admin views inside the app — `/admin/crm`, `/admin/leads` — powered directly by Neon.

> See [features.md](./features.md) for full CRM, lead pipeline, and Meta attribution design.

---

## Observability & Analytics

| Layer | Tool | Free Tier |
|-------|------|-----------|
| **Error monitoring** | **Sentry** | 5k errors/mo — stack traces, Cloudflare Workers + Render supported |
| **Uptime + status page + jobs + logs** | **BetterStack** | 10 monitors · `status.theroyalglow.in` · heartbeats for pg_cron, QStash, and GitHub Actions jobs · 1 GB logs/mo |
| **Product analytics** | **PostHog** | 1M events/mo — funnels, feature flags, session replay, cohorts |
| **Heatmaps + session recordings** | **Microsoft Clarity** | Free forever — visual heatmaps, rage click detection |

> See [observability.md](./observability.md) for full tool rationale, monitor list, cron heartbeat setup, and PostHog event plan.

---

## CI/CD

| Tool | Purpose |
|------|---------|
| **GitHub Actions** | All pipelines — lint, test, build, deploy, data replication |

> See [git-workflow.md](./git-workflow.md) for branch strategy and pipeline design.

---

## Security

| Area | Tooling / Approach |
|------|-------------------|
| **Input validation** | Zod schemas on every API route — `.safeParse()`, no raw client input reaches business logic |
| **Rate limiting** | `@upstash/ratelimit` via Upstash Redis — per-endpoint sliding windows (e.g. 5 bookings/min, 3 leads/min) |
| **CSP headers** | Strict Content-Security-Policy with nonce-based script loading — whitelisted origins only |
| **CORS** | Exact origin matching (`theroyalglow.in` only) — no wildcard `*` |
| **DDoS / bot mitigation** | Cloudflare edge — automatic |
| **Session security** | Better Auth: HttpOnly, Secure, SameSite=Lax cookies, built-in CSRF |
| **SQL injection** | Drizzle ORM parameterized queries — no raw SQL concatenation |
| **XSS** | React auto-escaping + CSP — no `dangerouslySetInnerHTML` without sanitisation |
| **Dependency audit** | Trivy (CVE scan) + Socket.dev (supply chain attack detection) in CI — PR fails on high/critical vulnerabilities |

> See [architecture.md](./architecture.md) Security Hardening for full CSP header config, rate limit tables, CORS policy, Zod patterns, and additional security measures.

---

## SEO & Agent-Friendly Standards

| Area | Tooling / Approach |
|------|-------------------|
| **Local SEO** | Google My Business fully configured, NAP consistent across all platforms |
| **Structured data** | JSON-LD injected server-side via Next.js `generateMetadata()` — `LocalBusiness` + `BeautySalon` (homepage), `Service` (services page), `BreadcrumbList` (all pages), `FAQPage` (`/faq`), `BlogPosting` (`/blog/[slug]`), `Organization` (global) |
| **Sitemap** | `app/sitemap.ts` (Next.js 16 built-in) — static routes hardcoded + blog posts fetched dynamically from Payload REST API at build time. Submitted to Google Search Console on launch. |
| **robots.txt** | AI crawlers explicitly allowed (GPTBot, Claude-Web, PerplexityBot, Googlebot-Extended) |
| **Semantic HTML** | All pages use proper semantic tags — `<header>`, `<main>`, `<section>`, `<article>`, `<address>`, `<time>` — never `<div onClick>` |
| **Accessible forms** | Every input labelled, `aria-required`, `fieldset`/`legend`, `aria-live` on dynamic content |
| **Metadata** | Unique title + description + OpenGraph + Twitter card on every page |
| **Agent endpoints** | Clean RESTful API routes for all key actions (services, availability, bookings, leads) — WebMCP-ready |
| **`llms.txt`** | AI agent discovery file at site root — site description, key pages, services, contact, API endpoints for AI systems |
| **AI crawler access** | All AI crawlers explicitly allowed: GPTBot, ChatGPT-User, ClaudeBot, PerplexityBot, Applebot-Extended, Google-Extended, CCBot |
| **AI Overview optimization** | Answer-first content pattern, FAQPage JSON-LD, E-E-A-T signals — optimized for Google AI Overview citation |
| **Performance** | SSR/SSG for all public pages, Next.js `<Image>`, no-JS fallback for core content |

> See [seo.md](./seo.md) for full strategy: Local SEO, all JSON-LD schemas, sitemap config, robots.txt, agent-friendly build standards, and page-by-page checklist.

---

## Accessibility (a11y)

| Tool / Standard | Purpose |
|----------------|--------|
| **WCAG 2.1 AA** | Compliance standard — all public pages must meet Level AA |
| **Semantic HTML** | `<nav>`, `<main>`, `<header>` etc. — correct document structure |
| **ARIA** | Labels, live regions, describedby — used only where semantic HTML is insufficient |
| **Focus management** | Visible focus ring, modal focus trap, focus restoration on close |
| **Skip links** | "Skip to main content" — keyboard users bypass nav |
| **Colour contrast** | 4.5:1 normal text, 3:1 large text — enforced in design tokens |
| **`@axe-core/react`** | Automated a11y checks integrated into Vitest unit tests |
| **Lighthouse CI** | Accessibility score gate — must reach 100 before merge |
| **Playwright** | Keyboard navigation E2E tests through booking flow |
| **`prefers-reduced-motion`** | All animations conditional — no forced motion |

> See [features.md](./features.md) Section 12 for full a11y requirements table.

---

## Legal

| Page / Component | Requirement |
|-----------------|------------|
| **Privacy Policy** (`/privacy`) | Mandatory — India DPDP Act 2023. Data collection, usage, storage, sharing disclosure. |
| **Terms of Service** (`/terms`) | Business protection — governs use of the platform. |
| **Cookie Consent Banner** | Custom two-tier banner (no paid tool). **Necessary** (session + CSRF — always on) · **Analytics** (PostHog + Clarity — default off) · **Marketing** (Meta Pixel + CAPI — default off). Top level: Accept All / Reject All / Manage Preferences. Manage Preferences expands to per-category toggles + Save. Preference stored in `localStorage` key `rgss_cookie_consent` for 365 days. |
| **Refund & Cancellation Policy** (`/refund-policy`) | Service business requirement — cancellation window, no-show, reschedule rules. |

> Consent preference stored in `localStorage` (`rgss_cookie_consent: { v, analytics, marketing, ts }`) for 365 days. No paid consent management tool needed at launch.

---

## Monorepo Structure

Tool split: **Bun workspaces** (package management) + **Turborepo** (task orchestration + caching). They do different jobs and complement each other.

| Tool | Responsibility |
|------|---------------|
| **Bun workspaces** | Installs deps, hoists `node_modules`, resolves packages across apps. Defined in root `package.json`. |
| **Turborepo** | Runs `build`, `dev`, `lint`, `test` in parallel across apps with incremental caching. Defined in `turbo.json`. |

```
rgss_solutions/
├── apps/
│   ├── web/          # Next.js 16.2.6 — theroyalglow.in (customer + admin)
│   └── cms/          # Payload CMS v3 — admin.theroyalglow.in (marketing CMS)
├── docs/             # Fumadocs — docs.theroyalglow.in
├── packages/
│   └── types/        # Shared TypeScript types (add when needed)
├── turbo.json
├── package.json      # Root — Bun workspaces config
└── bun.lockb
```

> `apps/cms` is itself a Next.js app (Payload CMS v3 is a Next.js plugin), and the docs site stays in the same Next.js/TypeScript ecosystem through Fumadocs. That keeps the stack consistent across the product site, CMS, and documentation.

---

## UI Component Library

Split by audience — same underlying library, different styling focus.

| Side | Library Stack | Notes |
|------|--------------|-------|
| **Customer-facing** (`apps/web` — public pages) | shadcn/ui + Tailwind v4 + **motion** | Restyled components for premium brand feel. Motion handles page transitions, staggered reveals, hero animations. |
| **Admin** (`apps/web` — `/admin` routes) | shadcn/ui + Tailwind v4 | Functional and consistent. No heavy animations needed. |
| **CMS** (`apps/cms`) | Payload built-in UI | Payload ships its own admin UI — no custom components needed. |

**Why shadcn/ui for both sides:**
- Components are **copy-pasted into your repo** — you own 100% of the code and styling
- Built on **Radix UI primitives** — production-tested accessibility (keyboard nav, ARIA, focus management) out of the box
- Zero runtime overhead — no library import, just your own components
- Admin and customer UI share the same component conventions, reducing cognitive overhead

**Motion (motion.dev):**
- Free tier covers all core needs: `motion()`, `AnimatePresence`, `useScroll`, `useInView`, `variants`, `stagger`
- Motion Plus (paid) available for `AnimateNumber`, `AnimateText` (character-by-character), `Cursor` — upgrade if needed for hero section polish
- Respects `prefers-reduced-motion` — required for WCAG 2.1 AA compliance

---

## Design Principles

- **Lighthouse gates:** performance ≥ 95; accessibility, best practices, and SEO = 100
- **Premium feel** — rich, high-end aesthetic matching the brand
- **Edge-first** — sub-100ms response times globally via Cloudflare
- **Single developer** — tooling must minimize ops overhead
