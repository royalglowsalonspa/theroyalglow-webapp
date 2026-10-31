// @vitest-environment node
/************************************************************
 * Module Name  : bookings/[id]/noshow route.test
 * Scope        : API — Admin Booking
 *
 * Description  : POST /api/bookings/[id]/noshow marks a confirmed booking at
 *                the active branch a no-show through the guarded write, which
 *                also gives back any gems the booking was made with
 *                (multi-branch ST-03). Any other status is 409; a booking at
 *                another branch is 404; a page rendered for another branch
 *                is 409 BRANCH_CONTEXT_CHANGED; a write that finds the
 *                booking changed since it was read is not a second move.
 *
 * Approach     : requireBranchRole and @rgss/db/queries are mocked;
 *                assertRenderedBranch stays REAL.
 ************************************************************/

import { conflict, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

const branchMocks = vi.hoisted(() => ({ requireBranchRole: vi.fn() }))
const dbMocks = vi.hoisted(() => ({
  getBookingForAdmin: vi.fn(),
  markBookingNoShow: vi.fn(),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: branchMocks.requireBranchRole }
})
vi.mock('@rgss/db/queries', () => dbMocks)

import { POST } from './route'

const BOOKING_ID = 'bk_noshow_1'

function noShow(body: unknown = { branchId: TEST_BRANCH.id }) {
  return POST(
    new Request(`https://admin.theroyalglow.in/api/bookings/${BOOKING_ID}/noshow`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
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
  dbMocks.getBookingForAdmin.mockResolvedValue({ id: BOOKING_ID, status: 'confirmed' })
  dbMocks.markBookingNoShow.mockResolvedValue({ id: BOOKING_ID, status: 'no_show' })
})

describe('POST /api/bookings/[id]/noshow', () => {
  it('marks a confirmed booking a no-show at the active branch, as the person acting', async () => {
    const res = await noShow()

    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ booking: { id: BOOKING_ID, status: 'no_show' } })
    expect(branchMocks.requireBranchRole).toHaveBeenCalledWith('receptionist')
    expect(dbMocks.getBookingForAdmin).toHaveBeenCalledWith(BOOKING_ID, TEST_BRANCH.id)
    expect(dbMocks.markBookingNoShow).toHaveBeenCalledWith(BOOKING_ID, TEST_BRANCH.id, 'u_rec')
  })

  it.each(['pending', 'in_progress', 'completed', 'cancelled', 'rejected', 'no_show'])(
    'refuses a %s booking with 409, writing nothing',
    async (status) => {
      dbMocks.getBookingForAdmin.mockResolvedValue({ id: BOOKING_ID, status })

      const res = await noShow()

      expect(res.status).toBe(409)
      expect((await errorOf(res)).code).toBe(ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION)
      expect(dbMocks.markBookingNoShow).not.toHaveBeenCalled()
    },
  )

  it('treats a booking at another branch as not found', async () => {
    dbMocks.getBookingForAdmin.mockResolvedValue(null)

    const res = await noShow()

    expect(res.status).toBe(404)
    expect(dbMocks.markBookingNoShow).not.toHaveBeenCalled()
  })

  it('refuses a page rendered for another branch, reading nothing', async () => {
    const res = await noShow({ branchId: OTHER_BRANCH.id })

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(dbMocks.getBookingForAdmin).not.toHaveBeenCalled()
  })

  it('needs the branch the page was rendered for', async () => {
    const res = await noShow({})

    expect(res.status).toBe(400)
    expect(dbMocks.markBookingNoShow).not.toHaveBeenCalled()
  })

  it('answers 404 when the guarded write finds the booking gone', async () => {
    dbMocks.markBookingNoShow.mockResolvedValue(null)

    const res = await noShow()

    expect(res.status).toBe(404)
  })

  it('answers a write that found the booking no longer confirmed with the error it raised', async () => {
    dbMocks.markBookingNoShow.mockRejectedValue(
      conflict(
        ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
        'This booking changed while you were marking it. Reload it to see where it stands.',
      ),
    )

    const res = await noShow()

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe(ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION)
  })
})
