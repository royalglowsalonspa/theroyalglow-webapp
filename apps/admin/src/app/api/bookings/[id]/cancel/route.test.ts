// @vitest-environment node
/************************************************************
 * Module Name  : bookings/[id]/cancel route.test (admin)
 * Scope        : API — Admin Booking (membership-scheduling.md slice 3)
 *
 * Description  : POST /api/bookings/[id]/cancel: the salon cancels a pending
 *                or confirmed booking at the active branch, saying why:
 *                - by the person acting, with the reason, and never as the
 *                  customer's late cancellation (no lateness decision);
 *                - a booking under way or ended is 409, one at another
 *                  branch 404, a page rendered for another branch 409;
 *                - a reason is required, at most 500 characters;
 *                - a cancel that found the booking changed meanwhile is the
 *                  error it raised, and publishes nothing.
 *
 * Approach     : requireBranchRole, @rgss/db/queries and the realtime
 *                publisher are mocked; assertRenderedBranch, @rgss/errors and
 *                @rgss/types stay REAL.
 ************************************************************/

import { conflict, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

const branchMocks = vi.hoisted(() => ({ requireBranchRole: vi.fn() }))
const dbMocks = vi.hoisted(() => ({
  getBookingForAdmin: vi.fn(),
  cancelBooking: vi.fn(),
}))
const publishMock = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: branchMocks.requireBranchRole }
})
vi.mock('@rgss/db/queries', () => dbMocks)
vi.mock('@/lib/realtime/publish', () => ({ publishBookingEvent: publishMock }))

import { POST } from './route'

const BOOKING_ID = 'bk_cancel_1'

function cancel(body: Record<string, unknown>) {
  return POST(
    new Request(`https://admin.theroyalglow.in/api/bookings/${BOOKING_ID}/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ branchId: TEST_BRANCH.id, ...body }),
    }),
    { params: Promise.resolve({ id: BOOKING_ID }) },
  )
}

async function errorOf(res: Response) {
  return ((await res.json()) as { error: { code: string; message: string } }).error
}

beforeEach(() => {
  vi.clearAllMocks()
  branchMocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_rec' }))
  dbMocks.getBookingForAdmin.mockResolvedValue({
    id: BOOKING_ID,
    status: 'confirmed',
    customerId: 'cust_1',
  })
  dbMocks.cancelBooking.mockImplementation(async (id: string) => ({ id, status: 'cancelled' }))
})

describe('POST /api/bookings/[id]/cancel (admin)', () => {
  it.each(['confirmed', 'pending'])(
    'cancels a %s booking with the reason, never as a late cancellation',
    async (status) => {
      dbMocks.getBookingForAdmin.mockResolvedValue({ id: BOOKING_ID, status, customerId: 'cust_1' })

      const res = await cancel({ reason: '  Branch closed for Diwali  ' })

      expect(res.status).toBe(200)
      expect((await res.json()).data).toEqual({
        booking: { id: BOOKING_ID, status: 'cancelled' },
      })
      expect(branchMocks.requireBranchRole).toHaveBeenCalledWith('receptionist')
      expect(dbMocks.getBookingForAdmin).toHaveBeenCalledWith(BOOKING_ID, TEST_BRANCH.id)
      // Three arguments: no lateness decision, so the customer's record isn't marked.
      expect(dbMocks.cancelBooking).toHaveBeenCalledWith(
        BOOKING_ID,
        'u_rec',
        'Branch closed for Diwali',
      )
      expect(publishMock).toHaveBeenCalledWith({
        bookingId: BOOKING_ID,
        branchId: TEST_BRANCH.id,
        customerId: 'cust_1',
        event: 'status_changed',
        data: { status: 'cancelled' },
      })
    },
  )

  it('refuses a booking under way, pointing to completing it', async () => {
    dbMocks.getBookingForAdmin.mockResolvedValue({
      id: BOOKING_ID,
      status: 'in_progress',
      customerId: 'cust_1',
    })

    const res = await cancel({ reason: 'Customer left' })
    const error = await errorOf(res)

    expect(res.status).toBe(409)
    expect(error.code).toBe(ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION)
    expect(error.message).toBe(
      'This booking is under way, so it can’t be cancelled. Complete it instead.',
    )
    expect(dbMocks.cancelBooking).not.toHaveBeenCalled()
  })

  it.each(['completed', 'cancelled', 'rejected', 'no_show'])(
    'refuses a %s booking with 409, cancelling nothing',
    async (status) => {
      dbMocks.getBookingForAdmin.mockResolvedValue({ id: BOOKING_ID, status, customerId: 'cust_1' })

      const res = await cancel({ reason: 'Branch closed' })

      expect(res.status).toBe(409)
      expect((await errorOf(res)).code).toBe(ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION)
      expect(dbMocks.cancelBooking).not.toHaveBeenCalled()
    },
  )

  it('treats a booking at another branch as not found', async () => {
    dbMocks.getBookingForAdmin.mockResolvedValue(null)

    const res = await cancel({ reason: 'Branch closed' })

    expect(res.status).toBe(404)
    expect(dbMocks.cancelBooking).not.toHaveBeenCalled()
  })

  it('refuses a page rendered for another branch, reading nothing', async () => {
    const res = await cancel({ branchId: OTHER_BRANCH.id, reason: 'Branch closed' })

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(dbMocks.getBookingForAdmin).not.toHaveBeenCalled()
  })

  it.each([
    ['no reason', {}],
    ['a blank reason', { reason: '   ' }],
    ['a reason over 500 characters', { reason: 'x'.repeat(501) }],
  ])('answers 400 for %s', async (_case, body) => {
    const res = await cancel(body)

    expect(res.status).toBe(400)
    expect(dbMocks.getBookingForAdmin).not.toHaveBeenCalled()
  })

  it('answers 404 when the guarded write finds the booking gone', async () => {
    dbMocks.cancelBooking.mockResolvedValue(null)

    const res = await cancel({ reason: 'Branch closed' })

    expect(res.status).toBe(404)
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('answers a cancel that found the booking changed meanwhile with the error it raised', async () => {
    dbMocks.cancelBooking.mockRejectedValue(
      conflict(
        ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
        'This booking changed while you were cancelling it. Reload it to see where it stands.',
      ),
    )

    const res = await cancel({ reason: 'Branch closed' })

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe(ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION)
    expect(publishMock).not.toHaveBeenCalled()
  })
})
