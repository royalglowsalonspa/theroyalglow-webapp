# External Subdomains

> Separate deployments not part of the main Next.js customer app (`apps/web`). Each runs on its own infrastructure and serves a distinct purpose.

---

## 9.1 `admin.theroyalglow.in` — Admin Portal

| Property | Detail |
|----------|--------|
| **Platform** | Next.js 16 (App Router) on Cloudflare Workers via OpenNext (`rgss-admin`) |
| **App** | `apps/admin/` in monorepo |
| **Purpose** | RBAC-gated admin portal: booking management, CRM, lead pipeline, billing, staff scheduling, reports, memberships, system settings |
| **Access** | Staff, Receptionist, Manager, Owner, Developer roles |
| **Routing** | Root-Path Convention — routes drop the `/admin` prefix (subdomain is the namespace). E.g. `admin.theroyalglow.in/bookings`, not `/admin/bookings`. |
| **Auth** | Shared Better Auth session via `.theroyalglow.in`-scoped cookie |
| **Redirects** | Legacy `theroyalglow.in/admin/*` paths 301-redirect here with `/admin` prefix dropped |

**Key routes:**
- `/` — Dashboard
- `/bookings`, `/bookings/[id]`, `/bookings/new`
- `/customers`, `/customers/[id]`
- `/leads`, `/leads/[id]`
- `/staff`, `/schedule`, `/leave`
- `/services`, `/offers`, `/memberships`, `/billing`
- `/reports/*`, `/settings`, `/branches`, `/users`
- `/integrations`, `/logs` (Developer only)

---

## 9.2 `cms.theroyalglow.in` — Payload CMS

| Property | Detail |
|----------|--------|
| **Platform** | Payload CMS v3 on Render (Node.js, Singapore region) |
| **Database** | Separate Payload Postgres (not main Neon DB) |
| **Purpose** | Marketing content management: blog posts, gallery photos, team bios, homepage banners, FAQ items, about page content |
| **Access** | Manager + Owner (2 seats on free tier) |
| **Integration** | Main Next.js app fetches via Payload REST API (ISR with 1h revalidation) |

**Collections managed:**
- Blog Posts (title, slug, body rich text, featured image, publish date, author)
- Gallery Images (image, caption, category, display order)
- Team Members (name, photo, designation, bio, specializations)
- FAQ Items (question, answer, category, display order)
- Homepage Banners (image, title, subtitle, CTA link, active toggle)

---

## 9.3 `docs.theroyalglow.in` — Technical Docs

| Property | Detail |
|----------|--------|
| **Platform** | Fumadocs (Next.js) on Cloudflare Workers (OpenNext) |
| **Purpose** | Developer documentation: architecture, API reference (auto-generated from OpenAPI spec via fumadocs-openapi), business logic guides, changelog |
| **Access** | Public (developer reference) |

---

## 9.4 `status.theroyalglow.in` — Status Page

| Property | Detail |
|----------|--------|
| **Platform** | BetterStack Status Page (free tier) |
| **Purpose** | Public uptime status: 10 monitors, incident history, scheduled maintenance |
| **Access** | Public |
| **Monitors** | Homepage, GMB deep link, QR deep link, `/book`, API health, Payload CMS, Neon probe, Ably probe, Redis probe, R2 probe |
