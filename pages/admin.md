# Admin Portal Pages

> All 37 admin routes are RBAC-gated. Unauthenticated or under-privileged requests redirect to `/sign-in`. Layout: persistent sidebar navigation (collapsible on mobile) + top bar with user name, role badge, and notification bell.

**Shared admin layout components:**
- Sidebar nav: grouped sections (Dashboard, Bookings, CRM, Leads, Staff, Schedule, Services, Offers, Memberships, Billing, Reports, Settings, Branches, Users, Integrations, Logs) — items shown/hidden based on role
- Top bar: breadcrumbs, user avatar + name + role, notification bell (Ably-powered real-time count)
- Mobile: sidebar collapses to hamburger menu overlay
- Command palette: `Cmd+K` / `Ctrl+K` to search pages, customers, bookings by number
- Toast notifications: bottom-right stack for async operation confirmations

---

## 7.1 `/admin` — Dashboard

| Property | Detail |
|----------|--------|
| **Title** | Admin Dashboard |
| **Min. Role** | Receptionist (Staff sees limited "My Schedule" view) |
| **Purpose** | Today's operational overview with pending actions and quick-access buttons. |

**UI Components (Receptionist+ view):**
- KPI cards row: Pending Bookings (count + badge), Today's Revenue (₹), Today's Appointments (count), Stale Leads (count)
- Today's booking feed: chronological list of today's appointments (time, customer, services, status, staff)
- Pending actions panel:
  - Unreviewed bookings (pending status) — clickable, links to booking detail
  - Leave requests awaiting approval
  - Stale leads (48h+ without contact)
  - Stale bookings (2h+ in pending without review)
- Quick-action buttons: "Create Walk-in" | "View Schedule" | "Lead Pipeline"
- Recent activity feed: last 10 system events (booking confirmed, invoice generated, lead captured, etc.)

**UI Components (Staff-only view — Stylist/Therapist):**
- Today's assigned appointments: customer first name, service, time, duration
- Next 7 days upcoming appointments
- "Submit Leave Request" button
- Cannot see: other staff bookings, customer contact details, prices, invoices, revenue, CRM data

**States:**
- Loading: skeleton KPI cards + feed rows
- Empty (no bookings today): "No appointments today. Enjoy the quiet!" with schedule link

**Realtime (Ably):**
- Subscribes to: `admin:bookings`
- Live updates: new booking appears in pending queue, status changes animate, revenue KPI updates
- Events: `booking.new`, `booking.status_changed`, `booking.walkin_created`

---

## 7.2 `/admin/bookings` — All Bookings

| Property | Detail |
|----------|--------|
| **Title** | All Bookings |
| **Min. Role** | Receptionist |
| **Purpose** | Full booking list with comprehensive filtering and search. |


**UI Components:**
- Filters bar (sticky):
  - Status multi-select: pending, confirmed, in_progress, completed, cancelled, rejected, no_show
  - Date range picker
  - Staff filter (dropdown)
  - Service type toggle: All / Salon / SPA
  - Walk-in toggle
  - Search: by booking number, customer name, phone
- Data table:
  - Columns: Booking #, Customer, Date/Time, Services (truncated), Status (badge), Staff, Total, Type, Actions
  - Sortable columns: date, status, total
  - Row click → navigates to `/admin/bookings/[id]`
- Pagination: 25 per page with page navigation
- Bulk actions: none (each booking handled individually)

**States:**
- Loading: table skeleton rows
- Empty (with filters): "No bookings match your filters." with clear-filters button
- Empty (no filters): "No bookings yet." (unlikely in production)

**Realtime (Ably):**
- Subscribes to: `admin:bookings`
- Live updates: new rows appear at top, status badges animate in-place

---

## 7.3 `/admin/bookings/new` — Create Walk-in

| Property | Detail |
|----------|--------|
| **Title** | Create Walk-in Booking |
| **Min. Role** | Receptionist |
| **Purpose** | Create a booking for a customer who is physically present. Skips pending → directly confirmed. |

**UI Components:**
- Customer search/select: searchable dropdown (name/phone/email) + "New Customer" option
- Service selector: Salon/SPA toggle → category → multi-select services
- Staff assignment: dropdown per service (required — walk-in gets immediate assignment)
- Time: defaults to "now", adjustable
- Notes field: optional text area
- Submit button: "Create Walk-in" → booking created with status `confirmed`

**Business rule:** Walk-in no-shows do NOT count toward no-show tier (customer is already present).

**States:**
- Validation: customer required, at least 1 service, staff assignment required
- Submitting: button spinner
- Success: redirect to `/admin/bookings/[newId]` with success toast

---

## 7.4 `/admin/bookings/[id]` — Booking Detail (Admin)

| Property | Detail |
|----------|--------|
| **Title** | Booking Detail |
| **Min. Role** | Receptionist |
| **Purpose** | Full booking management: approve, reject, assign staff, change status, checkout, add notes. |

**UI Components:**
- Status timeline (same as customer view but with admin context — who changed what)
- Customer info card: name, phone (click-to-call), email, CRM tags, no-show tier badge
- Booking info: number, branch, date, time, type (Salon/SPA), walk-in flag
- Services panel:
  - Service list with staff assignment dropdowns (editable while pending/confirmed)
  - Add/remove services (while pending)
  - Individual prices
- Action buttons (context-dependent):
  - Pending: "Approve" (green) | "Reject" (red, opens reason modal)
  - Confirmed: "Mark In Progress" | "Reschedule" | "Cancel" | "Mark No-Show"
  - In Progress: "Mark Completed" (opens checkout flow)
  - Completed: "View Invoice" | "Resend Invoice Email"
- Checkout flow (on "Mark Completed"):
  - Apply offer dropdown (optional, max 1 per customer per day)
  - Payment method selector: Cash / UPI / Card
  - Invoice preview: line items, GST breakdown, total
  - "Complete & Generate Invoice" button
- Notes section:
  - Timeline of staff notes (author, timestamp, text)
  - "Add Note" text input
- Status history log: full audit trail (who, what, when, reason)
- Rejection modal: reason text input (required when rejecting)

**States:**
- Loading: skeleton panels
- 404: "Booking not found" with back link
- Checkout submitting: invoice generation spinner (may take 2–3s for PDF)

**Realtime (Ably):**
- Subscribes to: `booking:{bookingId}`
- Live updates: notes appear, status changes (if another admin acts simultaneously)

**Connected actions on complete:**
- Invoice generated (PDF via Render API → stored in R2)
- Invoice emailed to customer (Resend with PDF attachment)
- Gems awarded: `floor(total_rupees × 0.01)` (unless membership session or gem redemption)
- Meta CAPI: `Purchase` event fired (with revenue value)
- Brevo: customer attributes updated (LAST_VISIT_DATE, TOTAL_VISITS, TOTAL_SPEND_PAISE)


---

## 7.5 `/admin/waitlist` — Waitlist

| Property | Detail |
|----------|--------|
| **Title** | Waitlist |
| **Min. Role** | Receptionist |
| **Purpose** | Manage customers waiting for fully-booked slots. Promote to booking when slot opens. |

**UI Components:**
- Waitlist entries table: customer name, requested date/time, services, date added, status
- "Promote to Booking" button: creates a booking from waitlist entry, sends notification to customer
- "Remove" button: removes from waitlist with optional notification
- Filter: by date, service type

**States:**
- Empty: "No one on the waitlist right now."

---

## 7.6 `/admin/customers` — Customer List (CRM)

| Property | Detail |
|----------|--------|
| **Title** | Customer List |
| **Min. Role** | Receptionist |
| **Purpose** | Search and browse all customers with CRM tags, lifetime value, and visit data. |

**UI Components:**
- Search bar: name, phone, email (instant search with debounce)
- Tag filter: multi-select chips (VIP, Frequent, Inactive, No-Show Risk, custom tags)
- Sort options: LTV (descending), Visit Count, No-Show Count, Last Visit, Signup Date
- Customer table:
  - Columns: Name, Phone, Email, Visits, LTV (₹), Last Visit, Tags, Status
  - Row click → navigates to `/admin/customers/[id]`
- Pagination: 50 per page

**States:**
- Loading: table skeleton
- Empty (with search): "No customers found matching '[query]'"
- Empty (no customers): N/A (always seeded data)

---

## 7.7 `/admin/customers/[id]` — Customer Profile (CRM)

| Property | Detail |
|----------|--------|
| **Title** | Customer Profile |
| **Min. Role** | Receptionist |
| **Purpose** | Complete 360° customer view with all historical data, CRM notes, and actionable insights. |

**UI Components:**
- Profile header: avatar, name, phone (click-to-call), email, gender, DOB, member since
- CRM tags: editable tag chips (VIP, Frequent, Inactive, No-Show Risk) + "Add Tag" button
- Acquisition source badge: organic / gmb / walkin / meta_ad (with UTM campaign if applicable)
- KPI cards row: Total Visits, Lifetime Value (₹), Avg Spend/Visit, No-Show Count, Gems Balance
- No-show tier indicator: if tier 4+ reached, red badge with "Requires Manager Approval" label
- Tabs:
  - **Bookings**: full booking history table (status, date, services, total, staff)
  - **Invoices**: all invoices (type badge: service/membership_purchase/membership_session, date, total, PDF link)
  - **Membership**: active/past memberships with hours breakdown
  - **Gems**: transaction history (earned/redeemed/expired)
  - **Notes**: timeline of staff notes (author, date, text) + "Add Note" input
- Quick actions: "Create Booking" | "View Lead" (if converted from lead)

**States:**
- Loading: skeleton header + tabs
- 404: "Customer not found"

---

## 7.8 `/admin/leads` — Lead Pipeline

| Property | Detail |
|----------|--------|
| **Title** | Lead Pipeline |
| **Min. Role** | Receptionist |
| **Purpose** | Manage Meta/Instagram campaign leads through the conversion pipeline. |

**UI Components:**
- View toggle: Kanban board | Table view
- Kanban columns: New → Contacted → Follow-up → Booked → Won / Lost
  - Each card: name, phone, service interest, source campaign, days since capture, assigned staff
  - Drag-and-drop between columns (updates status)
- Table view: sortable columns (name, phone, service, status, campaign, created, assigned to)
- Filters: campaign, date range, assigned staff, status
- Lead count badges on each column header
- "Stale" indicator: red dot on leads not contacted within 48h
- Click any lead → navigates to `/admin/leads/[id]`

**States:**
- Loading: skeleton kanban cards
- Empty: "No leads captured yet. Campaign leads from Meta/Instagram will appear here."

---

## 7.9 `/admin/leads/[id]` — Lead Detail

| Property | Detail |
|----------|--------|
| **Title** | Lead Detail |
| **Min. Role** | Receptionist |
| **Purpose** | Full lead information with notes, attribution, and conversion tracking. |

**UI Components:**
- Lead info card: name, phone (click-to-call + WhatsApp deep link), service interested in
- Attribution panel: UTM source, campaign, content, ad set (if from Meta webhook)
- Status selector: dropdown to change pipeline stage
- Assigned to: dropdown to assign receptionist
- AiSensy WhatsApp link: "Open in AiSensy" button (deep link to WhatsApp thread)
- Converted booking link: if lead converted → link to `/admin/bookings/[id]`
- Notes timeline: chronological notes (call notes, preferences, follow-up reminders) + "Add Note" input
- Quick actions: "Create Booking from Lead" | "Mark Won" | "Mark Lost" (with reason)

**States:**
- Loading: skeleton card
- 404: "Lead not found"


---

## 7.10 `/admin/staff` — Staff List

| Property | Detail |
|----------|--------|
| **Title** | Staff Management |
| **Min. Role** | Manager |
| **Purpose** | View all staff members with designation, status, and schedule summary. |

**UI Components:**
- Staff cards/table: name, photo, designation (Stylist/Therapist/Receptionist/Manager), active status, today's booking count
- Filter: by designation, active/inactive
- Row click → navigates to `/admin/staff/[id]`
- "Add Staff" button → navigates to `/admin/staff/new`

---

## 7.11 `/admin/staff/new` — Add Staff

| Property | Detail |
|----------|--------|
| **Title** | Add Staff Member |
| **Min. Role** | Manager |
| **Purpose** | Create a new staff profile: link to user account, assign designation and services. |

**UI Components:**
- User selector: search existing users by name/email (must have an account)
- Designation: select (Stylist / Therapist / Receptionist / Manager)
- Bio/specialization: text area
- Services they can perform: multi-select from service catalogue
- Initial schedule: weekly grid (select working days/hours)
- Submit button: "Add Staff Member"

---

## 7.12 `/admin/staff/[id]` — Staff Profile

| Property | Detail |
|----------|--------|
| **Title** | Staff Profile |
| **Min. Role** | Manager |
| **Purpose** | Full staff detail with schedule, leave history, performance metrics, and assigned services. |

**UI Components:**
- Profile header: photo, name, designation, active status toggle
- Tabs:
  - **Schedule**: weekly grid showing working hours, current week highlighted
  - **Leave History**: table of all leave requests (date, type, status, reason)
  - **Performance**: KPI cards — bookings completed, revenue attributed, utilisation rate (booked/available hours)
  - **Services**: list of services this staff member can perform (editable)
- Quick actions: "Edit Schedule" | "View Today's Bookings"

---

## 7.13 `/admin/schedule` — Staff Schedule

| Property | Detail |
|----------|--------|
| **Title** | Staff Schedule |
| **Min. Role** | Receptionist |
| **Purpose** | Weekly/daily calendar view of all staff availability, booked slots, and leave. |

**UI Components:**
- View toggle: Daily | Weekly
- Date navigation: previous/next arrows + date picker
- Schedule grid: rows = staff members, columns = time slots (30-min increments)
  - Booked slots: filled with booking colour (Salon=purple, SPA=teal) + customer first name
  - Available slots: open/white
  - Leave/off: greyed out with "Leave" label
  - Buffer time: hatched pattern between bookings
- Staff column: name + designation + avatar
- Click on booked slot → navigates to booking detail
- Click on empty slot → "Create Walk-in" prefilled with staff + time

**States:**
- Loading: grid skeleton with time headers
- Empty day: all slots available (no bookings)

**Realtime (Ably):**
- Subscribes to: `admin:schedule:{YYYY-MM-DD}` (selected date)
- Live updates: slots fill/release as bookings are made/cancelled, staff marked off
- Events: `slot.booked`, `slot.released`, `staff.marked_off`, `leave.approved`

---

## 7.14 `/admin/leave` — Leave Management

| Property | Detail |
|----------|--------|
| **Title** | Leave Management |
| **Min. Role** | Receptionist (Staff sees only "My Leave" view) |
| **Purpose** | Review, approve/reject leave requests. View staff leave calendar. |

**UI Components (Receptionist+ view):**
- Pending requests queue: cards with staff name, date, leave type, reason, "Approve" / "Reject" buttons
  - Warning badge: if staff has confirmed bookings on requested date
  - Rejection requires reason text input
- Staff leave calendar: monthly view showing approved leaves per staff (colour-coded by staff)
- "Mark Day-Off" button: directly mark a staff member absent for today (same-day, no pending step)
- Filter: by staff member, leave type, status

**UI Components (Staff-only view):**
- "Submit Leave Request" form: date picker, leave type (Sick/Casual/Personal/Other), reason
- Own leave history: table of past requests (date, type, status, reason, rejection reason if any)
- Pending requests: "Withdraw" button available (before review only)

**States:**
- Loading: skeleton queue
- Empty (no pending): "No pending leave requests. All caught up!"

**Realtime (Ably):**
- Subscribes to: `admin:leave`
- Live updates: new requests appear without refresh, withdrawn requests disappear
- Events: `leave.requested`, `leave.withdrawn`


---

## 7.15 `/admin/services` — All Services

| Property | Detail |
|----------|--------|
| **Title** | Service Catalogue |
| **Min. Role** | Manager |
| **Purpose** | Manage all services grouped by category. Toggle active/inactive, reorder display. |

**UI Components:**
- Category sections: Salon categories + SPA categories (collapsible)
- Service cards within each category:
  - Name, price (₹), duration, active/inactive toggle, gems config
  - Drag handle for reorder (within category)
- "Add Service" button → navigates to `/admin/services/new`
- Click service → navigates to `/admin/services/[id]`
- Inactive services: dimmed with "Inactive" badge (hidden from customer-facing pages)

---

## 7.16 `/admin/services/new` — Add Service

| Property | Detail |
|----------|--------|
| **Title** | Add New Service |
| **Min. Role** | Manager |

**UI Components:**
- Form fields: name, category (select), price (₹, GST-inclusive), duration (minutes), buffer time, description
- Gems config: "Redeemable with gems" toggle + gems required field, "Earns gems" toggle
- Image upload: drag-and-drop or file picker (uploaded to R2)
- Staff assignment: multi-select staff who can perform this service
- Active toggle: default ON
- Submit: "Create Service"

---

## 7.17 `/admin/services/[id]` — Edit Service

| Property | Detail |
|----------|--------|
| **Title** | Edit Service |
| **Min. Role** | Manager |

**UI Components:** Same form as "Add Service" but prefilled with current values. Additional:
- "Deactivate" button (soft-delete — hides from customers, preserves historical bookings)
- Booking count: "Used in X bookings" (read-only stat)

---

## 7.18 `/admin/offers` — All Offers

| Property | Detail |
|----------|--------|
| **Title** | Offers & Promotions |
| **Min. Role** | Manager |
| **Purpose** | List all offers: active, scheduled (future start), expired. |

**UI Components:**
- Status tabs: Active | Scheduled | Expired
- Offer cards: name, type badge (Percentage/Flat/Combo), discount value, linked services, validity dates, redemption count
- "Create Offer" button → navigates to `/admin/offers/new`
- Click offer → navigates to `/admin/offers/[id]`

---

## 7.19 `/admin/offers/new` — Create Offer

| Property | Detail |
|----------|--------|
| **Title** | Create Offer |
| **Min. Role** | Manager |

**Form fields:** name, type (percentage/flat/combo), discount value, linked services (multi-select), start date, end date, terms text, max redemptions (optional).

---

## 7.20 `/admin/offers/[id]` — Edit Offer

| Property | Detail |
|----------|--------|
| **Title** | Edit Offer |
| **Min. Role** | Manager |

**Additional vs create:** redemption count (read-only), "Deactivate" button, cannot edit after expiry (read-only view).

---

## 7.21 `/admin/memberships` — All Memberships

| Property | Detail |
|----------|--------|
| **Title** | SPA Memberships |
| **Min. Role** | Receptionist |
| **Purpose** | List all SPA memberships with status, tier, and customer info. |

**UI Components:**
- Filters: status (Active/Expired/Cancelled), tier (Silver/Gold/Platinum), customer search
- Membership table: customer name, membership ID, tier badge, hours used/remaining, expiry date, status badge
- Row click → navigates to `/admin/memberships/[id]`
- "Create Membership" button → navigates to `/admin/memberships/new`

---

## 7.22 `/admin/memberships/new` — Create Membership

| Property | Detail |
|----------|--------|
| **Title** | Create SPA Membership |
| **Min. Role** | Receptionist |

**UI Components:**
- Customer selector: searchable dropdown
- Tier selector: Silver / Gold / Platinum (radio cards with defaults shown)
- Hours: prefilled from tier default, **fully overridable** (for negotiated deals)
- Price: prefilled from tier default, **fully overridable**
- Start date: defaults to today, adjustable
- Expiry: auto-calculated display (`start_date + validity_days`)
- Payment method: Cash / UPI / Card
- Submit: "Create Membership" → generates `membership_purchase` invoice + emails customer

---

## 7.23 `/admin/memberships/[id]` — Membership Detail

| Property | Detail |
|----------|--------|
| **Title** | Membership Detail |
| **Min. Role** | Receptionist |

**UI Components:**
- Membership header: ID, tier badge, customer name (link to CRM profile), status badge
- Hours progress bar: visual + numeric (used / total / remaining)
- Expiry: date + days remaining + urgency colour
- Session history table: date, service, duration, staff
- Actions:
  - "Record Session" button: opens modal (select services, confirm duration, deduct hours)
  - "Cancel Membership" button (Manager+ only): confirmation dialog with reason
- Invoice link: link to the original `membership_purchase` invoice


---

## 7.24 `/admin/billing` — All Invoices

| Property | Detail |
|----------|--------|
| **Title** | Billing & Invoices |
| **Min. Role** | Receptionist |
| **Purpose** | Browse all invoices with filtering by type, date, and payment method. |

**UI Components:**
- Filters: type (service / membership_purchase / membership_session), date range, payment method (Cash/UPI/Card), customer search
- Invoice table:
  - Columns: Invoice #, Customer, Type badge, Date, Total (₹), Payment Method, Status
  - Row click → navigates to `/admin/billing/[id]`
- Export button: "Export CSV" for accountant/CA use (filtered data)
- Pagination: 50 per page

---

## 7.25 `/admin/billing/[id]` — Invoice Detail

| Property | Detail |
|----------|--------|
| **Title** | Invoice Detail |
| **Min. Role** | Receptionist |
| **Purpose** | Full invoice view with line items, GST breakdown, PDF preview, and email actions. |

**UI Components:**
- Invoice header: number (#INV1262XXXXX), date, type badge, status
- Customer info: name, email, phone
- Line items table:
  - Columns: Service (snapshot name), Staff (snapshot), Duration, Price (₹)
  - Snapshots: prices and names frozen at time of invoice (historical accuracy)
- Totals section:
  - Subtotal (base amount)
  - Discount (if offer applied — offer name + amount)
  - GST 18% (SAC 999721)
  - **Total (₹ GST-inclusive)**
  - Amount in words: "Rupees X Only"
- Payment info: method (Cash/UPI/Card), received by (receptionist name)
- Gems awarded: "+X gems" (if applicable)
- PDF preview: embedded viewer or "Download PDF" button
- Actions: "Resend Email" button (re-sends via Resend with PDF attachment), "Download PDF"
- Linked booking: link to `/admin/bookings/[id]`

---

## 7.26 `/admin/reports` — Reports Overview

| Property | Detail |
|----------|--------|
| **Title** | Reports & Analytics |
| **Min. Role** | Manager |
| **Purpose** | Top-level KPI dashboard with links to detailed report pages. |

**UI Components:**
- KPI cards: Today's Revenue, This Week's Bookings, Top Service (this month), Busiest Slot, New Customers (this month)
- Quick charts: revenue trend (last 7 days sparkline), booking volume (last 7 days)
- Report links grid: cards for each sub-report (Financial, Salon, SPA, Staff, Leads) with icon + description

---

## 7.27 `/admin/reports/financial` — Financial Report

| Property | Detail |
|----------|--------|
| **Title** | Financial Report |
| **Min. Role** | Manager |

**UI Components:**
- Date range selector: presets (Today, This Week, This Month, Last Month, Custom)
- Revenue chart: daily/monthly line/bar chart
- GST summary table: month, taxable amount, GST collected, total
- Payment method breakdown: pie chart (Cash vs UPI vs Card) + table with totals
- Daily summary table: date, booking count, revenue, avg transaction value
- Export: "Export for CA" button (CSV with GST-ready columns)

---

## 7.28 `/admin/reports/salon` — Salon Analytics

| Property | Detail |
|----------|--------|
| **Title** | Salon Analytics |
| **Min. Role** | Manager |

**UI Components:**
- Service category performance: bar chart (revenue per category)
- Most booked services: ranked list with count + revenue
- Revenue by individual service: sortable table
- Category trends: line chart over time (weekly/monthly)
- Date range filter

---

## 7.29 `/admin/reports/spa` — SPA Analytics

| Property | Detail |
|----------|--------|
| **Title** | SPA Analytics |
| **Min. Role** | Manager |

**UI Components:**
- Membership tier distribution: donut chart (Silver/Gold/Platinum)
- Membership utilisation rates: avg % hours used before expiry
- Session frequency: avg sessions per member per month
- Revenue split: memberships purchased vs per-session SPA income
- Forfeited hours: total hours lost to expiry (waste metric)
- Active vs expired memberships count

---

## 7.30 `/admin/reports/staff` — Staff Performance

| Property | Detail |
|----------|--------|
| **Title** | Staff Performance |
| **Min. Role** | Manager |

**UI Components:**
- Staff comparison table: name, bookings completed, revenue attributed, utilisation rate (%), avg rating signal
- Utilisation chart: booked hours / available hours per staff (bar chart)
- Revenue per staff: who generates the most revenue
- Date range filter
- Sort by any column

---

## 7.31 `/admin/reports/leads` — Lead Analytics

| Property | Detail |
|----------|--------|
| **Title** | Lead Analytics |
| **Min. Role** | Manager |

**UI Components:**
- Pipeline funnel visualisation: New → Contacted → Follow-up → Booked → Won (with drop-off %)
- Lead conversion rate: % of leads that became bookings
- Revenue per Meta campaign: table showing campaign name, spend (manual input), leads, bookings, revenue, ROAS
- Source comparison: chart comparing meta_ad vs organic vs gmb vs walkin
- Cost per lead / cost per acquisition metrics
- Date range filter


---

## 7.32 `/admin/settings` — System Settings

| Property | Detail |
|----------|--------|
| **Title** | Settings |
| **Min. Role** | Manager |

**UI Components:**
- Salon info section: business name, GST number (GSTIN), registered address, phone, email
- Business hours table: per-day open/close times (editable)
- Policy config keys (editable):
  - Cancellation window (hours): default 4
  - Max reschedules per booking: default 2
  - No-show threshold for manager approval: default 4
  - Consecutive completed to clear no-show flag: default 3
- Gems config:
  - Earn rate: gems per ₹100 (default 1)
  - Expiry days: default 365
- Membership tier defaults table: tier name, default hours, default price, default validity days
- Save button per section

---

## 7.33 `/admin/branches` — Branch Management

| Property | Detail |
|----------|--------|
| **Title** | Branch Management |
| **Min. Role** | Owner |

**UI Components:**
- Branch cards: name, address (truncated), status badge (operational/temporarily_closed/opens_soon/shutdown), primary flag
- "Add Branch" button (opens form)
- Click branch → navigates to `/admin/branches/[id]`

---

## 7.34 `/admin/branches/[id]` — Edit Branch

| Property | Detail |
|----------|--------|
| **Title** | Edit Branch |
| **Min. Role** | Owner |

**Form fields:** branch number, code (2-char), name, address (line1, line2, city, state, pincode), phone, email, Google Maps URL, Place ID, GPS (lat/lng), status (select), close reason (shown if temporarily_closed), opening date, primary toggle.

---

## 7.35 `/admin/users` — User Management

| Property | Detail |
|----------|--------|
| **Title** | User Management |
| **Min. Role** | Owner |
| **Purpose** | Manage all user accounts, roles, and access. |

**UI Components:**
- Filters: role (Customer/Staff/Receptionist/Manager/Owner/Developer), status (active/suspended/banned), signup date range
- User table: name, email, role badge, status, signup date, last active
- Row actions: "Change Role" (dropdown respecting hierarchy), "Suspend", "Ban", "View Sessions"
- Search: by name, email, phone
- Pagination: 50 per page

**Business rules:**
- Cannot assign a role higher than your own
- Cannot modify your own role
- Developer can assign Owner; Owner can assign Manager; Manager can assign Receptionist/Staff

---

## 7.36 `/admin/integrations` — Integrations (Developer Only)

| Property | Detail |
|----------|--------|
| **Title** | Integrations |
| **Min. Role** | Developer |

**UI Components:**
- Integration cards (read/edit):
  - Ably: connection status, channel count, last event timestamp
  - AiSensy: webhook URL, last webhook received, connection test button
  - Meta Pixel/CAPI: Pixel ID, last event fired, event count (24h), event match quality score
  - Sentry: DSN (masked), error count (24h), link to Sentry dashboard
  - BetterStack: heartbeat statuses, last pings, link to status page
  - Resend: domain verification status, emails sent (24h)
  - Brevo: API status, subscriber count, last campaign sent

---

## 7.37 `/admin/logs` — Error Logs (Developer Only)

| Property | Detail |
|----------|--------|
| **Title** | Error Logs |
| **Min. Role** | Developer |

**UI Components:**
- Filters: severity (error/warning/info), date range, route/endpoint
- Error list: timestamp, severity badge, error message (truncated), route, count (if grouped)
- Click error → expanded view with full stack trace, breadcrumbs, user context, request payload
- Source: Sentry API (fetched on-demand, not stored locally)
- "Open in Sentry" external link per error
