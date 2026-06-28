# Customer-Facing — Authenticated Pages

> These 5 pages require Google OAuth sign-in. Accessible to role `customer` and above. Redirect to `/sign-in` if unauthenticated.

---

## 2.1 `/profile` — My Profile

| Property | Detail |
|----------|--------|
| **Title** | My Profile |
| **Purpose** | View and edit personal details, manage notification preferences and consent. |
| **Rendering** | SSR (auth-gated) |
| **SEO** | `robots: noindex, nofollow` (private page) |

**UI Components:**
- Profile card: avatar (Google profile pic), name, email (read-only, greyed out)
- Editable fields form: name, phone, DOB (date picker, DD/MM/YYYY), gender (select)
- "Member Since" + "Last Updated" timestamps (DD/MM/YYYY format)
- Notification preferences section (toggle switches):
  - Appointment reminders (push + email) — default ON
  - Membership alerts — default ON
  - Marketing emails & offers — respects onboarding consent
- Analytics consent toggle (DPDP Act)
- "Delete My Account" link (leads to support email — DPDP Act right to erasure)
- Save button with form validation

**States:**
- Loading: skeleton form fields
- Saving: button shows spinner, fields disabled
- Success: toast "Profile updated successfully"
- Validation error: inline field errors via `aria-describedby`

**Data source:** `customer_profile` table + Better Auth `user` table

---

## 2.2 `/bookings` — My Bookings

| Property | Detail |
|----------|--------|
| **Title** | My Bookings |
| **Purpose** | View all upcoming and past bookings with status and available actions. |
| **Rendering** | SSR (auth-gated) |
| **SEO** | `robots: noindex, nofollow` |

**UI Components:**
- Tab bar: "Upcoming" (default active) | "Past"
- Booking cards (per booking):
  - Status badge: coloured pill (Pending=amber, Confirmed=green, In Progress=blue, Completed=grey, Cancelled=red, Rejected=red-outline)
  - Booking number: `#BKRS2605H38291`
  - Date + time: `24 May 2026 (Saturday) · 03:30 PM`
  - Services list (truncated to 2, "and X more" if > 2)
  - Total amount: `₹1,300.00`
  - Assigned staff (shown only after confirmation)
- Action buttons per status:
  - Pending: "Edit Services" | "Reschedule" | "Cancel"
  - Confirmed: "Reschedule" | "Cancel"
  - Completed: "View Invoice" | "Book Again"
  - Rejected: "View Reason" | "Book Again"
  - Cancelled: "Book Again"

**States:**
- Loading: skeleton cards (3 placeholders)
- Empty (Upcoming): "No upcoming bookings. Ready for your next Royal Glow moment?" + "Book Now" CTA
- Empty (Past): "No past bookings yet."
- Error: "Unable to load bookings." with retry

**Realtime (Ably):**
- Subscribes to: `customer:{userId}:bookings`
- Live updates: status badge animates on change, new bookings appear, cancelled bookings move sections
- Events: `booking.created`, `booking.status_changed`, `booking.rescheduled`, `booking.cancelled`, `booking.staff_assigned`

**Mobile vs Desktop:**
- Mobile: full-width stacked cards, swipe actions (reschedule/cancel)
- Desktop: table-style list with action buttons inline

**Data source:** `GET /api/bookings` (authenticated)

---

## 2.3 `/bookings/[id]` — Booking Detail

| Property | Detail |
|----------|--------|
| **Title** | Booking Detail |
| **Purpose** | Full detail view of a single booking with status timeline and all associated data. |
| **Rendering** | SSR (auth-gated, ownership check) |
| **SEO** | `robots: noindex, nofollow` |

**UI Components:**
- Status timeline: visual stepper showing all status transitions with timestamps
  - Each step: status name, timestamp, changed by (system/receptionist name)
  - Rejection reason shown inline at rejected step
- Booking info card:
  - Booking number, branch name
  - Date + time + total duration
  - Service type badge (Salon / SPA)
- Services list (detailed):
  - Service name, individual price, duration, assigned staff (after confirmation)
- Payment summary:
  - Subtotal, discount (if offer applied), GST breakdown, total
  - Payment note: "Pay at the salon (Cash / UPI / Card)"
- Staff assignment (after confirmation): name + designation
- Notes section (if any staff notes visible to customer)
- Invoice link (after completion): "View Invoice PDF" button
- Google Maps review prompt (after completion): "Rate your experience →" with Maps link
- Action buttons (context-dependent based on current status)

**States:**
- Loading: skeleton timeline + info card
- 404: "Booking not found" with back link
- Error: "Unable to load booking details." with retry

**Realtime (Ably):**
- Subscribes to: `booking:{bookingId}`
- Live updates: status timeline extends, notes appear, staff assignment shows
- Events: `status.changed`, `note.added`, `service.added`, `service.removed`

**Data source:** `GET /api/bookings/[id]` (authenticated, ownership verified)

---

## 2.4 `/membership` — SPA Membership

| Property | Detail |
|----------|--------|
| **Title** | My SPA Membership |
| **Purpose** | View active membership details, hours balance, session history, and past memberships. |
| **Rendering** | SSR (auth-gated) |
| **SEO** | `robots: noindex, nofollow` |
| **Visibility** | Only shown in navigation if customer has an active or past membership |

**UI Components:**
- Active membership card (if exists):
  - Tier badge: Silver / Gold / Platinum (colour-coded)
  - Membership ID: `#RGMEM26XXXXX`
  - Hours progress bar: visual bar showing used vs remaining (e.g., `████████░░░░ 5 hrs used · 3 hrs remaining`)
  - Numeric breakdown: `X hrs used / Y hrs total / Z hrs remaining`
  - Expiry date: `Valid until: DD/MM/YYYY` with days remaining count
  - Expiry urgency: amber badge if ≤30 days, red badge if ≤7 days
- Session history table:
  - Columns: date, service performed, duration, staff
  - Sorted by most recent first
  - Pagination if > 10 sessions
- Past memberships (collapsed section):
  - Accordion: "Past Memberships (X)" → expandable list
  - Each shows: tier, dates active, hours used/total, status (expired/cancelled)
- No membership state: section not shown in navigation at all

**States:**
- Loading: skeleton card + table rows
- No active membership: "You don't have an active SPA membership" + "Visit us to learn about membership options" + phone number
- Error: "Unable to load membership details." with retry

**Data source:** `spa_membership` + `booking` (where `is_membership_session = true`) tables

---

## 2.5 `/gems` — Gems Catalogue

| Property | Detail |
|----------|--------|
| **Title** | Royal Gems |
| **Purpose** | View gems balance, browse redeemable services, and see transaction history. |
| **Rendering** | SSR (auth-gated) |
| **SEO** | `robots: noindex, nofollow` |

**UI Components:**
- Gems balance hero: large number display with gem icon, e.g., "💎 42 Gems"
- Earn rate info: "Earn 1 gem per ₹100 spent. Gems expire 1 year after earning."
- Expiry warning: if any gems expiring within 30 days, show amber alert banner
- Redeemable services catalogue:
  - Grid of service cards available for gem redemption
  - Each card: service name, gems required, "Redeem" badge
  - Greyed out if customer doesn't have enough gems
- Transaction history (expandable section):
  - Table: date, description (earned/redeemed/expired), amount (+/- gems), balance after
  - Sorted by most recent first

**States:**
- Loading: skeleton balance + card grid
- Zero gems: "You haven't earned any gems yet. Book a service to start earning!" + "Book Now" CTA
- Error: "Unable to load gems." with retry

**Business rules displayed:**
- Cannot combine gems redemption with offers on same booking
- Gems expire 1 year after earning date
- Gems earned: `floor(total_rupees × 0.01)` per paid invoice
- No gems earned on: membership purchases, membership sessions, gem-redemption bookings

**Data source:** `gems_transaction` table + computed balance



---

### Favourite Services (Heart Icon)

**Appears on:** `/services` page, Booking Dialog Step 3

**UI Components:**
- Heart icon (♡ empty / ❤️ filled) on top-right corner of every service card
- "Your Favourites" section at the top of Step 3 in booking dialog (only shown if user has ≥1 favourite)
- Favourited services listed first, separated from regular service order by a section header

**Behaviour:**
- Tap heart → instant toggle (optimistic UI), API call in background
- If user has 0 favourites → "Your Favourites" section not shown
- Heart icon only visible when signed in (hidden for unauthenticated users on /services)
- No limit on number of favourites

**Data source:** `GET /api/favourites` (fetched on page mount alongside services)
