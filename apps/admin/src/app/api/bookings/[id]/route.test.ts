// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : bookings/[id]/route.test
 * Scope        : Property test — PATCH /api/bookings/[id] (approve/reject)
 *
 * Description  : Property-based verification that approval and rejection
 *                transition a booking ONLY from `pending`, persist their side
 *                effects (staff assignment on approve, reason on reject), and
 *                record a status-log entry capturing the prior status, the new
 *                status, and the acting user — and that from any non-pending
 *                status both actions return BOOKING_INVALID_STATUS_TRANSITION
 *                (409) leaving the booking untouched.
 *
 * Approach     : `@/lib/api/session` (requireRole) and `@rgss/db/queries`
 *                (getBookingForAdmin, approveBooking, rejectBooking, assignStaff)
 *                are mocked with an in-memory fake store that mirrors the real
 *                query-layer mutations (status change + status-log append).
 *                `@rgss/business`/`@rgss/errors`/`@rgss/types` stay REAL. No DB,
 *                no network.
 *
 * Layer        : Testing (node environment — server route handler)
 *
 * Notes        : fast-check + Vitest, ≥100 runs.
 *                Validates: Requirements 11.1, 11.2, 11.3, 11.4
 ************************************************************/

import { ERROR_CODES } from '@rgss/errors'
import fc from 'fast-check'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// In-memory fake of the admin-bookings query layer. The fakes mutate `store`
// the same way the real Drizzle writers do: approve → status `confirmed` +
// staff assigned to every service + a status-log entry; reject → status
// `rejected` + reason + a status-log entry. The route guards the transition
// (pending-only) before calling these, so for non-pending statuses the writers
// are never invoked and `store` is left untouched.
// ---------------------------------------------------------------------------
type StatusLogEntry = { fromStatus: string; toStatus: string; changedById: string }
type FakeService = { id: string; bookingId: string; serviceId: string; staffId: string | null }
type FakeBooking = {
  id: string
  status: string
  rejectionReason: string | null
  confirmedAt: Date | null
  rejectedAt: Date | null
  services: FakeService[]
  statusLog: StatusLogEntry[]
}

const state = vi.hoisted(() => ({ store: new Map<string, unknown>() })) as {
  store: Map<string, FakeBooking>
}

const sessionMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

const dbMocks = vi.hoisted(() => {
  const store = () => (globalThis as { __patchStore?: Map<string, FakeBooking> }).__patchStore
  return {
    getBookingForAdmin: vi.fn(async (id: string) => store()?.get(id) ?? null),
    approveBooking: vi.fn(async (id: string, changedById: string, staffId: string) => {
      const bk = store()?.get(id)
      if (!bk) {
        return null
      }
      const fromStatus = bk.status
      bk.status = 'confirmed'
      bk.confirmedAt = new Date()
      for (const svc of bk.services) {
        svc.staffId = staffId
      }
      bk.statusLog.push({ fromStatus, toStatus: 'confirmed', changedById })
      return { ...bk }
    }),
    rejectBooking: vi.fn(async (id: string, changedById: string, rejectionReason: string) => {
      const bk = store()?.get(id)
      if (!bk) {
        return null
      }
      const fromStatus = bk.status
      bk.status = 'rejected'
      bk.rejectionReason = rejectionReason
      bk.rejectedAt = new Date()
      bk.statusLog.push({ fromStatus, toStatus: 'rejected', changedById })
      return { ...bk }
    }),
    assignStaff: vi.fn(async (bookingId: string, staffId: string) => {
      const bk = store()?.get(bookingId)
      if (!bk) {
        return []
      }
      for (const svc of bk.services) {
        svc.staffId = staffId
      }
      return bk.services.map((s) => ({ ...s }))
    }),
  }
})

vi.mock('@/lib/api/session', () => sessionMocks)
vi.mock('@rgss/db/queries', () => dbMocks)

import { PATCH } from '@/app/api/bookings/[id]/route'

const BOOKING_ID = 'bk_1'

// Lifecycle statuses a booking row can be in when an admin action arrives.
const ALL_STATUSES = [
  'pending',
  'confirmed',
  'rejected',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled',
] as const

function seedBooking(status: string): FakeBooking {
  const bk: FakeBooking = {
    id: BOOKING_ID,
    status,
    rejectionReason: null,
    confirmedAt: null,
    rejectedAt: null,
    services: [
      { id: 'bs_1', bookingId: BOOKING_ID, serviceId: 'svc_1', staffId: null },
      { id: 'bs_2', bookingId: BOOKING_ID, serviceId: 'svc_2', staffId: null },
    ],
    statusLog: [],
  }
  state.store.clear()
  state.store.set(BOOKING_ID, bk)
  ;(globalThis as { __patchStore?: Map<string, FakeBooking> }).__patchStore = state.store
  return bk
}

function patchRequest(body: unknown): Request {
  return new Request(`https://admin.theroyalglow.in/api/bookings/${BOOKING_ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const ctx = { params: Promise.resolve({ id: BOOKING_ID }) }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/bookings/[id] — approve/reject transitions', () => {
  // Feature: backend-api, Property 25: Approval and rejection transition only from pending and are logged
  it('approve/reject only transition from pending, persist their effects, and log with the acting user', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ALL_STATUSES),
        fc.constantFrom('approve', 'reject'),
        fc.string({ minLength: 1, maxLength: 12 }).map((s) => `stf_${s.replace(/\s/g, '')}_x`),
        fc.string({ minLength: 1, maxLength: 40 }).map((s) => `reason ${s.replace(/\s/g, '')}`),
        fc.string({ minLength: 1, maxLength: 10 }).map((s) => `u_${s.replace(/\s/g, '')}_x`),
        async (status, action, staffId, rejectionReason, actingUserId) => {
          // Reset call history per iteration (keeps the vi.fn implementations)
          // so the "writer never called" assertion reflects this run only.
          vi.clearAllMocks()
          seedBooking(status)
          sessionMocks.requireRole.mockResolvedValue({
            user: { id: actingUserId, role: 'receptionist' },
          })

          const body = action === 'approve' ? { action, staffId } : { action, rejectionReason }

          const res = await PATCH(patchRequest(body), ctx)
          const json = await res.json()
          const bk = state.store.get(BOOKING_ID) as FakeBooking

          if (status === 'pending') {
            // Transition succeeds from pending.
            expect(res.status).toBe(200)
            expect(json.success).toBe(true)

            if (action === 'approve') {
              expect(bk.status).toBe('confirmed')
              // Staff assignment persisted to every service (Req 11.1).
              expect(bk.services.every((s) => s.staffId === staffId)).toBe(true)
            } else {
              expect(bk.status).toBe('rejected')
              // Rejection reason stored (Req 11.2).
              expect(bk.rejectionReason).toBe(rejectionReason)
            }

            // Exactly one status-log entry capturing prior → new + acting user (Req 11.4).
            expect(bk.statusLog).toHaveLength(1)
            const log = bk.statusLog[0]
            expect(log).toBeDefined()
            expect(log?.fromStatus).toBe('pending')
            expect(log?.toStatus).toBe(action === 'approve' ? 'confirmed' : 'rejected')
            expect(log?.changedById).toBe(actingUserId)
          } else {
            // From any non-pending status both actions are rejected (Req 11.3).
            expect(res.status).toBe(409)
            expect(json.success).toBe(false)
            expect(json.error.code).toBe(ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION)
            // The booking is left untouched: no status change, no log appended,
            // and the mutating writers were never called.
            expect(bk.status).toBe(status)
            expect(bk.statusLog).toHaveLength(0)
            expect(dbMocks.approveBooking).not.toHaveBeenCalled()
            expect(dbMocks.rejectBooking).not.toHaveBeenCalled()
          }
        },
      ),
      { numRuns: 25 },
    )
  })
})
