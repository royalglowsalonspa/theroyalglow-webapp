# Ably Realtime — Channel Structure

## Why Ably

Royal Glow customers and staff see booking status changes, schedule updates, and leave notifications **instantly — without any page reload or manual refresh**. Ably maintains a persistent WebSocket connection in the browser. When the server publishes an event, Ably pushes it to all subscribers in ~50ms. React state updates in response — the UI changes in place.

**Example:** Receptionist approves a booking in the admin app (`admin.theroyalglow.in`). The customer is sitting on `/bookings`. Their status badge changes from "Pending" to "Confirmed" automatically, with no interaction required on their end.

---

## Core Principles

- **All publishes are server-side only** — Next.js API routes via `ABLY_PRIVATE_KEY`. Clients never publish directly. This prevents channel spoofing or status manipulation from the browser.
- **All clients use Token Auth** — each app's `POST /api/ably/token` issues a subscribe-only token bound to the signed-in user (`clientId`). Customer tokens cover only that customer's channels; admin tokens cover only the branches the person works at (multi-branch R2.6).
- **Every staff channel names its branch** (multi-branch design §3). There are no cross-branch channels and no cross-branch wildcards in issued tokens.
- **Subscriptions happen on page mount** via `useEffect()`, for the branch the page was rendered for. The WebSocket connection stays open for the session.

Source of truth for names: `apps/admin/src/lib/realtime/channels.ts` and `apps/web/src/lib/realtime/channels.ts`. Capabilities: `apps/admin/src/lib/realtime/capability.ts` and `apps/web/src/lib/realtime/ably.ts`.

---

## Channel Naming Convention

| Namespace | Audience | Channel |
|-----------|---------|---------|
| `customer` | The customer | `customer:{userId}:bookings` |
| `booking` | The booking's branch staff | `booking:{branchId}:{bookingId}` |
| `admin` | The branch's Receptionist, Manager, Owner, and the Developer | `admin:bookings:{branchId}`, `admin:schedule:{branchId}:{YYYY-MM-DD}`, `admin:leave:{branchId}` |
| `staff` | Planned: one staff member | `staff:{staffId}:schedule` (not implemented) |

The legacy unqualified names (`booking:{bookingId}`, `admin:bookings`, `admin:schedule:{date}`, `admin:leave`) are retired: nothing publishes to them and no token authorizes them.

---

## Channel Reference

### 1. `customer:{userId}:bookings`

Primary realtime channel for a logged-in customer. Subscribe on `/bookings` page mount. Every event carries `data.bookingId`, so a booking detail view filters this channel to its booking (customer tokens never authorize `booking:*`).

| Event | Payload | UI effect |
|-------|---------|-----------|
| `created` | `{ bookingId, status }` | New booking card appears |
| `status_changed` | `{ bookingId, status }` | Status badge updates in place |
| `assigned` | `{ bookingId }` | Staff assignment refreshes |
| `completed` | `{ bookingId }` | Card moves to past bookings |

### 2. `booking:{branchId}:{bookingId}`

Fine-grained channel per booking, for that branch's staff (admin booking detail). Published with the same verbs as the customer channel.

### 3. `admin:bookings:{branchId}`

The branch's booking feed: dashboard and booking lists at that branch. Every booking status change at the branch publishes here.

| Event | Payload | UI effect |
|-------|---------|-----------|
| `booking.new` | `{ bookingId, customerName, services, date, time, serviceType }` | New card appears at top of pending queue |
| `booking.status_changed` | `{ bookingId, toStatus, customerName }` | Status badge updates across all open admin tabs |
| `booking.walkin_created` | `{ bookingId, customerName, services }` | Walk-in appears in today's view instantly |
| `booking.cancelled` | `{ bookingId, customerName }` | Booking removed from active list, slot freed |
| `booking.no_show` | `{ bookingId, customerName }` | No-show badge applied on the booking |

### 4. `admin:schedule:{branchId}:{YYYY-MM-DD}`

The branch's schedule for one IST date.

| Event | Payload | UI effect |
|-------|---------|-----------|
| `slot.booked` | `{ staffId, startTime, endTime, bookingId }` | Time slot turns blocked in schedule grid |
| `slot.released` | `{ staffId, startTime, endTime }` | Time slot turns available again |
| `staff.marked_off` | `{ staffId, staffName }` | Staff column greyed out for the day |
| `leave.approved` | `{ staffId, staffName }` | Staff removed from available column |

### 5. `admin:leave:{branchId}`

The branch's leave queue on `admin.theroyalglow.in/leave`.

| Event | Payload | UI effect |
|-------|---------|-----------|
| `leave.requested` | `{ staffId, staffName, date, leaveType }` | New pending request badge appears in queue |
| `leave.withdrawn` | `{ staffId, leaveId }` | Request removed from pending queue |

### 6. `staff:{staffId}:schedule` (planned)

A per-staff channel for the staff self-service pages. Not implemented; staff tokens are not issued today.

---

## Token Auth — Capability Scoping

Each token is subscribe-only and bound to the user id. Admin tokens live 10 minutes (`TOKEN_TTL_MS` in `apps/admin/src/lib/realtime/token-lifetime.ts`). The admin token route re-reads the person's branches from the database on every request, so the client's renewal follows role changes. The short TTL is defence in depth only; tokens already issued are revoked (next section).

### Revocation after a role change (R2.6)

A role or branch change that takes away someone's admin access at a branch writes a `realtime_revocation` row for that person in the same database batch as the change. The external Ably call cannot be part of that transaction, so the row is an outbox:

1. Straight after the change commits, the admin app calls Ably's `POST /keys/{keyName}/revokeTokens` with `clientId:{userId}` targets. This cuts off live connections at once.
2. A TokenRequest the server signed just before the change can still be exchanged for about 2 minutes. A second call after that window (2 minutes plus 1 minute for clock skew) covers a token minted late. Only this second call resolves the row as `revoked`.
3. A failed call stays `pending` with its error. The QStash-triggered job `POST /api/jobs/realtime-revocations` retries it; nothing polls on a schedule.
4. A row older than the token lifetime plus the window resolves as `expired` without calling Ably: no token with the old access can still be valid. Without `ABLY_PRIVATE_KEY` rows resolve as `not_configured`.

The person who made the change is told when the revocation could not be confirmed yet; their tokens stop within 13 minutes regardless.

**Before launch:** issue admin tokens from an Ably key with "Revocable tokens" enabled (Ably caps such tokens at 1 hour). Tokens issued by a non-revocable key cannot be revoked, so the key change is a reviewed cutover: switch `ABLY_PRIVATE_KEY`, then wait for the old tokens to expire.

```
Customer token (apps/web POST /api/ably/token), any signed-in user:
  subscribe: ["customer:{userId}:*"]
  publish:   []   ← never

Admin token (apps/admin POST /api/ably/token), for each branch where the person
is Receptionist or above (a shared Manager gets each branch they manage):
  subscribe: ["admin:bookings:{branchId}",
              "admin:schedule:{branchId}:*",
              "admin:leave:{branchId}",
              "booking:{branchId}:*"]
  publish:   []   ← never
```

Ably matches a trailing `*` segment against the rest of the channel name, so `booking:{branchId}:*` covers that branch's bookings and no other branch's; the `:` after the id stops one branch id from matching another that starts with it. Branch ids outside `[A-Za-z0-9_-]` are never placed in a pattern.

The customer site never issues staff channels, whatever the signed-in person's role.

All publishes originate from server-side API routes using `ABLY_PRIVATE_KEY`. The browser never holds a key with publish capability.

---

## Publishing Flow

Booking status changes publish after the DB write commits, best-effort (a failed publish never fails the request). `publishBookingEvent({ bookingId, branchId, customerId, event, data })` fans out to:

```
booking:{branchId}:{bookingId}
admin:bookings:{branchId}
customer:{customerId}:bookings
```

Schedule and leave publishes are planned and will use `admin:schedule:{branchId}:{date}` and `admin:leave:{branchId}`.

---

## UI Subscription Map

| Page | Subscribes to | What updates live |
|------|-------------|-------------------|
| `/bookings` (web) | `customer:{userId}:bookings` | Booking card status badges |
| `/bookings/:id` (web) | `customer:{userId}:bookings`, filtered by `data.bookingId` | Detail status |
| Admin pages | The rendered branch's channels, through `RealtimeProvider` (`branchId`, `scheduleDate`) or `useRealtimeChannel` | Page-specific |
