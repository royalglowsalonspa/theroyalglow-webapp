# Booking Flow — Complete Design Reference

> The core customer journey: discovering the "Book Now" button → completing a 4-step booking dialog → receiving confirmation. Includes every state, transition, wireframe, and edge case.

---

## 1. Entry Points (How Users Reach the Booking Dialog)

```
┌─────────────────────────────────────────────────────────────────┐
│                     BOOKING DIALOG TRIGGERS                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Homepage "Book Now" hero button ──────────┐                     │
│  Header "Book Now" CTA (all pages) ────────┤                     │
│  Service card "Book This" button ──────────┤                     │
│  Offer card "Book Now" CTA ────────────────┤     ┌───────────┐  │
│  Deep link: /?book=1 ─────────────────────┤────▶│  BOOKING  │  │
│  GMB link: /?book=1&utm_source=gmb ───────┤     │  DIALOG   │  │
│  QR code: /?book=1&utm_source=walkin ─────┤     │  OPENS    │  │
│  Post-lead: /?book=1&leadId={id} ─────────┤     └───────────┘  │
│  Service pre-select: /?book=1&service=X ───┘                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Auth gate:** If user is NOT signed in when dialog trigger fires:
```
Trigger fires → Check auth
    │
    ├── Signed in → Open dialog immediately
    │
    └── NOT signed in → Store trigger context in sessionStorage
                            (book=1, utm_source, leadId, service)
                         → Redirect to /sign-in
                         → After OAuth + onboarding → redirect back to /
                         → sessionStorage read → dialog auto-opens
```

---

## 2. Booking Status Lifecycle (State Machine)

```
                        Customer submits booking
                                 │
                                 ▼
                         ┌──────────────┐
                         │   PENDING    │ ← Initial state
                         └──────┬───────┘
                                │
                    ┌───────────┼───────────┐
                    │                       │
                    ▼                       ▼
           ┌──────────────┐       ┌──────────────┐
           │  CONFIRMED   │       │   REJECTED   │ (with reason)
           └──────┬───────┘       └──────────────┘
                  │                        │
                  │                        └── Customer sees reason
                  │                            + "Book Again" CTA
                  ▼
           ┌──────────────┐
           │ IN_PROGRESS  │ ← Customer physically in salon
           └──────┬───────┘
                  │
                  ▼
           ┌──────────────┐
           │  COMPLETED   │ → Invoice generated
           └──────────────┘   → Gems awarded
                              → Email sent
                              → CAPI Purchase fired


        CANCELLATION (can happen from pending or confirmed):

           ┌──────────────┐         ┌──────────────┐
           │   PENDING    │────────▶│  CANCELLED   │  (free if >4h before)
           └──────────────┘         └──────────────┘
           ┌──────────────┐         ┌──────────────┐
           │  CONFIRMED   │────────▶│  CANCELLED   │  (tagged in CRM if <4h)
           └──────────────┘         └──────────────┘


        NO-SHOW (only from confirmed, after appointment end time):

           ┌──────────────┐         ┌──────────────┐
           │  CONFIRMED   │────────▶│   NO_SHOW    │  (noshow_count++)
           └──────────────┘         └──────────────┘
```

---

## 3. Booking Dialog — Mobile Layout (Bottom Sheet)

### Step 1: Date & Time

```
┌─────────────────────────────────────┐
│ ═══ (drag handle)                   │
│                                     │
│  Book Your Appointment              │
│  ─────────────────────              │
│  Step 1 of 4                        │
│                                     │
│  Branch: Rayasandra ✓ (auto)        │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Name: Priya Sharma (locked)│    │
│  │  Email: priya@g... (locked) │    │
│  │  Gender: [Female        ▼]  │    │
│  └─────────────────────────────┘    │
│                                     │
│  Select Date                        │
│  ┌───┬───┬───┬───┬───┬───┬───┐    │
│  │Mon│Tue│Wed│Thu│Fri│Sat│Sun│    │
│  ├───┼───┼───┼───┼───┼───┼───┤    │
│  │ 19│ 20│ 21│ 22│ 23│●24│ 25│    │
│  │   │   │   │   │   │   │   │    │
│  │ 26│ 27│ 28│ 29│ 30│ 31│   │    │
│  └───┴───┴───┴───┴───┴───┴───┘    │
│                                     │
│  Available Slots (24 May)           │
│  ┌──────┐ ┌──────┐ ┌──────┐       │
│  │10:00 │ │10:30 │ │11:00 │       │
│  └──────┘ └──────┘ └──────┘       │
│  ┌──────┐ ┌──────┐ ┌──────┐       │
│  │11:30 │ │░FULL░│ │12:30 │       │
│  └──────┘ └──────┘ └──────┘       │
│  ┌──────┐ ┌──────┐ ┌──────┐       │
│  │●15:30│ │16:00 │ │16:30 │       │
│  └──────┘ └──────┘ └──────┘       │
│                                     │
│  ┌─────────────────────────────┐    │
│  │      [ Next → ]             │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘

Legend:
  ●  = Selected (brand colour fill)
  ░░ = Fully booked (greyed out, non-tappable)
```

### Step 2: Choose Categories

```
┌─────────────────────────────────────┐
│ ═══                                 │
│                                     │
│  Choose Category                    │
│  ─────────────────                  │
│  Step 2 of 4                        │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  [ Salon ]  |  [ SPA ]     │    │
│  └─────────────────────────────┘    │
│         ▲ selected (filled)         │
│                                     │
│  Select categories (multi-select):  │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ ✓  💇 Haircut & Styling     │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │    💆 Facial & Skincare     │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │ ✓  🧴 Waxing                │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │    💅 Manicure & Pedicure   │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │    💄 Makeup Services       │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │    🧖 Hair SPA & Therapies  │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  [ ← Back ]    [ Next → ]  │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### Step 3: Choose Services

```
┌─────────────────────────────────────┐
│ ═══                                 │
│                                     │
│  Choose Services                    │
│  ────────────────                   │
│  Step 3 of 4                        │
│                                     │
│  Haircut & Styling                  │
│  ┌─────────────────────────────┐    │
│  │ ✓ Classic Haircut            │    │
│  │   ₹500.00 · 45 min          │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │   Hair Wash & Blow Dry      │    │
│  │   ₹300.00 · 30 min          │    │
│  └─────────────────────────────┘    │
│                                     │
│  Waxing                             │
│  ┌─────────────────────────────┐    │
│  │ ✓ Full Arms                  │    │
│  │   ₹800.00 · 30 min          │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │   Full Legs                  │    │
│  │   ₹1,000.00 · 45 min        │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ 2 services · ₹1,300 · ~75m │    │
│  │      [ Submit Booking ]      │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘

SPA variant (60/90 min toggle):
┌─────────────────────────────────────┐
│  │ ✓ Aroma Therapy              │    │
│  │   [60 min ₹2,500] [90 min ₹3,500]│
│  │        ▲ selected                 │
└─────────────────────────────────────┘
```

### Step 4: Confirmation

```
┌─────────────────────────────────────┐
│ ═══                                 │
│                                     │
│         ✓ Booking Submitted!        │
│                                     │
│  Our team will confirm shortly.     │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  #BKRS2605H38291            │    │
│  │  24 May 2026 · 03:30 PM    │    │
│  │  Rayasandra                  │    │
│  │                              │    │
│  │  • Classic Haircut   ₹500   │    │
│  │  • Waxing Full Arms  ₹800   │    │
│  │  ─────────────────────────  │    │
│  │  Total (incl. GST)  ₹1,300 │    │
│  │                              │    │
│  │  Pay at salon                │    │
│  │  (Cash / UPI / Card)        │    │
│  └─────────────────────────────┘    │
│                                     │
│  💎 You have 12 gems                │
│     Browse Gems Catalogue →         │
│                                     │
│  ┌─────────────────────────────┐    │
│  │    [ View My Bookings ]     │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │      [ Go to Home ]         │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

---

## 4. Booking Dialog — Desktop Layout (Centered Modal)

```
         ┌─ Backdrop (blur + dark overlay, click to close) ─┐
         │                                                    │
         │    ┌────────────────────────────────────────┐     │
         │    │  ✕ (close)            Step 1 of 4      │     │
         │    │                                        │     │
         │    │  Book Your Appointment                 │     │
         │    │  ══════════════════════                 │     │
         │    │                                        │     │
         │    │  [Same content as mobile steps]        │     │
         │    │                                        │     │
         │    │  ┌────────────────────────────────┐   │     │
         │    │  │  [ ← Back ]      [ Next → ]   │   │     │
         │    │  └────────────────────────────────┘   │     │
         │    └────────────────────────────────────────┘     │
         │                                                    │
         └────────────────────────────────────────────────────┘

Desktop differences:
- Max-width: 600px, centered vertically + horizontally
- Close button (✕) top-right corner
- Click backdrop to close (with confirmation if mid-flow)
- Step transitions: horizontal slide animation (motion.dev)
- No drag handle (that's mobile-only)
```

---

## 5. Customer Actions After Booking

### My Bookings Page — Upcoming Tab

```
┌─────────────────────────────────────────────────────┐
│  My Bookings                                         │
│                                                      │
│  [ Upcoming ]  [ Past ]                              │
│  ════════════                                        │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │ ● Pending                    #BKRS2605H38291  │  │
│  │                                                │  │
│  │ 24 May 2026 (Sat) · 03:30 PM                  │  │
│  │ Classic Haircut, Waxing — Full Arms            │  │
│  │                                                │  │
│  │ ₹1,300.00                                     │  │
│  │                                                │  │
│  │ [ Edit Services ] [ Reschedule ] [ Cancel ]    │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │ ● Confirmed                  #BKRS2605K91023  │  │
│  │                                                │  │
│  │ 28 May 2026 (Wed) · 11:00 AM                  │  │
│  │ Swedish Massage (60 min)                       │  │
│  │ Assigned to: Meera                             │  │
│  │                                                │  │
│  │ ₹2,500.00                                     │  │
│  │                                                │  │
│  │ [ Reschedule ] [ Cancel ]                      │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Empty State (No Upcoming Bookings)

```
┌─────────────────────────────────────────────────────┐
│  My Bookings                                         │
│                                                      │
│  [ Upcoming ]  [ Past ]                              │
│  ════════════                                        │
│                                                      │
│              ┌─────────────────┐                     │
│              │    📅           │                     │
│              │  (calendar      │                     │
│              │   illustration) │                     │
│              └─────────────────┘                     │
│                                                      │
│      No upcoming bookings.                           │
│      Ready for your next Royal Glow moment?          │
│                                                      │
│           [ Book Now ]                               │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 6. Reschedule Flow

```
Customer taps "Reschedule" on booking card
    │
    ▼
┌──────────────────────────────┐
│  Validation checks:          │
│  • Max 2 reschedules?        │──── Yes (3rd attempt) ──▶ "You've rescheduled
│  • ≥1h before appointment?   │                           2 times. Please cancel
│                              │                           and re-book."
│  Both pass ↓                 │                           [Cancel Booking]
└──────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Reschedule Booking                  │
│  ──────────────────                  │
│                                      │
│  Current: 24 May · 03:30 PM         │
│                                      │
│  New Date:                           │
│  ┌───┬───┬───┬───┬───┬───┬───┐    │
│  │   │   │   │   │   │●26│   │    │
│  └───┴───┴───┴───┴───┴───┴───┘    │
│                                      │
│  New Time:                           │
│  ┌──────┐ ┌──────┐ ┌──────┐       │
│  │●11:00│ │11:30 │ │12:00 │       │
│  └──────┘ └──────┘ └──────┘       │
│                                      │
│  [ Cancel ]  [ Confirm Reschedule ] │
└─────────────────────────────────────┘
    │
    ▼
Success → Booking updated
       → Push notification sent
       → Google Calendar event updated
       → Status badge unchanged (still confirmed)
       → Reschedule count: 1/2 → 2/2
```

---

## 7. Cancellation Flow

```
Customer taps "Cancel" on booking card
    │
    ▼
┌─────────────────────────────────────┐
│  Cancel Booking?                     │
│  ────────────────                    │
│                                      │
│  #BKRS2605H38291                    │
│  24 May 2026 · 03:30 PM            │
│  Classic Haircut, Waxing            │
│                                      │
│  ⚠️  This action cannot be undone.   │
│                                      │
│  Reason (optional):                  │
│  ┌──────────────────────────────┐   │
│  │ Change of plans              │   │
│  └──────────────────────────────┘   │
│                                      │
│  [ Keep Booking ]  [ Yes, Cancel ]  │
└─────────────────────────────────────┘
    │
    ├── >4h before appointment:
    │       → Free cancellation
    │       → Slot released immediately
    │       → "Booking cancelled" toast
    │
    └── <4h before appointment:
            → CRM tag: late_cancellation
            → late_cancellation_count++
            → Staff phones customer (manual)
            → Slot released
            → "Booking cancelled" toast
```

---

## 8. Booking Detail Page — Status Timeline

```
┌─────────────────────────────────────────────────────┐
│  Booking #BKRS2605H38291                             │
│  ════════════════════════                             │
│                                                      │
│  Status Timeline:                                    │
│                                                      │
│  ● ─── Submitted ──────────── 24 May, 10:15 AM     │
│  │     by: Priya (customer)                          │
│  │                                                   │
│  ● ─── Confirmed ──────────── 24 May, 10:32 AM     │
│  │     by: Reception (Anjali assigned)               │
│  │                                                   │
│  ● ─── In Progress ────────── 24 May, 03:30 PM     │
│  │     by: Reception                                 │
│  │                                                   │
│  ● ─── Completed ──────────── 24 May, 04:45 PM     │
│        by: Reception                                 │
│        Invoice: #INV1262XXXXX                        │
│                                                      │
│  ─────────────────────────────────────────────────  │
│                                                      │
│  Services:                                           │
│  ┌───────────────────────────────────────────────┐  │
│  │ Classic Haircut     by Anjali       ₹500.00   │  │
│  │ Waxing Full Arms    by Priya M.     ₹800.00   │  │
│  ├───────────────────────────────────────────────┤  │
│  │ Subtotal                            ₹1,101.69 │  │
│  │ GST 18%                             ₹  198.31 │  │
│  │ Total (paid, Cash)                  ₹1,300.00 │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  💎 +13 gems earned  |  Balance: 55 gems            │
│                                                      │
│  [ View Invoice PDF ]  [ Rate on Google Maps → ]    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Rejected State Timeline

```
│  ● ─── Submitted ──────────── 24 May, 10:15 AM     │
│  │     by: Priya (customer)                          │
│  │                                                   │
│  ✕ ─── Rejected ───────────── 24 May, 10:45 AM     │
│        by: Reception                                 │
│        Reason: "Staff unavailable for selected       │
│                 time slot. Please try 4:00 PM        │
│                 or another day."                      │
│                                                      │
│        [ Book Again ]                                │
```

---

## 9. Realtime Updates on Booking Cards

```
When receptionist approves a booking (customer is on /bookings page):

BEFORE:                              AFTER (animated transition):
┌────────────────────────┐          ┌────────────────────────┐
│ ● Pending              │   ──▶    │ ● Confirmed            │
│                        │  ~50ms   │                        │
│ 24 May · 03:30 PM     │  (Ably)  │ 24 May · 03:30 PM     │
│ Classic Haircut        │          │ Classic Haircut         │
│                        │          │ Assigned to: Anjali     │ ← appears
│ [Edit] [Resched] [Canc]│          │ [Reschedule] [Cancel]  │ ← Edit removed
└────────────────────────┘          └────────────────────────┘

Animation: badge colour morphs amber→green, "Assigned to" line fades in,
           "Edit Services" button fades out.
```

---

## 10. Error States

### Slot Conflict (Real-time)
```
┌─────────────────────────────────────┐
│  ⚠️  This slot is no longer          │
│     available.                       │
│                                      │
│  Someone booked 03:30 PM while you  │
│  were selecting. Please choose       │
│  another time.                       │
│                                      │
│  ┌──────┐ ┌──────┐ ┌──────┐       │
│  │░3:30░│ │ 4:00 │ │ 4:30 │       │
│  └──────┘ └──────┘ └──────┘       │
│  (3:30 now greyed out)              │
└─────────────────────────────────────┘
```

### Submit Failure
```
┌─────────────────────────────────────┐
│  ❌  Something went wrong.           │
│                                      │
│  Your booking couldn't be submitted.│
│  Please try again.                   │
│                                      │
│  [ Try Again ]                       │
│                                      │
│  Or call us: 📞 +91 63601 35720     │
└─────────────────────────────────────┘
```

### Validation Errors
```
Step 1: "Please select a date and time slot"
        (shown below the slot grid, red text, aria-live)

Step 2: "Select at least one category"
        (shown below category cards)

Step 3: "Select at least one service"
        (shown below service list)
```

---

## 11. Animation Spec (motion.dev)

| Transition | Animation | Duration | Easing |
|-----------|-----------|----------|--------|
| Dialog open (mobile) | Slide up from bottom | 300ms | ease-out |
| Dialog open (desktop) | Scale from 0.95 + fade | 200ms | ease-out |
| Dialog close | Reverse of open | 200ms | ease-in |
| Step forward | Current slides left, next slides in from right | 250ms | ease-in-out |
| Step backward | Current slides right, prev slides in from left | 250ms | ease-in-out |
| Status badge change | Colour morph + subtle pulse | 400ms | spring |
| Success confetti | Particle burst from center | 1500ms | physics |
| Slot becoming unavailable | Fade to grey + shrink | 200ms | ease-out |
| New booking card appear | Slide down + fade in | 300ms | ease-out |

---

## 12. Accessibility Requirements

| Element | ARIA / Keyboard | Notes |
|---------|----------------|-------|
| Dialog container | `role="dialog"`, `aria-modal="true"`, `aria-labelledby="dialog-title"` | Focus trapped inside |
| Close button | `aria-label="Close booking dialog"` | Escape key also closes |
| Date picker | Arrow keys navigate days, Enter selects | `aria-label="Select appointment date"` |
| Time slots | Tab navigates, Enter/Space selects | `aria-disabled="true"` on full slots |
| Category cards | Checkbox pattern: Space toggles | `aria-checked="true/false"` |
| Service cards | Same as categories | Running total announced via `aria-live` |
| Step indicator | `aria-label="Step 1 of 4: Date and Time"` | Updated each step |
| Submit button | Disabled until valid, `aria-busy="true"` while submitting | |
| Error messages | `aria-live="polite"`, `role="alert"` | Announced immediately |

---

## 13. Data Flow Summary

```
Client (Browser)                          Server (API)                    External
─────────────────                         ────────────                    ────────

Step 1: GET /api/availability             → Neon DB (staff schedules,
        ?date=2026-05-24                    business_hour, bookings)
        ← { slots: [...] }

Step 3: GET /api/services                 → Cloudflare KV cache
        ← { categories: [...] }            (5-min TTL from Neon)

Submit: POST /api/bookings                → Neon DB INSERT booking
        { date, startTime,                → Ably PUBLISH:
          serviceIds[], leadId? }            - customer:{userId}:bookings
        ← { booking: { id,                  - admin:bookings
             bookingNumber,               → Resend: booking confirmation email
             status: 'pending' } }        → PostHog: booking_request_submitted
                                          → Meta Pixel: (InitiateCheckout
                                             already fired on dialog open)
```
