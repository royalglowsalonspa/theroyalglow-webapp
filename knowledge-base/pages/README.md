# Pages & Routes — Application Map

> Index and navigation guide for the complete route specification of **Royal Glow Salon & Spa**.

**Domain:** `theroyalglow.in`
**Subdomains:** `admin.theroyalglow.in` (Payload CMS) · `docs.theroyalglow.in` (Fumadocs) · `status.theroyalglow.in` (BetterStack)

---

## Route Groups (Next.js App Router)

| Route Group | Layout | Shared Components | Purpose |
|-------------|--------|-------------------|---------|
| `(customer)` | Header + Footer + Nav | Cookie banner, PWA prompt, skip-to-content link | Public and authenticated customer pages |
| `(auth)` | Minimal centered card | Logo only, no nav | Sign-in and onboarding flows |
| `(landing)` | No header/footer | Trust signals only | Conversion-optimised ad landing pages |
| `(legal)` | Header + Footer + Nav | Same as customer | Static legal/policy pages (SSG) |
| `admin/` | Sidebar nav + Top bar + RBAC gate | Role badge, notifications bell, breadcrumbs | Internal staff portal |

---

## File Index

| File | Description |
|------|-------------|
| [customer-public.md](./customer-public.md) | 8 public pages: homepage, services, offers, about, contact, blog, blog post, FAQ |
| [customer-authenticated.md](./customer-authenticated.md) | 5 auth-gated pages: profile, bookings, booking detail, membership, gems |
| [booking-dialog.md](./booking-dialog.md) | 4-step booking overlay component spec (not a route) |
| [auth-flows.md](./auth-flows.md) | Sign-in and onboarding flow pages |
| [landing-pages.md](./landing-pages.md) | `/book` — Meta/Instagram ad lead capture landing page |
| [legal.md](./legal.md) | Privacy policy, terms of service, refund & cancellation policy |
| [admin.md](./admin.md) | 37 admin portal pages (7.1–7.37) |
| [api-routes.md](./api-routes.md) | 32 API endpoints: customer, admin, background jobs, webhooks |
| [external-subdomains.md](./external-subdomains.md) | Payload CMS, Fumadocs, BetterStack status page |
| [special-files.md](./special-files.md) | 10 special files: sitemap, robots, llms.txt, manifest, SW, etc. |
| [deep-links.md](./deep-links.md) | UTM contracts and deep link patterns |
| [summary.md](./summary.md) | Page count, role matrix, realtime subscription map, PWA capabilities, references |

---

## Cross-References

- [features.md](../features.md) — Full feature specifications and business rules
- [architecture.md](../architecture.md) — Infrastructure, routing, and project structure
- [authentication.md](../authentication.md) — Auth flow, roles, and permissions matrix
- [database-schema.md](../database-schema.md) — All 38 tables and relationships
- [background-jobs.md](../background-jobs.md) — All 19 scheduled/triggered jobs
- [ably-channels.md](../ably-channels.md) — Realtime channel structure and event payloads
- [email-strategy.md](../email-strategy.md) — All email templates and sending strategy
- [meta-pixel.md](../meta-pixel.md) — Meta Pixel + CAPI implementation
- [seo.md](../seo.md) — JSON-LD schemas, sitemap, robots.txt, AI search visibility
- [observability.md](../observability.md) — Monitoring stack (Sentry, BetterStack, PostHog, Clarity, Checkly)
