// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : bookings/[id]/route.test
 * Scope        : GET|PATCH /api/bookings/[id] at the active branch
 *
 * Description  : Property-based verification that approval and rejection
 *                transition a booking ONLY from `pending`, persist their side
 *                effects (staff assignment on approve, reason on reject), and
 *                record a status-log entry capturing the prior status, the new
 *                status, and the acting user — and that from any non-pending
 *                status both actions return BOOKING_INVALID_STATUS_TRANSITION
 *                (409) leaving the booking untouched.
 *
 *                Branch isolation (multi-branch R2.3, R2.4): a booking at
 *                another branch is not found for reads and writes; a write
 *                rendered for another branch is refused with 409
 *                BRANCH_CONTEXT_CHANGED; only staff who work at the branch can
 *                be assigned.
 *
 * Approach     : requireBranchRole and `@rgss/db/queries` are mocked with an
 *                in-memory fake store that mirrors the real query-layer
 *                mutations (status change + status-log append) and scopes every
 *                lookup by branch. assertRenderedBranch, `@rgss/errors` and
 *                `@rgss/types` stay REAL. No DB, no network.
 *
 * Layer        : Testing (node environment — server route handler)
 *
 * Notes        : fast-check + Vitest.
 *                Validates: Requirements 11.1, 11.2, 11.3, 11.4; R2.3, R2.4
 ************************************************************/

import { ERROR_CODES } from '@rgss/errors'
import fc from 'fast-check'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

// ---------------------------------------------------------------------------
// In-memory fake of the admin-bookings query layer. The fakes mutate `store`
// the same way the real Drizzle writers do: approve → status `confirmed` +
// staff assigned to every service + a status-log entry; reject → status
// `rejected` + reason + a status-log entry. Every lookup matches the booking's
// branch too, like the real queries.
// ---------------------------------------------------------------------------
type StatusLogEntry = { fromStatus: string; toStatus: string; changedById: string }
type FakeService = { id: string; bookingId: string; serviceId: string; staffId: string | null }
type FakeBooking = {
  id: string
  branchId: string
  customerId: string
  status: string
  bookingDate: Date
  rejectionReason: string | null
  confirmedAt: Date | null
  rejectedAt: Date | null
  services: FakeService[]
  statusLog: StatusLogEntry[]
}

const store = new Map<string, FakeBooking>()

const mocks = vi.hoisted(() => ({
  requireBranchRole: vi.fn(),
  publishBookingEvent: vi.fn(),
}))

const dbMocks = vi.hoisted(() => {
  const find = (id: string, branchId: string) => {
    const bk = (globalThis as { __patchStore?: Map<string, FakeBooking> }).__patchStore?.get(id)
    return bk && bk.branchId === branchId ? bk : null
  }
  return {
    getClosureOn: vi.fn(async (): Promise<{ name: string; allBranches: boolean } | null> => null),
    getBookingForAdmin: vi.fn(async (id: string, branchId: string) => find(id, branchId)),
    isStaffAtBranch: vi.fn(async (_staffId: string, _branchId: string) => true),
    approveBooking: vi.fn(
      async (id: string, branchId: string, changedById: string, staffId: string) => {
        const bk = find(id, branchId)
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
      },
    ),
    rejectBooking: vi.fn(
      async (id: string, branchId: string, changedById: string, rejectionReason: string) => {
        const bk = find(id, branchId)
        if (!bk) {
          return null
        }
        const fromStatus = bk.status
        bk.status = 'rejected'
        bk.rejectionReason = rejectionReason
        bk.rejectedAt = new Date()
        bk.statusLog.push({ fromStatus, toStatus: 'rejected', changedById })
        return { ...bk }
      },
    ),
    assignStaff: vi.fn(async (bookingId: string, branchId: string, staffId: string) => {
      const bk = find(bookingId, branchId)
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

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: mocks.requireBranchRole }
})
vi.mock('@/lib/realtime/publish', () => ({ publishBookingEvent: mocks.publishBookingEvent }))
vi.mock('@rgss/db/queries', () => dbMocks)

import { GET, PATCH } from '@/app/api/bookings/[id]/route'

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

function seedBooking(status: string, branchId: string = TEST_BRANCH.id): FakeBooking {
  const bk: FakeBooking = {
    id: BOOKING_ID,
    branchId,
    customerId: 'cust_1',
    status,
    bookingDate: new Date('2099-06-15T00:00:00.000Z'),
    rejectionReason: null,
    confirmedAt: null,
    rejectedAt: null,
    services: [
      { id: 'bs_1', bookingId: BOOKING_ID, serviceId: 'svc_1', staffId: null },
      { id: 'bs_2', bookingId: BOOKING_ID, serviceId: 'svc_2', staffId: null },
    ],
    statusLog: [],
  }
  store.clear()
  store.set(BOOKING_ID, bk)
  ;(globalThis as { __patchStore?: Map<string, FakeBooking> }).__patchStore = store
  return bk
}

function patchRequest(body: unknown): Request {
  return new Request(`https://admin.theroyalglow.in/api/bookings/${BOOKING_ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const route = { params: Promise.resolve({ id: BOOKING_ID }) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireBranchRole.mockResolvedValue(branchContext())
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
          mocks.requireBranchRole.mockResolvedValue(branchContext({ userId: actingUserId }))

          const body =
            action === 'approve'
              ? { action, branchId: TEST_BRANCH.id, staffId }
              : { action, branchId: TEST_BRANCH.id, rejectionReason }

          const res = await PATCH(patchRequest(body), route)
          const json = await res.json()
          const bk = store.get(BOOKING_ID) as FakeBooking

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

describe('GET|PATCH /api/bookings/[id] — the active branch only (R2.3, R2.4)', () => {
  it('needs a Receptionist or above at the active branch', async () => {
    seedBooking('pending')
    await GET(new Request(`https://admin.theroyalglow.in/api/bookings/${BOOKING_ID}`), route)
    expect(mocks.requireBranchRole).toHaveBeenCalledWith('receptionist')
  })

  it('reads a booking of the active branch', async () => {
    seedBooking('pending')
    const res = await GET(
      new Request(`https://admin.theroyalglow.in/api/bookings/${BOOKING_ID}`),
      route,
    )
    expect(res.status).toBe(200)
    expect(dbMocks.getBookingForAdmin).toHaveBeenCalledWith(BOOKING_ID, TEST_BRANCH.id)
  })

  it('treats a booking at another branch as not found, for reads and writes', async () => {
    seedBooking('pending', OTHER_BRANCH.id)

    const read = await GET(
      new Request(`https://admin.theroyalglow.in/api/bookings/${BOOKING_ID}`),
      route,
    )
    expect(read.status).toBe(404)

    const write = await PATCH(
      patchRequest({ action: 'approve', branchId: TEST_BRANCH.id, staffId: 'stf_1' }),
      route,
    )
    expect(write.status).toBe(404)
    expect(dbMocks.approveBooking).not.toHaveBeenCalled()
    expect(store.get(BOOKING_ID)?.status).toBe('pending')
  })

  it('refuses a write rendered for another branch with 409, before reading the booking', async () => {
    seedBooking('pending')

    const res = await PATCH(
      patchRequest({ action: 'reject', branchId: OTHER_BRANCH.id, rejectionReason: 'Closed' }),
      route,
    )
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(dbMocks.getBookingForAdmin).not.toHaveBeenCalled()
    expect(dbMocks.rejectBooking).not.toHaveBeenCalled()
    expect(store.get(BOOKING_ID)?.status).toBe('pending')
  })

  it('needs the rendered branch on every write', async () => {
    seedBooking('pending')
    const res = await PATCH(patchRequest({ action: 'approve', staffId: 'stf_1' }), route)
    expect(res.status).toBe(400)
    expect(dbMocks.approveBooking).not.toHaveBeenCalled()
  })

  it.each(['approve', 'assign'] as const)(
    'refuses to %s someone who does not work at the branch',
    async (action) => {
      seedBooking('pending')
      dbMocks.isStaffAtBranch.mockResolvedValueOnce(false)

      const res = await PATCH(
        patchRequest({ action, branchId: TEST_BRANCH.id, staffId: 'stf_elsewhere' }),
        route,
      )

      expect(res.status).toBe(400)
      expect(dbMocks.isStaffAtBranch).toHaveBeenCalledWith('stf_elsewhere', TEST_BRANCH.id)
      expect(dbMocks.approveBooking).not.toHaveBeenCalled()
      expect(dbMocks.assignStaff).not.toHaveBeenCalled()
      expect(store.get(BOOKING_ID)?.services.every((s) => s.staffId === null)).toBe(true)
    },
  )

  it('assigns staff at the branch and announces it for the booking’s branch', async () => {
    seedBooking('confirmed')

    const res = await PATCH(
      patchRequest({ action: 'assign', branchId: TEST_BRANCH.id, staffId: 'stf_here' }),
      route,
    )

    expect(res.status).toBe(200)
    // The actor closes the booking's reassignment work, if any (R1.7).
    expect(dbMocks.assignStaff).toHaveBeenCalledWith(
      BOOKING_ID,
      TEST_BRANCH.id,
      'stf_here',
      'user_1',
    )
    expect(mocks.publishBookingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: BOOKING_ID,
        branchId: TEST_BRANCH.id,
        event: 'assigned',
      }),
    )
  })
})

describe('PATCH /api/bookings/[id] — closed days (R1.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_rcp' }))
  })

  it('refuses to confirm a booking for a day the branch has since closed', async () => {
    seedBooking('pending')
    dbMocks.getClosureOn.mockResolvedValueOnce({ name: 'Diwali', allBranches: true })

    const res = await PATCH(
      patchRequest({ action: 'approve', branchId: TEST_BRANCH.id, staffId: 'stf_1' }),
      route,
    )
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe(ERROR_CODES.BOOKING_SLOT_UNAVAILABLE)
    expect(json.error.message).toBe(
      'Rayasandra is closed on 15/06/2099 (Diwali). Reschedule or reject the booking instead.',
    )
    expect(dbMocks.getClosureOn).toHaveBeenCalledWith(TEST_BRANCH.id, '2099-06-15')
    expect(dbMocks.approveBooking).not.toHaveBeenCalled()
    expect(store.get(BOOKING_ID)?.status).toBe('pending')
  })

  it('still lets reception reject it: rejecting never consults closures', async () => {
    seedBooking('pending')

    const res = await PATCH(
      patchRequest({ action: 'reject', branchId: TEST_BRANCH.id, rejectionReason: 'Closed' }),
      route,
    )

    expect(res.status).toBe(200)
    expect(store.get(BOOKING_ID)?.status).toBe('rejected')
    expect(dbMocks.getClosureOn).not.toHaveBeenCalled()
  })
})
