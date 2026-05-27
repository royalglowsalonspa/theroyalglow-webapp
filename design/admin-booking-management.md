# Admin Booking Management — Design Reference

> The receptionist/manager workflow for handling bookings: reviewing pending requests, approving/rejecting, assigning staff, managing the checkout flow, and handling no-shows. This is the most-used admin feature.

---

## 1. Admin Booking Lifecycle (Receptionist Perspective)

```
New booking notification arrives (Ably push)
    │
    ▼
┌──────────────────┐
│ Admin Dashboard   │  ← "Pending Bookings: 3" badge updates live
│ /admin            │
└────────┬─────────┘
         │
         │ Clicks pending booking
         ▼
┌──────────────────────────────────────────────────────────────────┐
│ /admin/bookings/[id]  — PENDING STATE                            │
│                                                                   │
│  Actions available:                                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  1. REVIEW booking details (customer, services, time)      │  │
│  │  2. ASSIGN staff to each service (dropdown per service)    │  │
│  │  3. APPROVE → status becomes 'confirmed'                   │  │
│  │     OR                                                     │  │
│  │  4. REJECT → must provide reason → status 'rejected'       │  │
│  │                                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
APPROVED    REJECTED
    │         │
    │         └── Customer sees reason
    │             Email: booking-rejected.tsx
    │             Push notification sent
    │             Flow ends here
    │
    ▼ (Customer arrives at salon)
┌──────────────────┐
│ Mark In Progress  │  ← Receptionist taps when customer checks in
└────────┬─────────┘
         │
         ▼ (Service completed)
┌──────────────────┐
│ Mark Completed    │  ← Opens checkout panel
│ (Checkout Flow)   │
└────────┬─────────┘
         │
         ├── Apply offer? (optional, max 1/customer/day)
         ├── Select payment method: Cash / UPI / Card
         ├── Review invoice preview
         ├── Click "Complete & Generate Invoice"
         │
         ▼
┌──────────────────┐
│ COMPLETED         │  → Invoice PDF generated
└──────────────────┘  → Email sent to customer
                      → Gems awarded
                      → Meta CAPI Purchase fired
                      → Brevo contact updated
```

---

## 2. Admin Bookings List — `/admin/bookings`

### Desktop Wireframe

```
┌─────────────────────────────────────────────────────────────────────────┐
│  All Bookings                                               [ + Walk-in ]│
│  ═══════════                                                             │
│                                                                          │
│  Filters:                                                                │
│  ┌────────────┐ ┌────────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐ │
│  │Status    ▼ │ │Date Range ▼│ │Staff   ▼ │ │All|Sal|SP│ │🔍 Search │ │
│  └────────────┘ └────────────┘ └──────────┘ └─────────┘ └──────────┘ │
│                                                                          │
│  ┌──────────┬───────────┬──────────┬──────────┬────────┬───────┬─────┐ │
│  │ Booking# │ Customer  │ Date/Time│ Services │ Status │ Staff │ ₹   │ │
│  ├──────────┼───────────┼──────────┼──────────┼────────┼───────┼─────┤ │
│  │ BK..8291 │ Priya S.  │ 24/05 ·  │ Facial,  │●Pending│ —     │1,300│ │
│  │          │           │ 15:30    │ Waxing   │        │       │     │ │
│  ├──────────┼───────────┼──────────┼──────────┼────────┼───────┼─────┤ │
│  │ BK..1023 │ Aisha K.  │ 24/05 ·  │ Swedish  │●Confir-│Meera  │2,500│ │
│  │          │           │ 11:00    │ Massage  │ med    │       │     │ │
│  ├──────────┼───────────┼──────────┼──────────┼────────┼───────┼─────┤ │
│  │ BK..7042 │ Rahul M.  │ 23/05 ·  │ Haircut  │●Comple-│Anjali │  500│ │
│  │          │           │ 14:00    │          │ ted    │       │     │ │
│  └──────────┴───────────┴──────────┴──────────┴────────┴───────┴─────┘ │
│                                                                          │
│  ← 1 2 3 ... 12 →                                                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

Row click → navigates to /admin/bookings/[id]
Status badges use colour scheme from README.md
New rows appear at top with slide-down animation (Ably live)
```

---

## 3. Booking Detail — Pending State (Admin View)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back to Bookings         Booking #BKRS2605H38291                      │
│  ═══════════════════════════════════════════════                          │
│                                                                          │
│  ┌─ Customer Info ──────────────────────────────────────────────────┐   │
│  │  Priya Sharma · 📞 +91 98765 43210 · priya@gmail.com            │   │
│  │  Tags: [Frequent] [VIP]    No-shows: 0    Source: organic        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ Booking Info ───────────────────────────────────────────────────┐   │
│  │  Date: 24 May 2026 (Saturday)    Time: 03:30 PM                  │   │
│  │  Type: Salon                      Branch: Rayasandra              │   │
│  │  Status: ● Pending                Walk-in: No                     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ Services & Staff Assignment ────────────────────────────────────┐   │
│  │                                                                   │   │
│  │  Service              Duration    Price     Assign Staff          │   │
│  │  ─────────────────────────────────────────────────────────────   │   │
│  │  Classic Facial       45 min      ₹500     [Anjali         ▼]   │   │
│  │  Waxing Full Arms     30 min      ₹800     [Priya M.       ▼]   │   │
│  │                                                                   │   │
│  │  Total: ₹1,300.00 (incl. GST)                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ Notes ──────────────────────────────────────────────────────────┐   │
│  │  Customer note: "Prefer Anjali for facial if available"           │   │
│  │                                                                   │   │
│  │  Add note: [________________________________] [Add]               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                                                                   │   │
│  │   [ Approve ✓ ]                    [ Reject ✕ ]                  │   │
│  │   (green, primary)                  (red, outline)                │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Reject Modal

```
When receptionist clicks "Reject ✕":

┌─────────────────────────────────────────────┐
│                                             │
│  Reject Booking?                            │
│  ───────────────                            │
│                                             │
│  #BKRS2605H38291 — Priya Sharma            │
│  24 May 2026 · 03:30 PM                    │
│                                             │
│  Reason (required):                         │
│  ┌─────────────────────────────────────┐   │
│  │ Staff unavailable for selected      │   │
│  │ time slot. Please try 4:00 PM      │   │
│  │ or another day.                     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ⚠️  The customer will see this reason      │
│     in their booking detail and email.      │
│                                             │
│  [ Cancel ]          [ Confirm Rejection ]  │
│                      (red, destructive)     │
│                                             │
└─────────────────────────────────────────────┘

After rejection:
  → Booking status → 'rejected'
  → Email: booking-rejected.tsx sent to customer
  → Push notification to customer
  → Ably: customer channel + admin channel updated
  → Slot released (was never truly blocked in pending)
```

---

## 5. Confirmed State — Receptionist Actions

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Booking #BKRS2605H38291           Status: ● Confirmed                   │
│                                                                          │
│  ┌─ Actions ────────────────────────────────────────────────────────┐   │
│  │                                                                   │   │
│  │  [ Mark In Progress ]  [ Reschedule ]  [ Cancel ]  [ No-Show ]  │   │
│  │  (blue, primary)       (outline)       (outline)   (red outline) │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Timeline:                                                               │
│  ● Submitted ─── 24 May, 10:15 AM (by customer)                        │
│  ● Confirmed ─── 24 May, 10:32 AM (by Reception — Anjali assigned)     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. In Progress → Checkout Flow

```
Receptionist clicks "Mark Completed" (service is done):

┌─────────────────────────────────────────────────────────────────────────┐
│  Checkout — #BKRS2605H38291                                              │
│  ═══════════════════════════                                             │
│                                                                          │
│  ┌─ Invoice Preview ────────────────────────────────────────────────┐   │
│  │                                                                   │   │
│  │  Service                Staff          Duration      Price        │   │
│  │  ───────────────────────────────────────────────────────────────  │   │
│  │  Classic Facial         Anjali         45 min        ₹500.00     │   │
│  │  Waxing Full Arms       Priya M.       30 min        ₹800.00     │   │
│  │                                                                   │   │
│  │  ─────────────────────────────────────────────────────────────── │   │
│  │  Subtotal                                            ₹1,101.69   │   │
│  │  GST 18% (SAC 999721)                               ₹  198.31   │   │
│  │  ═══════════════════════════════════════════════════════════════  │   │
│  │  Total                                               ₹1,300.00   │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ Apply Offer (optional) ─────────────────────────────────────────┐   │
│  │  [ No offer        ▼ ]                                            │   │
│  │  ┌──────────────────────────────────────────────────────────┐    │   │
│  │  │ No offer                                                  │    │   │
│  │  │ 20% off Facials (valid until 31/05)                      │    │   │
│  │  │ ₹500 off Hair Treatment (valid until 15/06)              │    │   │
│  │  └──────────────────────────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ Payment Method ─────────────────────────────────────────────────┐   │
│  │                                                                   │   │
│  │  (●) Cash     ( ) UPI     ( ) Card                               │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │         [ Complete & Generate Invoice ]                           │   │
│  │         (green, primary, full-width)                              │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ⟳ Generating invoice... (spinner shown after click, 2-3 seconds)       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### After Checkout Completes:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Booking #BKRS2605H38291           Status: ● Completed                   │
│                                                                          │
│  ┌─ Actions ────────────────────────────────────────────────────────┐   │
│  │  [ View Invoice PDF ]     [ Resend Invoice Email ]               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ✓ Invoice #INV1262XXXXX generated                                      │
│  ✓ Email sent to priya.sharma@gmail.com                                 │
│  ✓ +13 gems awarded (balance: 55)                                       │
│                                                                          │
│  Timeline:                                                               │
│  ● Submitted ─── 24 May, 10:15 AM                                      │
│  ● Confirmed ─── 24 May, 10:32 AM                                      │
│  ● In Progress── 24 May, 03:30 PM                                      │
│  ● Completed ─── 24 May, 04:45 PM (Invoice: #INV1262XXXXX)             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. No-Show Flow

```
Scenario: Appointment was at 03:30 PM, it's now 03:45 PM,
          customer hasn't shown up.

Option A — QStash auto-alert (15 min after end time):
┌──────────────────────────────────────────────────────────┐
│  🔔 Possible no-show                                      │
│                                                           │
│  Booking #BKRS2605H38291 (Priya Sharma)                  │
│  Scheduled: 03:30 PM — still shows "Confirmed"           │
│                                                           │
│  [ View Booking ]  [ Dismiss ]                            │
└──────────────────────────────────────────────────────────┘

Option B — Receptionist manually marks no-show:

Clicks "No-Show" button on confirmed booking:

┌─────────────────────────────────────────────┐
│                                             │
│  Mark as No-Show?                           │
│  ────────────────                           │
│                                             │
│  #BKRS2605H38291 — Priya Sharma            │
│  24 May 2026 · 03:30 PM                    │
│                                             │
│  This will:                                 │
│  • Increment no-show count (current: 2)    │
│  • Release the time slot                    │
│  • Notify the customer                     │
│                                             │
│  ⚠️  At 4 no-shows, future bookings will    │
│     require manager approval.               │
│                                             │
│  [ Cancel ]     [ Confirm No-Show ]         │
│                 (red, destructive)          │
│                                             │
└─────────────────────────────────────────────┘

After confirmation:
    │
    ▼
No-show count incremented
    │
    ├── Count < 4 → CRM note added, no restriction
    │
    └── Count = 4 → 
            ├── booking_requires_approval = true
            ├── CRM tag: "No-Show Risk" applied (red badge)
            ├── Push + email to customer:
            │   "Future bookings require manager approval"
            └── All future bookings from this customer
                show warning to receptionist
```

### No-Show Tier Indicator on Booking Detail

```
┌─ Customer Info ──────────────────────────────────────────────────┐
│  Priya Sharma · 📞 +91 98765 43210                               │
│  Tags: [Frequent] [🔴 No-Show Risk]                              │
│  No-shows: 4/90d    ⚠️ Requires Manager Approval                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8. Walk-in Booking Creation

```
Receptionist clicks "+ Walk-in" button:

┌─────────────────────────────────────────────────────────────────────────┐
│  Create Walk-in Booking                                                  │
│  ═════════════════════                                                   │
│                                                                          │
│  Customer                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 🔍 Search by name, phone, or email...                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  Results:                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Priya Sharma — 98765 43210 — priya@gmail.com                    │   │
│  │ Aisha Khan — 87654 32109 — aisha@gmail.com                      │   │
│  │ + Create New Customer                                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Service Type: [ Salon ] | [ SPA ]                                       │
│                                                                          │
│  Services:                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ✓ Classic Haircut       ₹500   Staff: [Anjali         ▼]       │   │
│  │ ✓ Hair Wash & Blow Dry  ₹300   Staff: [Anjali         ▼]       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Time: [Now - 03:45 PM ▼]  (adjustable)                                │
│                                                                          │
│  Notes (optional):                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Customer requested blow dry after cut                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              [ Create Walk-in Booking ]                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Note: Walk-in bookings are directly confirmed (skip pending).          │
│  Walk-in no-shows do NOT count toward the no-show tier.                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Dashboard — Pending Queue (Live)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Dashboard                                                               │
│                                                                          │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐          │
│  │ Pending    │ │ Today's    │ │ Appointments│ │ Stale      │          │
│  │ Bookings   │ │ Revenue    │ │ Today      │ │ Leads      │          │
│  │            │ │            │ │            │ │            │          │
│  │  🔴 3      │ │ ₹8,400    │ │    7       │ │    2       │          │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘          │
│                                                                          │
│  ┌─ Pending Bookings (needs action) ────────────────────────────────┐  │
│  │                                                                   │  │
│  │  ┌─────────────────────────────────────────────────────────────┐ │  │
│  │  │ NEW  Priya S. · Facial, Waxing · 03:30 PM · 2 min ago     │ │  │
│  │  └─────────────────────────────────────────────────────────────┘ │  │
│  │  ┌─────────────────────────────────────────────────────────────┐ │  │
│  │  │      Aisha K. · Swedish Massage · 11:00 AM · 15 min ago   │ │  │
│  │  └─────────────────────────────────────────────────────────────┘ │  │
│  │  ┌─────────────────────────────────────────────────────────────┐ │  │
│  │  │ ⚠️   Rahul M. · Haircut · 14:00 PM · 2 HOURS AGO (stale) │ │  │
│  │  └─────────────────────────────────────────────────────────────┘ │  │
│  │                                                                   │  │
│  │  "NEW" badge = just arrived (< 5 min)                            │  │
│  │  "⚠️" badge = stale (> 2 hours without action)                   │  │
│  │                                                                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  Cards appear in real-time via Ably (admin:bookings channel)            │
│  New cards slide in from top with animation                              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Salon-Initiated Cancellation

```
Receptionist cancels a CONFIRMED booking (salon's fault):

┌─────────────────────────────────────────────┐
│                                             │
│  Cancel Booking (Salon-initiated)?          │
│  ─────────────────────────────────          │
│                                             │
│  #BKRS2605H38291 — Priya Sharma            │
│  24 May 2026 · 03:30 PM                    │
│                                             │
│  Reason:                                    │
│  ┌─────────────────────────────────────┐   │
│  │ Staff emergency — Anjali unavailable│   │
│  └─────────────────────────────────────┘   │
│                                             │
│  This will:                                 │
│  • Send apology push + email               │
│  • Offer priority rebooking                 │
│  • If offer was applied → reinstate        │
│    offer for next booking                   │
│                                             │
│  [ Keep Booking ]  [ Cancel Booking ]       │
│                    (red)                    │
│                                             │
└─────────────────────────────────────────────┘

Customer receives:
  Email: apology + "Book again" CTA + priority rebooking
  Push: "Your appointment was cancelled by Royal Glow. We're sorry!"
  If cancelled <2h before: includes priority rebooking offer
```
