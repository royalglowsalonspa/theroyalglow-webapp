# Summary — Counts, Roles, Realtime, PWA & References

> Aggregate reference tables covering page counts, role access matrix, realtime subscription map, PWA offline capabilities, and cross-document references.

---

## 12. Page Count Summary

| Section | Count | Notes |
|---------|-------|-------|
| Customer public pages | 8 | Homepage, services, offers, about, contact, blog, blog post, FAQ |
| Customer authenticated pages | 5 | Profile, bookings, booking detail, membership, gems |
| Booking dialog (overlay) | 1 | 4-step dialog on homepage (not a route) |
| Auth flow pages | 2 | Sign-in, onboarding |
| Landing pages | 1 | `/book` (Meta ad lead capture) |
| Legal pages | 3 | Privacy, terms, refund policy |
| Admin pages | 37 | Dashboard, bookings (4), CRM (2), leads (2), staff (3), schedule (2), services (3), offers (3), memberships (3), billing (2), reports (6), settings (1), branches (2), users (1), integrations (1), logs (1) |
| Customer API routes | 13 | Auth, services, availability, bookings, leads, onboarding, push, ably |
| Admin API routes | 7 | Booking actions, memberships, leave |
| Background job endpoints | 12 | QStash-triggered scheduled work |
| Webhook endpoints | 2 | Meta Leads, AiSensy |
| External subdomains | 3 | Payload CMS, Fumadocs, BetterStack |
| Special files/endpoints | 10 | Sitemap, robots, llms.txt, manifest, SW, OG, favicon, apple-icon, health |
| **Total unique routes/endpoints** | **~104** | |

---

## 13. Role Access Matrix

Quick reference: which roles can access which page sections.

| Section | Customer | Staff | Receptionist | Manager | Owner | Developer |
|---------|:--------:|:-----:|:------------:|:-------:|:-----:|:---------:|
| Public pages (`/`, `/services`, etc.) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auth pages (`/profile`, `/bookings`, `/membership`, `/gems`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/admin` dashboard | — | 🔒 Limited | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| `/admin/bookings/*` | — | — | ✅ | ✅ | ✅ | ✅ |
| `/admin/customers/*` | — | — | ✅ | ✅ | ✅ | ✅ |
| `/admin/leads/*` | — | — | ✅ | ✅ | ✅ | ✅ |
| `/admin/memberships/*` | — | — | ✅ | ✅ | ✅ | ✅ |
| `/admin/billing/*` | — | — | ✅ | ✅ | ✅ | ✅ |
| `/admin/schedule` | — | — | ✅ | ✅ | ✅ | ✅ |
| `/admin/leave` | — | 🔒 Own only | ✅ | ✅ | ✅ | ✅ |
| `/admin/staff/*` | — | — | — | ✅ | ✅ | ✅ |
| `/admin/services/*` | — | — | — | ✅ | ✅ | ✅ |
| `/admin/offers/*` | — | — | — | ✅ | ✅ | ✅ |
| `/admin/reports/*` | — | — | — | ✅ | ✅ | ✅ |
| `/admin/settings` | — | — | — | ✅ | ✅ | ✅ |
| `/admin/branches/*` | — | — | — | — | ✅ | ✅ |
| `/admin/users` | — | — | — | — | ✅ | ✅ |
| `/admin/integrations` | — | — | — | — | — | ✅ |
| `/admin/logs` | — | — | — | — | — | ✅ |


**🔒 Legend:**
- Staff sees: own schedule, own appointments, own leave history only
- Receptionist: full day-to-day operations
- Manager: all receptionist + catalog/pricing/reports/settings
- Owner: all manager + branches/users
- Developer: everything including integrations and error logs

---

## 14. Realtime Subscription Map (Ably Channels)

Which pages subscribe to which Ably channels for live updates.

| Page | Channel | Events Received | UI Effect |
|------|---------|----------------|-----------|
| `/bookings` | `customer:{userId}:bookings` | `booking.created`, `booking.status_changed`, `booking.rescheduled`, `booking.cancelled`, `booking.staff_assigned` | Status badges animate, cards appear/move |
| `/bookings/[id]` | `booking:{bookingId}` | `status.changed`, `note.added`, `service.added`, `service.removed` | Timeline extends, notes appear live |
| `/admin` (dashboard) | `admin:bookings` | `booking.new`, `booking.status_changed`, `booking.walkin_created`, `booking.cancelled`, `booking.no_show` | Pending count updates, feed refreshes |
| `/admin/bookings` | `admin:bookings` | Same as above | Table rows update in-place |
| `/admin/bookings/[id]` | `booking:{bookingId}` | `status.changed`, `note.added` | Detail panel live-updates |
| `/admin/schedule` | `admin:schedule:{YYYY-MM-DD}` | `slot.booked`, `slot.released`, `staff.marked_off`, `leave.approved` | Grid slots fill/release live |
| `/admin/leave` | `admin:leave` | `leave.requested`, `leave.withdrawn` | Queue updates without refresh |
| Staff dashboard | `staff:{staffId}:schedule` | `booking.assigned`, `booking.unassigned`, `leave.approved`, `leave.rejected` | Schedule updates live |

---

## 15. PWA & Offline Capabilities

| Content | Cached (Offline) | Why |
|---------|:----------------:|-----|
| Service menu + prices | ✅ | Customer can browse services on bad network |
| Contact page | ✅ | Address, phone, hours always accessible |
| FAQ page | ✅ | Common questions answered offline |
| Homepage shell | ✅ | App feels instant on repeat visits |
| Gallery thumbnails | ✅ | Premium feel maintained |
| Booking flow | ❌ | Requires server (slot availability, auth) |
| Profile / Bookings | ❌ | Requires auth + live data |
| Admin pages | ❌ | All require server |

**Install prompt strategy:** Shown after 2nd visit (not first — first feels pushy). Custom branded prompt using `beforeinstallprompt` event.

---

## 16. References

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
