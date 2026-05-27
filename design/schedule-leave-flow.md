# Staff Schedule & Leave Management — Design Reference

> Staff scheduling: daily/weekly grid views, leave request submission and approval, same-day mark-off, conflict handling, and realtime updates. The operational backbone for staff availability and salon capacity.

---

## 1. Staff Schedule Grid — Daily View `/admin/schedule`

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Schedule — 24 May 2026 (Saturday)            [◀ Prev] [Today] [Next ▶]│
│  ═════════════════════════════════             [ Daily | Weekly ]        │
│                                                                          │
│  ┌────────┬───────┬───────┬───────┬───────┬───────┬───────┬───────┐    │
│  │ Staff  │ 10:00 │ 10:30 │ 11:00 │ 11:30 │ 12:00 │ 12:30 │ 13:00│    │
│  ├────────┼───────┼───────┼───────┼───────┼───────┼───────┼───────┤    │
│  │        │░░░░░░░│░░░░░░░│       │       │       │       │▓▓▓▓▓▓│    │
│  │ Anjali │░BOOKED░│░BOOKED░│  avail│  avail│  avail│  avail│▓BUFFER▓│    │
│  │        │░Priya ░│░Priya ░│       │       │       │       │▓▓▓▓▓▓│    │
│  ├────────┼───────┼───────┼───────┼───────┼───────┼───────┼───────┤    │
│  │        │       │       │░░░░░░░│░░░░░░░│░░░░░░░│       │       │    │
│  │ Meera  │  avail│  avail│░BOOKED░│░BOOKED░│░BOOKED░│  avail│  avail│    │
│  │        │       │       │░Aisha ░│░Aisha ░│░Aisha ░│       │       │    │
│  ├────────┼───────┼───────┼───────┼───────┼───────┼───────┼───────┤    │
│  │        │███████│███████│███████│███████│███████│███████│███████│    │
│  │ Deepa  │█LEAVE█│█LEAVE█│█LEAVE█│█LEAVE█│█LEAVE█│█LEAVE█│█LEAVE█│    │
│  │        │███████│███████│███████│███████│███████│███████│███████│    │
│  ├────────┼───────┼───────┼───────┼───────┼───────┼───────┼───────┤    │
│  │        │       │       │       │░░░░░░░│░░░░░░░│       │       │    │
│  │Priya M.│  avail│  avail│  avail│░BOOKED░│░BOOKED░│  avail│  avail│    │
│  │        │       │       │       │░Rahul ░│░Rahul ░│       │       │    │
│  └────────┴───────┴───────┴───────┴───────┴───────┴───────┴───────┘    │
│                                                                          │
│  Legend:                                                                  │
│  ┌───────┐ Available   ░░░░░░░ Booked (customer name)                   │
│  └───────┘             ▓▓▓▓▓▓▓ Buffer (15-min between bookings)         │
│                        ███████ On Leave                                  │
│                                                                          │
│  Continues → 13:30, 14:00 ... 20:00 (horizontal scroll)                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

Interactions:
• Click booked slot → opens booking detail in side panel
• Click available slot → opens "Create Walk-in" modal (pre-filled time + staff)
• Hover on leave → shows leave reason tooltip
• Slots update in realtime via Ably (slot.booked, slot.released)
```

---


## 2. Weekly View — `/admin/schedule?view=weekly`

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Schedule — Week of 20–26 May 2026           [◀ Prev] [Today] [Next ▶] │
│  ═══════════════════════════════════          [ Daily | Weekly ]         │
│                                                                          │
│  ┌────────┬──────────┬──────────┬──────────┬──────────┬──────────┐     │
│  │ Staff  │  Mon 20  │  Tue 21  │  Wed 22  │  Thu 23  │  Fri 24  │     │
│  ├────────┼──────────┼──────────┼──────────┼──────────┼──────────┤     │
│  │        │          │          │          │          │          │     │
│  │ Anjali │ 3 bookings│ 4 bookings│ 2 bookings│ 5 bookings│ 3 bookings│     │
│  │        │ 10:00-18 │ 10:00-19 │ 10:00-16 │ 10:00-20 │ 10:00-18 │     │
│  │        │ ████░░░░ │ █████░░░ │ ██░░░░░░ │ ██████░░ │ ████░░░░ │     │
│  │        │          │          │          │          │          │     │
│  ├────────┼──────────┼──────────┼──────────┼──────────┼──────────┤     │
│  │        │          │          │          │          │          │     │
│  │ Meera  │ 2 bookings│ █ LEAVE  │ █ LEAVE  │ 3 bookings│ 4 bookings│     │
│  │        │ 10:00-14 │ (sick)   │ (sick)   │ 11:00-18 │ 10:00-19 │     │
│  │        │ ██░░░░░░ │ ████████ │ ████████ │ ████░░░░ │ █████░░░ │     │
│  │        │          │          │          │          │          │     │
│  ├────────┼──────────┼──────────┼──────────┼──────────┼──────────┤     │
│  │        │          │          │          │          │          │     │
│  │ Deepa  │ 4 bookings│ 3 bookings│ 5 bookings│ █ LEAVE  │ 2 bookings│     │
│  │        │ 10:00-19 │ 10:00-17 │ 10:00-20 │ (personal)│ 10:00-15 │     │
│  │        │ █████░░░ │ ████░░░░ │ ██████░░ │ ████████ │ ██░░░░░░ │     │
│  │        │          │          │          │          │          │     │
│  └────────┴──────────┴──────────┴──────────┴──────────┴──────────┘     │
│                                                                          │
│  + Sat 25, Sun 26 (scroll right)                                        │
│                                                                          │
│  Capacity bars: █ = booked hours / total available hours                │
│  Red bar = >80% utilisation  │  Green = <50%  │  Amber = 50-80%        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Leave Request Submission — Staff Self-Service

```
Staff opens their app → /staff/leave → "Request Leave"

┌─────────────────────────────────────────────────────┐
│  Request Leave                                       │
│  ═════════════                                       │
│                                                      │
│  Leave Type:                                         │
│  (●) Sick Leave    ( ) Personal    ( ) Emergency    │
│                                                      │
│  Date(s):                                            │
│  ┌───────────────────┐  to  ┌───────────────────┐  │
│  │ 21/05/2026   📅   │      │ 22/05/2026   📅   │  │
│  └───────────────────┘      └───────────────────┘  │
│  Duration: 2 days (Tue–Wed)                          │
│                                                      │
│  Reason (optional):                                  │
│  ┌───────────────────────────────────────────────┐  │
│  │ Fever, doctor advised rest                    │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ⚠️  You have 1 confirmed booking on 21 May.        │
│     It will need to be reassigned if approved.      │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │         [ Submit Request ]                    │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
└─────────────────────────────────────────────────────┘
    │
    ▼
Leave request created with status: PENDING
Push notification sent to receptionist/manager
Ably: admin:leave event published
```

---

## 4. Leave Approval — Receptionist View `/admin/leave`

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Leave Requests                                                          │
│  ══════════════                                                          │
│                                                                          │
│  [ Pending (2) ] [ Approved ] [ Rejected ] [ All ]                      │
│  ═══════════════                                                         │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Meera — Sick Leave                                    PENDING    │  │
│  │  21 May – 22 May 2026 (2 days)                                    │  │
│  │  Reason: "Fever, doctor advised rest"                             │  │
│  │                                                                    │  │
│  │  ⚠️  CONFLICT: 1 confirmed booking on 21 May (Aisha K. 11:00 AM) │  │
│  │     → Must be reassigned to another staff member                  │  │
│  │                                                                    │  │
│  │  [ ✓ Approve ]  [ ✕ Reject ]  [ 💬 Add Note ]                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Deepa — Personal Leave                               PENDING    │  │
│  │  23 May 2026 (1 day)                                              │  │
│  │  Reason: "Family function"                                        │  │
│  │                                                                    │  │
│  │  ✓ No booking conflicts                                          │  │
│  │                                                                    │  │
│  │  [ ✓ Approve ]  [ ✕ Reject ]  [ 💬 Add Note ]                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────      │
│                                                                          │
│  Reject requires reason:                                                 │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │  Rejection Reason:                                             │      │
│  │  ┌─────────────────────────────────────────────────────────┐  │      │
│  │  │ Too many staff on leave that day. Please try Thu.       │  │      │
│  │  └─────────────────────────────────────────────────────────┘  │      │
│  │  [ Confirm Reject ]                                            │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---


## 5. Leave State Machine

```
                Staff submits leave request
                         │
                         ▼
                 ┌──────────────┐
                 │   PENDING    │ ← Initial state
                 └──────┬───────┘
                        │
            ┌───────────┼───────────────────┐
            │           │                   │
            ▼           ▼                   ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │   APPROVED   │  │   REJECTED   │  │  WITHDRAWN   │
    └──────────────┘  └──────────────┘  └──────────────┘
    (by receptionist/  (with reason,     (by staff before
     manager)          staff notified)    approval decision)


  TRANSITIONS:
  ─────────────
  pending → approved       Receptionist/Manager approves
  pending → rejected       Receptionist/Manager rejects (reason required)
  pending → withdrawn      Staff cancels own request before decision

  POST-APPROVAL:
  ──────────────
  approved → schedule grid blocked for those dates
  approved → conflicting bookings flagged for reassignment
  approved → Ably: staff.marked_off published (schedule updates live)

  CANNOT:
  ───────
  • Approve/reject after withdrawn
  • Withdraw after approved (must cancel leave separately — manager only)
  • Staff submit overlapping leave dates with existing approved leave
```

---

## 6. Direct Mark-Off Flow (Same-Day Absence)

```
Staff calls in sick / doesn't show up (no prior leave request):

Receptionist → /admin/schedule → clicks staff name → "Mark Off Today"

┌─────────────────────────────────────────────────────┐
│  Mark Staff Off — Same Day                           │
│  ═════════════════════════                           │
│                                                      │
│  Staff: Meera                                        │
│  Date: Today (24 May 2026)                          │
│                                                      │
│  Reason:                                             │
│  (●) Sick — called in                               │
│  ( ) No-show — did not inform                       │
│  ( ) Emergency — sent home early                    │
│  ( ) Other: _______________                         │
│                                                      │
│  ⚠️  Meera has 2 bookings today:                    │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │  11:00 — Aisha K. — Swedish Massage (60 min) │  │
│  │  14:00 — Rahul M. — Deep Tissue (90 min)     │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  These bookings must be:                             │
│  (●) Reassigned to available staff                  │
│  ( ) Cancelled and customer notified                │
│                                                      │
│  Reassign to:                                        │
│  11:00 Aisha K. → [ Deepa         ▼ ]              │
│  14:00 Rahul M. → [ Priya M.      ▼ ]              │
│                                                      │
│  [ Confirm Mark-Off ]                                │
│                                                      │
└─────────────────────────────────────────────────────┘
    │
    ▼
Actions on confirm:
  1. Leave record created (type: 'same_day', status: 'approved')
  2. Schedule grid updated (Meera slots → blocked)
  3. Bookings reassigned to selected staff
  4. Push notifications sent to affected customers:
     "Your stylist for today has been changed to {newStaff}"
  5. Ably events: staff.marked_off, slot.reassigned
```

---

## 7. Schedule Conflict Handling

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CONFLICT: Leave Approved → Existing Confirmed Bookings                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Scenario: Meera has confirmed bookings on 21 May,                      │
│            but her sick leave for 21–22 May is approved.                 │
│                                                                          │
│  System behavior:                                                        │
│                                                                          │
│  Leave approved                                                          │
│       │                                                                  │
│       ▼                                                                  │
│  Scan bookings for staff on leave dates                                 │
│       │                                                                  │
│       ├── Confirmed bookings found? (Meera, 21 May, 11:00 — Aisha K.)  │
│       │                                                                  │
│       ▼                                                                  │
│  ┌────────────────────────────────────────────────────────┐             │
│  │  ⚠️  Booking Conflict Alert                            │             │
│  │                                                         │             │
│  │  Meera's leave was approved but she has:               │             │
│  │  • 21 May 11:00 — Aisha K. (Swedish Massage)          │             │
│  │                                                         │             │
│  │  Action required:                                       │             │
│  │  [ Reassign to: [Deepa ▼] ]   or   [ Cancel Booking ]  │             │
│  │                                                         │             │
│  └────────────────────────────────────────────────────────┘             │
│                                                                          │
│  This alert:                                                             │
│  • Shows immediately after approval (modal on same page)                │
│  • Also appears as persistent banner on /admin/schedule                 │
│  • Push notification to receptionist if they navigate away              │
│  • Cannot be dismissed until all conflicts resolved                     │
│                                                                          │
│  Resolution options:                                                     │
│  ─────────────────                                                      │
│  1. REASSIGN: Pick another available staff member                       │
│     → Customer push: "Stylist changed to {name}"                        │
│     → Booking stays confirmed                                           │
│                                                                          │
│  2. CANCEL: Cancel the booking                                          │
│     → Customer push: "Booking cancelled — staff unavailable"            │
│     → Customer email with "Book Again" CTA                              │
│     → booking.status → 'cancelled'                                      │
│     → cancel_reason: 'staff_unavailable'                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---


## 8. Staff-Only View — `/staff/schedule`

```
┌─────────────────────────────────────────────────────┐
│  My Schedule                                         │
│  ═══════════                                         │
│                                                      │
│  Today: 24 May 2026 (Saturday)                      │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │  10:00 – 10:45                                │  │
│  │  Priya Sharma — Classic Haircut              │  │
│  │  Status: ● Confirmed                          │  │
│  ├───────────────────────────────────────────────┤  │
│  │  11:00 – 12:30                                │  │
│  │  (Available)                                  │  │
│  ├───────────────────────────────────────────────┤  │
│  │  12:30 – 12:45                                │  │
│  │  ▓▓ Buffer ▓▓                                │  │
│  ├───────────────────────────────────────────────┤  │
│  │  13:00 – 14:30                                │  │
│  │  Aisha K. — Swedish Massage (90 min)         │  │
│  │  Status: ● Confirmed                          │  │
│  ├───────────────────────────────────────────────┤  │
│  │  14:30 – 20:00                                │  │
│  │  (Available)                                  │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ── My Leave ────────────────────────────────────── │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │  28 May — Personal — ● Approved               │  │
│  ├───────────────────────────────────────────────┤  │
│  │  15 Jun — Sick — ● Approved                   │  │
│  ├───────────────────────────────────────────────┤  │
│  │  20 Jun — Personal — ○ Pending                │  │
│  │  [ Withdraw Request ]                         │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │       [ + Request Leave ]                     │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
└─────────────────────────────────────────────────────┘

Staff can see:
✓ Their own bookings (customer name, service, time)
✓ Their own leave history and status
✓ Submit new leave requests
✓ Withdraw pending (not yet decided) requests

Staff CANNOT see:
✕ Other staff schedules
✕ Customer phone/email
✕ Booking financial details
✕ Other staff leave requests
✕ Approve/reject any leave
```

---

## 9. Ably Realtime Updates on Schedule

```
┌─────────────────────────────────────────────────────────────────────────┐
│  REALTIME SCHEDULE EVENTS (Ably channels)                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Channel: admin:schedule                                                 │
│  Subscribers: All admin users viewing /admin/schedule                   │
│                                                                          │
│  Event              │ Trigger                   │ UI Effect              │
│  ──────────────────┼───────────────────────────┼────────────────────── │
│  slot.booked        │ Booking confirmed         │ Slot fills with       │
│                     │ (staff assigned to slot)   │ customer name +       │
│                     │                           │ colour (animated)     │
│                     │                           │                        │
│  slot.released      │ Booking cancelled or      │ Slot returns to       │
│                     │ rescheduled away          │ "available" (fade out)│
│                     │                           │                        │
│  staff.marked_off   │ Leave approved or         │ Full row turns to     │
│                     │ same-day mark-off         │ LEAVE state (dark     │
│                     │                           │ overlay slides in)    │
│                     │                           │                        │
│  leave.approved     │ Leave request approved    │ Future date rows      │
│                     │                           │ pre-marked (if in     │
│                     │                           │ current view range)   │
│                     │                           │                        │
│  slot.reassigned    │ Booking moved to          │ Old slot releases,    │
│                     │ different staff           │ new slot fills        │
│                     │                           │ (simultaneous)        │
│                                                                          │
│  Payload example (slot.booked):                                          │
│  {                                                                       │
│    "event": "slot.booked",                                              │
│    "staffId": "staff_meera_001",                                        │
│    "date": "2026-05-24",                                                │
│    "startTime": "11:00",                                                │
│    "endTime": "12:30",                                                  │
│    "customerName": "Aisha K.",                                          │
│    "service": "Swedish Massage",                                        │
│    "bookingId": "bk_abc123"                                             │
│  }                                                                       │
│                                                                          │
│  Animation spec:                                                         │
│  • slot.booked: empty cell → colour fill slides from left (200ms)       │
│  • slot.released: colour fades out + shrink (150ms)                     │
│  • staff.marked_off: dark overlay slides down row (300ms)               │
│  • slot.reassigned: cross-fade between old/new staff rows (250ms)       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```
