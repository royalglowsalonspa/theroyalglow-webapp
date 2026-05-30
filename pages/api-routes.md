# API Routes

> All API endpoints under `/api/*`. Thin layer: parse request → validate with Zod → delegate to business logic → return JSON response. All responses follow consistent shape: `{ success: boolean, data?: T, error?: { code, message } }`.

---

## 8a. Authentication

| Route | Method | Summary | Auth |
|-------|--------|---------|------|
| `/api/auth/[...betterauth]` | ALL | Better Auth catch-all: Google OAuth sign-in, callback, session check, sign-out, CSRF token generation. | No (handles auth itself) |

---

## 8b. Customer-Facing API

| Route | Method | Summary | Auth | Cache |
|-------|--------|---------|------|-------|
| `/api/services` | GET | All service categories + services. Returns: `{ categories: [{ id, name, services: [...] }] }` | No | Cloudflare KV (5-min TTL) |
| `/api/services/[slug]` | GET | Single service detail by slug. Returns: `{ service: { id, name, slug, description, pricePaise, durationMin, category, gemsRedeemable, gemsRequired, image } }` | No | Cloudflare KV |
| `/api/availability` | GET | Available time slots. Query params: `date` (YYYY-MM-DD), `serviceIds[]` (optional), `staffId` (optional). Returns: `{ slots: [{ startTime, endTime, available: boolean }] }` | No | No cache (real-time) |
| `/api/bookings` | GET | List authenticated customer's bookings. Query: `status`, `upcoming` (boolean). Returns: `{ bookings: [...] }` | Yes | No cache |
| `/api/bookings` | POST | Create a new booking. Body: `{ branchId, date, startTime, serviceIds[], leadId? }`. Returns: `{ booking: { id, bookingNumber, status: 'pending' } }`. Side effects: Ably publish, email via Resend, PostHog event. | Yes | — |
| `/api/bookings/[id]` | GET | Single booking detail for authenticated owner. Returns full booking with services, staff, status history, notes. | Yes | No cache |
| `/api/bookings/[id]/cancel` | POST | Cancel a booking. Validates: ≥4h before appointment (free) or late cancel (CRM tag). Body: `{ reason? }`. Side effects: slot released, Ably publish, email notification. | Yes | — |
| `/api/bookings/[id]/reschedule` | POST | Reschedule. Validates: max 2 reschedules, ≥1h before. Body: `{ newDate, newStartTime }`. Side effects: slot swap, Ably publish, calendar event updated, email. | Yes | — |
| `/api/leads` | POST | Lead capture from `/book`. Body: `{ name, phone, serviceInterested, metaEventId }`. No auth required. Side effects: lead row created, Meta CAPI `Lead` event fired. | No | — |
| `/api/onboarding/complete` | POST | Save onboarding data. Body: `{ name, phone, dob, gender, privacyConsent, analyticsConsent, marketingConsent }`. Side effects: profile created, acquisition source assigned, Brevo contact synced (if marketing consent), Meta CAPI `CompleteRegistration`, welcome email via Resend. | Yes | — |
| `/api/push/subscribe` | POST | Register Web Push subscription. Body: `{ endpoint, keys: { p256dh, auth } }`. Stores in Neon. | Yes | — |
| `/api/push/unsubscribe` | DELETE | Remove push subscription. Body: `{ endpoint }`. | Yes | — |
| `/api/ably/token` | POST | Ably Token Auth. Returns scoped JWT token based on user role. Customer: subscribe to own channels only. Admin: subscribe to admin channels. Staff: own schedule channel. Never includes publish capability. | Yes | — |

---

## 8c. Admin API

All routes require min. Receptionist role unless noted.

| Route | Method | Summary | Min. Role | Side Effects |
|-------|--------|---------|-----------|--------------|
| `/api/admin/bookings/[id]` | PATCH | Approve (assign staff), reject (with reason), or update booking. Body: `{ action: 'approve'|'reject'|'assign', staffAssignments?, rejectionReason? }` | Receptionist | Ably publish to customer + admin channels, email notification, calendar event (on approve) |
| `/api/admin/bookings/[id]/complete` | POST | Mark completed + checkout. Body: `{ paymentMethod, offerId? }`. Generates invoice, awards gems, emails PDF. | Receptionist | Invoice PDF generated (Render API), stored in R2, emailed (Resend), gems awarded, Meta CAPI `Purchase`, Brevo attributes updated, Ably publish |
| `/api/admin/bookings/[id]/noshow` | POST | Mark no-show. Increments `noshow_count`, checks tier threshold. | Receptionist | CRM tag applied if threshold reached, customer notified |
| `/api/admin/memberships` | POST | Create membership. Body: `{ customerId, tier, hours?, price?, startDate? }`. | Receptionist | `membership_purchase` invoice generated + emailed, customer notified |
| `/api/admin/memberships/[id]/session` | POST | Record session. Body: `{ serviceIds[], durationMinutes }`. Validates remaining hours. | Receptionist | Hours deducted, `membership_session` invoice (₹0) generated + emailed, booking row created |
| `/api/admin/leave` | POST | Submit leave request (staff self-service). Body: `{ date, leaveType, reason }`. | Staff | Push + email to receptionists/manager |
| `/api/admin/leave/[id]` | PATCH | Approve or reject leave. Body: `{ action: 'approve'|'reject', rejectionReason? }`. | Receptionist | Ably publish to staff channel, email notification, schedule slot blocked (if approved) |


---

## 8d. Background Job Endpoints (QStash)

Called by Upstash QStash scheduler. Verified via `Upstash-Signature` header. Never called directly by browser.

| Route | Schedule | Summary | On Failure |
|-------|----------|---------|------------|
| `/api/jobs/appointment-reminders` | Every 15 min | Finds confirmed bookings in next 24h/1h without matching reminder. Sends push (Web Push API) + email (Resend). | BetterStack heartbeat missed → alert |
| `/api/jobs/membership-expiry` | Daily 12:30 AM IST | Finds memberships expiring in 30d/7d/1d. Sends push + email reminders. | BetterStack heartbeat missed |
| `/api/jobs/birthday-emails` | Daily 9:30 AM IST | Finds customers with today's DOB. Sends birthday offer email (Brevo) + push notification. | Silent fail (non-critical) |
| `/api/jobs/membership-usage-nudges` | Daily 11:00 AM IST (Wed only) | Randomised batch: reminds active members with unused hours (≤30d to expiry, >60min remaining). Respects 7-day cooldown. | Silent fail |
| `/api/jobs/lead-followups` | Daily 10:30 AM IST | Finds leads in "New" status for 48h+ without contact. Alerts assigned receptionist via push + Ably. | Silent fail |
| `/api/jobs/daily-sales-report` | Daily 10:30 PM IST | Compiles today's revenue, booking count, Cash/UPI/Card breakdown. Emails to Owner/Manager. | BetterStack heartbeat missed |
| `/api/jobs/weekly-report` | Monday 9:00 AM IST | Week-over-week revenue comparison, top services, new customers. Emails to Owner/Manager. | Silent fail |
| `/api/jobs/gems-expiry-reminder` | Daily 10:30 AM IST | Finds customers with gems expiring in 7 days. Sends push notification. | Silent fail |
| `/api/jobs/post-service-followup` | +24h after completed | Sends post-service email with Google Maps review link (Brevo template). | Silent fail |
| `/api/jobs/stale-booking-alert` | +2h after pending created | If booking still pending after 2h, alerts receptionists via push + Ably `admin:bookings`. | Silent fail |
| `/api/jobs/noshow-check` | +15min after scheduled end_time | If booking status still "confirmed" after end time, alerts receptionist to check if no-show. | Silent fail |
| `/api/jobs/membership-expired-notice` | +1h after expires_at | Final expiry email with renewal prompt (Resend template). | Silent fail |

---

## 8e. Incoming Webhooks

Signature-verified. External services push data into the system.

| Route | Method | Source | Verification | Summary |
|-------|--------|--------|-------------|---------|
| `/api/webhooks/meta-leads` | POST | Meta Lead Gen (Instant Forms) | Meta signature verification | Receives leads from Instagram/Facebook native forms. Saves to `lead` table with source `meta_ad`, ad_id, campaign_id. Fires Meta CAPI `Lead` event as confirmation. |
| `/api/webhooks/aisensy` | POST | AiSensy | AiSensy webhook signature | WhatsApp lead status change notification. Updates `lead` record status in Neon to keep pipeline in sync. |



---

### Favourite Services API

| Route | Method | Summary | Auth |
|-------|--------|---------|------|
| `/api/favourites` | GET | List authenticated user's favourite service IDs. Returns: `{ favourites: string[] }` ordered by most recently added. | Yes |
| `/api/favourites` | POST | Add a service to favourites. Body: `{ serviceId: string }`. Idempotent — silently succeeds if already favourited. | Yes |
| `/api/favourites` | DELETE | Remove a service from favourites. Body: `{ serviceId: string }`. Idempotent — silently succeeds if not favourited. | Yes |
