# Ably Realtime — Channel Structure

## Why Ably

Royal Glow customers and staff see booking status changes, schedule updates, and leave notifications **instantly — without any page reload or manual refresh**. Ably maintains a persistent WebSocket connection in the browser. When the server publishes an event, Ably pushes it to all subscribers in ~50ms. React state updates in response — the UI changes in place.

**Example:** Receptionist approves a booking in `/admin`. The customer is sitting on `/bookings`. Their status badge changes from "Pending" to "Confirmed" automatically, with no interaction required on their end.

---

## Core Principles

- **All publishes are server-side only** — Next.js API routes via `ABLY_PRIVATE_KEY`. Clients never publish directly. This prevents channel spoofing or status manipulation from the browser.
- **All clients use Token Auth** — the server generates a scoped Ably JWT token per user at `POST /api/ably/token`. Customer and staff tokens are restricted to exact channels they are allowed to view. They cannot subscribe to arbitrary booking channels.
- **Subscriptions happen on page mount** via `useEffect()`. The WebSocket connection stays open for the session. No polling, no refresh buttons.

---

## Channel Naming Convention

```
Shared channels:      {namespace}:{topic}
Scoped channels:      {namespace}:{identifier}:{sub-topic}
```

| Namespace | Audience | Example |
|-----------|---------|---------|
| `customer` | Customer browser | `customer:usr_abc123:bookings` |
| `booking` | Customer + Admin + Assigned Staff | `booking:bkg_xyz789` |
| `admin` | Developer + Owner + Manager + Receptionist | `admin:bookings` |
| `staff` | Individual staff member | `staff:stf_def456:schedule` |

---

## Channel Reference

### 1. `customer:{userId}:bookings`

Primary realtime channel for a logged-in customer. Subscribe on `/bookings` page mount. All booking cards on the page stay live for the full session.

| Event | Payload | UI effect |
|-------|---------|-----------|
| `booking.created` | `{ bookingId, status, services, totalPaise }` | New booking card appears |
| `booking.status_changed` | `{ bookingId, fromStatus, toStatus, reason? }` | Status badge animates to new state in-place |
| `booking.rescheduled` | `{ bookingId, newDate, newStartTime }` | Date/time updates on the card |
| `booking.cancelled` | `{ bookingId, cancelledBy }` | Card moves to cancelled section |
| `booking.staff_assigned` | `{ bookingId, staffName }` | "Assigned to: [Name]" appears on booking detail |

---

### 2. `booking:{bookingId}`

Fine-grained channel per booking. Customer subscribes when viewing a booking detail. Admin subscribes when the booking detail panel is open. Assigned staff may also subscribe for bookings they are allowed to view.

| Event | Payload | UI effect |
|-------|---------|-----------|
| `status.changed` | `{ fromStatus, toStatus, changedBy, reason? }` | Status badge animates to new state |
| `note.added` | `{ note, addedBy }` | Staff note appears live on admin booking detail |
| `service.added` | `{ service }` | Service list updates |
| `service.removed` | `{ serviceId }` | Service removed from list |

---

### 3. `admin:bookings`

Broadcast channel — all admin roles with booking access (`Developer`, `Owner`, `Manager`, `Receptionist`) subscribe on `/admin` dashboard and `/admin/bookings`. Every status-changing action anywhere in the system publishes here.

| Event | Payload | UI effect |
|-------|---------|-----------|
| `booking.new` | `{ bookingId, customerName, services, date, time, serviceType }` | New card appears at top of pending queue |
| `booking.status_changed` | `{ bookingId, toStatus, customerName }` | Status badge updates across all open admin tabs |
| `booking.walkin_created` | `{ bookingId, customerName, services }` | Walk-in appears in today's view instantly |
| `booking.cancelled` | `{ bookingId, customerName }` | Booking removed from active list, slot freed |
| `booking.no_show` | `{ bookingId, customerName }` | No-show badge applied on the booking |

---

### 4. `admin:schedule:{YYYY-MM-DD}`

Date-scoped channel. Subscribe when viewing a specific date in the schedule. Slot availability updates live as bookings are made, cancelled, or staff are marked off.

| Event | Payload | UI effect |
|-------|---------|-----------|
| `slot.booked` | `{ staffId, startTime, endTime, bookingId }` | Time slot turns blocked in schedule grid |
| `slot.released` | `{ staffId, startTime, endTime }` | Time slot turns available again |
| `staff.marked_off` | `{ staffId, staffName }` | Staff column greyed out for the day |
| `leave.approved` | `{ staffId, staffName }` | Staff removed from available column |

---

### 5. `admin:leave`

All admin roles with leave-review access (`Developer`, `Owner`, `Manager`, `Receptionist`) subscribe on `/admin/leave`. New leave requests appear without refreshing the page.

| Event | Payload | UI effect |
|-------|---------|-----------|
| `leave.requested` | `{ staffId, staffName, date, leaveType }` | New pending request badge appears in queue |
| `leave.withdrawn` | `{ staffId, leaveId }` | Request removed from pending queue |

---

### 6. `staff:{staffId}:schedule`

Each staff member subscribes to their own channel on the staff dashboard. Scoped to their `staffId` only — they cannot access other staff channels.

| Event | Payload | UI effect |
|-------|---------|-----------|
| `booking.assigned` | `{ bookingId, customerName, services, date, time }` | New appointment appears on their schedule |
| `booking.unassigned` | `{ bookingId }` | Appointment removed from their schedule |
| `leave.approved` | `{ date, leaveType }` | Leave day highlighted on their calendar |
| `leave.rejected` | `{ date, rejectionReason }` | Leave request shown as rejected with reason |

---

## Token Auth — Capability Scoping

The server generates a short-lived Ably JWT token per authenticated user. Customers can only access their own channels — not other customers'.

**Token endpoint:** `POST /api/ably/token` — authenticated route, generates token scoped to the calling user's role.

```
Customer token capabilities:
  subscribe: ["customer:usr_abc123:bookings", "booking:bkg_xyz789", "booking:bkg_xyz790"]
  publish:   []   ← never

Admin token capabilities (Developer / Owner / Manager / Receptionist):
  subscribe: ["admin:bookings", "admin:schedule:*", "admin:leave", "booking:*"]
  publish:   []   ← never

Staff token capabilities:
  subscribe: ["staff:stf_def456:schedule", "booking:bkg_xyz789"]
  publish:   []   ← never
```

Customer and staff tokens never receive a wildcard for all `booking:*` channels. Exact `booking:{bookingId}` access is issued only for bookings they own or are assigned to view.

All publishes originate from server-side API routes using `ABLY_PRIVATE_KEY`. The browser never holds a key with publish capability.

---

## Publishing Flow

Every server action that changes state publishes to all relevant channels atomically after the DB write commits.

**Example — Receptionist approves booking:**
```
POST /api/admin/bookings/:id/approve
    → DB: booking.status = 'confirmed'
    → Ably publish:
        customer:{userId}:bookings  →  booking.status_changed  { toStatus: 'confirmed' }
        booking:{bookingId}         →  status.changed
        admin:bookings              →  booking.status_changed
    staff:{staffId}:schedule    →  booking.assigned
        admin:schedule:{date}       →  slot.booked
```

**Example — Customer cancels booking:**
```
POST /api/bookings/:id/cancel
    → DB: booking.status = 'cancelled'
    → Ably publish:
        customer:{userId}:bookings  →  booking.cancelled
    staff:{staffId}:schedule    →  booking.unassigned
        admin:bookings              →  booking.cancelled
        admin:schedule:{date}       →  slot.released
```

**Example — Admin approves leave request:**
```
POST /api/admin/leave/:id/approve
    → DB: staff_time_off.approval_status = 'approved'
    → Ably publish:
        staff:{staffId}:schedule    →  leave.approved
        admin:schedule:{date}       →  leave.approved
        admin:leave                 →  (request removed from queue)
```

---

## UI Subscription Map

| Page | Subscribes to | What updates live |
|------|-------------|-------------------|
| `/bookings` | `customer:{userId}:bookings` | All booking card status badges, dates, staff assignments |
| `/bookings/:id` | `booking:{bookingId}` | Full detail panel — status, notes, services |
| `/admin` (dashboard) | `admin:bookings` | Pending queue count, today's booking feed |
| `/admin/bookings` | `admin:bookings` | Full booking list, status column |
| `/admin/bookings/:id` | `booking:{bookingId}` | Detail panel, notes, status timeline |
| `/admin/schedule` | `admin:schedule:{selectedDate}` | Slot grid, staff availability columns |
| `/admin/leave` | `admin:leave` | Pending leave request queue |
| Staff dashboard | `staff:{staffId}:schedule` | Today's appointments, leave request status |
