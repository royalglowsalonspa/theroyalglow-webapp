# Booking System Skill

## Description
Domain-specific skill for implementing the Royal Glow booking system — state machine, availability calculation, slot management, and the 4-step booking dialog.

## Activation
- When working on booking-related files
- When implementing `/api/bookings`, `/api/availability`, or booking UI components
- When touching `packages/business/booking/` or `packages/db/schema/booking.ts`

---

## Booking State Machine

```
pending → confirmed     (admin approves)
pending → rejected      (admin rejects — reason REQUIRED)
pending → cancelled     (customer cancels)
confirmed → in_progress (admin starts service)
confirmed → cancelled   (customer/admin cancels)
confirmed → no_show     (QStash job: +15min after end_time)
confirmed → rescheduled (customer/admin reschedules → creates NEW booking)
in_progress → completed (admin completes → triggers invoice + gems + email + CAPI)
```

**Terminal states:** completed, cancelled, rejected, no_show, rescheduled

**Side effects on completion:**
1. Generate invoice (GST calculation, PDF, R2 upload)
2. Award gems: `floor(totalPaise / 10000)`
3. Email invoice via Resend (synchronous)
4. Fire Meta CAPI Purchase event
5. Publish Ably event to `booking:{id}` and `admin:bookings:{branchId}`
6. Sync customer to Brevo

---

## Availability Calculation

```typescript
// Business logic — PURE function
export function calculateAvailableSlots(
  date: Date,
  branchId: string,
  staffSchedules: StaffSchedule[],
  existingBookings: Booking[],
  holidays: Holiday[],
  serviceMinutes: number,
): TimeSlot[] {
  // 1. Check if date is a holiday → return []
  // 2. Get staff working on that day (from schedules)
  // 3. Generate all possible slots (30-min intervals)
  // 4. Remove slots that overlap with existing bookings
  // 5. Remove slots where remaining time < serviceMinutes
  // 6. Return available slots with staff options
}
```

**Slot rules:**
- Slots are 30-minute intervals (10:00, 10:30, 11:00...)
- Operating hours: branch-specific (default 10:00–20:00)
- Buffer: 0 minutes between bookings (services define their own duration)
- Same-day booking: allowed up to 2 hours before slot time
- Max advance booking: 30 days

---

## 4-Step Booking Dialog

### Step 1: Branch + Date + Slot
- Branch selector (single branch at launch)
- Date picker (today → +30 days, holidays greyed out)
- Time slot grid (available slots from API)
- Pre-filled: customer name, email (from session, NOT editable)

### Step 2: Categories
- Salon/SPA toggle (one type per booking, cannot mix)
- Category cards with multi-select
- Show only categories with available services

### Step 3: Services
- Service cards within selected categories
- Multi-select with running total at bottom (formatted in ₹ Indian)
- "Your Favourites" section at top (if authenticated + has favourites)
- Duration shown per service

### Step 4: Summary
- "Booking Submitted!" confirmation
- Booking number displayed
- Services list with prices
- Total (formatted: ₹X,XXX.XX)
- Status: "Pending Approval" (or "Confirmed" for walk-ins)
- "Payment will be collected at the salon" note

---

## Deep-Link Support

```typescript
// Homepage checks searchParams on load:
const searchParams = await props.searchParams
const shouldOpenBooking = searchParams.book === '1'
const utmSource = searchParams.utm_source
const leadId = searchParams.leadId

// If ?book=1, auto-open the booking dialog
// Store UTM params in sessionStorage (persists across OAuth redirect)
if (utmSource) sessionStorage.setItem('utm_source', utmSource)
```

**Entry points:**
| URL | Source | Behavior |
|-----|--------|----------|
| `/?book=1` | Direct | Open dialog |
| `/?book=1&utm_source=gmb` | Google Maps | Open dialog + track GMB |
| `/?book=1&utm_source=walkin` | QR code | Open dialog + track walk-in |
| `/?book=1&utm_source=meta&leadId=xxx` | Meta ad redirect | Open dialog + link lead |

---

## Booking Number Generation

```typescript
import { nanoid } from 'nanoid'

export function generateBookingNumber(
  branchCode: string,  // e.g., "RS" for Rayasandra
  serviceType: 'salon' | 'spa',
  isMembershipSession: boolean = false,
): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const type = serviceType === 'salon' ? 'H' : 'S'
  const random = nanoid(5)
  const suffix = isMembershipSession ? '-M' : ''
  return `BK-${branchCode}-${yy}${mm}-${type}-${random}${suffix}`
}
```

---

## Walk-In vs Online Booking

| Aspect | Online (Customer) | Walk-In (Receptionist) |
|--------|------------------|----------------------|
| Entry | Homepage dialog | `/admin/bookings/new` |
| Initial status | `pending` | `confirmed` (skip approval) |
| Auth required | Yes (customer session) | Yes (receptionist+ session) |
| Approval needed | Yes (unless no-show < 4) | No |
| No-show tracking | Counts toward tier | Does NOT count |
| UTM attribution | From URL params | Source: `walk_in_qr` |

---

## No-Show Escalation

```typescript
export function determineBookingApproval(noShowCount: number): boolean {
  // Returns true if booking requires manager approval
  return noShowCount >= 4
}

export function handleNoShow(customerId: string, currentCount: number) {
  const newCount = currentCount + 1
  
  if (newCount >= 1 && newCount <= 3) {
    // Apply CRM tag "No-Show Risk"
    return { action: 'tag', tag: 'no-show-risk' }
  }
  
  if (newCount >= 4) {
    // Set booking_requires_approval = true
    return { action: 'restrict', requiresApproval: true }
  }
}

// Recovery: 3 consecutive completed bookings → reset
export function checkNoShowRecovery(recentBookings: Booking[]): boolean {
  const lastThree = recentBookings.slice(0, 3)
  return lastThree.length === 3 && lastThree.every(b => b.status === 'completed')
}
```
