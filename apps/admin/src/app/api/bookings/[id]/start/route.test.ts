// @vitest-environment node
/************************************************************
 * Module Name  : bookings/[id]/start route.test
 * Scope        : API — Admin Booking
 *
 * Description  : POST /api/bookings/[id]/start moves a confirmed, assigned
 *                booking at the active branch to in progress through the
 *                guarded write, as the person acting ("Start" in
 *                membership-scheduling.md). Any other status is 409; nobody
 *                assigned is 409; a booking at another branch is 404; a page
 *                rendered for another branch is 409 BRANCH_CONTEXT_CHANGED. A
 *                write that finds the booking changed is not a second start,
 *                and a membership session the database refuses to start (its
 *                membership isn't valid now, MS-06) says why, from a fresh
 *                read of the membership. One person does a booking (0028):
 *                lines naming different people are a 409, and a start the
 *                database refuses because that person is still with another
 *                customer (MS-08) is 409 STAFF_BUSY, naming them.
 *
 * Approach     : requireBranchRole, @rgss/db/queries and the realtime
 *                publisher are mocked; assertRenderedBranch and
 *                @rgss/business stay REAL.
 ************************************************************/

import { ERROR_CODES } from '@rgss/errors'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

const branchMocks = vi.hoisted(() => ({ requireBranchRole: vi.fn() }))
const dbMocks = vi.hoisted(() => ({
  getBookingForAdmin: vi.fn(),
  getMembershipById: vi.fn(),
  startBooking: vi.fn(),
}))
const realtimeMocks = vi.hoisted(() => ({ publishBookingEvent: vi.fn(async () => {}) }))
const overrunMocks = vi.hoisted(() => ({
  raiseStaffOverruns: vi.fn(async () => ({ flagged: 0, heldUp: 0, notified: 0 })),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: branchMocks.requireBranchRole }
})
vi.mock('@rgss/db/queries', () => dbMocks)
vi.mock('@/lib/realtime/publish', () => realtimeMocks)
vi.mock('@/lib/jobs/staff-overrun', () => overrunMocks)

import { POST } from './route'

const BOOKING_ID = 'bk_start_1'

// 11:30 IST on 05/11/2026; the fixtures are bookings for that day.
const NOW = new Date('2026-11-05T06:00:00.000Z')

function confirmed(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    status: 'confirmed',
    branchId: TEST_BRANCH.id,
    customerId: 'cust_1',
    bookingDate: new Date('2026-11-05T00:00:00.000Z'),
    isMembershipSession: false,
    spaMembershipId: null,
    services: [{ serviceId: 'svc_1', staffId: 'stf_1' }],
    ...overrides,
  }
}

const SESSION = confirmed({
  isMembershipSession: true,
  spaMembershipId: 'mem_1',
  services: [{ serviceId: 'svc_aroma', staffId: 'stf_1' }],
})

function start(body: unknown = { branchId: TEST_BRANCH.id }) {
  return POST(
    new Request(`https://admin.theroyalglow.in/api/bookings/${BOOKING_ID}/start`, {
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
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  branchMocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_rec' }))
  dbMocks.getBookingForAdmin.mockResolvedValue(confirmed())
  dbMocks.startBooking.mockResolvedValue({
    ok: true,
    booking: { id: BOOKING_ID, status: 'in_progress' },
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/bookings/[id]/start', () => {
  it('refuses a booking for a later day, saying to move it first', async () => {
    dbMocks.getBookingForAdmin.mockResolvedValue(
      confirmed({ bookingDate: new Date('2026-11-06T00:00:00.000Z') }),
    )

    const res = await start()

    expect(res.status).toBe(409)
    expect(await errorOf(res)).toMatchObject({
      code: ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
      message: 'This booking is for 06/11/2026. Start it on that day, or move it to today first.',
    })
    expect(dbMocks.startBooking).not.toHaveBeenCalled()
  })

  it('starts a booking from an earlier day that runs late', async () => {
    dbMocks.getBookingForAdmin.mockResolvedValue(
      confirmed({ bookingDate: new Date('2026-11-04T00:00:00.000Z') }),
    )

    expect((await start()).status).toBe(200)
  })

  it('starts a confirmed booking at the active branch, as the person acting', async () => {
    const res = await start()

    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({
      booking: { id: BOOKING_ID, status: 'in_progress' },
    })
    expect(branchMocks.requireBranchRole).toHaveBeenCalledWith('receptionist')
    expect(dbMocks.getBookingForAdmin).toHaveBeenCalledWith(BOOKING_ID, TEST_BRANCH.id)
    expect(dbMocks.startBooking).toHaveBeenCalledWith({
      bookingId: BOOKING_ID,
      branchId: TEST_BRANCH.id,
      changedById: 'u_rec',
    })
    expect(realtimeMocks.publishBookingEvent).toHaveBeenCalledWith({
      bookingId: BOOKING_ID,
      branchId: TEST_BRANCH.id,
      customerId: 'cust_1',
      event: 'status_changed',
      data: { status: 'in_progress' },
    })
  })

  it('starts a membership session the same way, its minutes staying held', async () => {
    dbMocks.getBookingForAdmin.mockResolvedValue(SESSION)

    const res = await start()

    expect(res.status).toBe(200)
    expect(dbMocks.startBooking).toHaveBeenCalledOnce()
    expect(dbMocks.getMembershipById).not.toHaveBeenCalled()
  })

  it.each(['pending', 'in_progress', 'completed', 'cancelled', 'rejected', 'no_show'])(
    'refuses a %s booking with 409, writing nothing',
    async (status) => {
      dbMocks.getBookingForAdmin.mockResolvedValue(confirmed({ status }))

      const res = await start()

      expect(res.status).toBe(409)
      expect(await errorOf(res)).toMatchObject({
        code: ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
        message: `Only a confirmed booking can be started (current status: "${status}").`,
      })
      expect(dbMocks.startBooking).not.toHaveBeenCalled()
    },
  )

  it('refuses a booking nobody is assigned to (R1.7)', async () => {
    dbMocks.getBookingForAdmin.mockResolvedValue(
      confirmed({ services: [{ serviceId: 'svc_1', staffId: null }] }),
    )

    const res = await start()

    expect(res.status).toBe(409)
    expect(await errorOf(res)).toMatchObject({
      code: ERROR_CODES.CONFLICT,
      message: 'Nobody is assigned to this booking. Assign who is doing it, then start it.',
    })
    expect(dbMocks.startBooking).not.toHaveBeenCalled()
  })

  it('refuses a booking whose lines name different people (0028)', async () => {
    dbMocks.getBookingForAdmin.mockResolvedValue(
      confirmed({
        services: [
          { serviceId: 'svc_1', staffId: 'stf_1' },
          { serviceId: 'svc_2', staffId: 'stf_2' },
        ],
      }),
    )

    const res = await start()

    expect(res.status).toBe(409)
    expect(await errorOf(res)).toMatchObject({
      code: ERROR_CODES.CONFLICT,
      message:
        'This booking names more than one person. Assign one person to all of it, then start it.',
    })
    expect(dbMocks.startBooking).not.toHaveBeenCalled()
  })

  it('names the person still with another customer when the database refuses the start (MS-08)', async () => {
    dbMocks.getBookingForAdmin.mockResolvedValue(
      confirmed({
        services: [
          { serviceId: 'svc_1', staffId: 'stf_1', staffName: 'Anita' },
          { serviceId: 'svc_2', staffId: 'stf_1', staffName: 'Anita' },
        ],
      }),
    )
    dbMocks.startBooking.mockResolvedValue({ ok: false, reason: 'staff_busy' })

    const res = await start()

    expect(res.status).toBe(409)
    expect(await errorOf(res)).toMatchObject({
      code: ERROR_CODES.STAFF_BUSY,
      message:
        'Anita is still with another customer. Complete that booking first, or assign someone else to this one.',
    })
    expect(realtimeMocks.publishBookingEvent).not.toHaveBeenCalled()
    // Held up past the grace, it is flagged and the front desk told (slice 2b).
    expect(overrunMocks.raiseStaffOverruns).toHaveBeenCalledWith({ bookingId: BOOKING_ID })
  })

  it('still refuses the start when flagging the hold-up fails', async () => {
    dbMocks.startBooking.mockResolvedValue({ ok: false, reason: 'staff_busy' })
    overrunMocks.raiseStaffOverruns.mockRejectedValueOnce(new Error('notifications down'))

    const res = await start()

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe(ERROR_CODES.STAFF_BUSY)
  })

  it('flags nothing for a start refused for another reason', async () => {
    dbMocks.startBooking.mockResolvedValue({ ok: false, reason: 'not_confirmed' })

    await start()

    expect(overrunMocks.raiseStaffOverruns).not.toHaveBeenCalled()
  })

  it('answers a start the database finds naming different people', async () => {
    dbMocks.startBooking.mockResolvedValue({ ok: false, reason: 'not_one_assignee' })

    const res = await start()

    expect(res.status).toBe(409)
    expect(await errorOf(res)).toMatchObject({
      code: ERROR_CODES.CONFLICT,
      message:
        'This booking names more than one person. Assign one person to all of it, then start it.',
    })
  })

  it('treats a booking at another branch as not found', async () => {
    dbMocks.getBookingForAdmin.mockResolvedValue(null)

    const res = await start()

    expect(res.status).toBe(404)
    expect(dbMocks.startBooking).not.toHaveBeenCalled()
  })

  it('refuses a page rendered for another branch, reading nothing', async () => {
    const res = await start({ branchId: OTHER_BRANCH.id })

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(dbMocks.getBookingForAdmin).not.toHaveBeenCalled()
  })

  it('needs the branch the page was rendered for', async () => {
    const res = await start({})

    expect(res.status).toBe(400)
    expect(dbMocks.startBooking).not.toHaveBeenCalled()
  })

  it('answers a write that found the booking no longer confirmed: no second start', async () => {
    dbMocks.startBooking.mockResolvedValue({ ok: false, reason: 'not_confirmed' })

    const res = await start()

    expect(res.status).toBe(409)
    expect(await errorOf(res)).toMatchObject({
      code: ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
      message: 'This booking was started or changed meanwhile. Reload it to see where it stands.',
    })
    expect(realtimeMocks.publishBookingEvent).not.toHaveBeenCalled()
  })

  describe('a membership session the database refuses to start (MS-06)', () => {
    beforeEach(() => {
      dbMocks.getBookingForAdmin.mockResolvedValue(SESSION)
      dbMocks.startBooking.mockResolvedValue({ ok: false, reason: 'membership_unavailable' })
    })

    it('says when the membership expired, as an IST date', async () => {
      dbMocks.getMembershipById.mockResolvedValue({
        id: 'mem_1',
        status: 'active',
        startsAt: new Date('2026-07-31T18:30:00.000Z'),
        // 23:59:59.999 IST on 24/10/2026.
        expiresAt: new Date('2026-10-24T18:29:59.999Z'),
      })

      const res = await start()

      expect(res.status).toBe(409)
      expect(await errorOf(res)).toEqual(
        expect.objectContaining({
          code: ERROR_CODES.MEMBERSHIP_EXPIRED,
          message: "This membership expired on 24/10/2026, so the session can't start.",
        }),
      )
      expect(dbMocks.getMembershipById).toHaveBeenCalledWith('mem_1')
      expect(realtimeMocks.publishBookingEvent).not.toHaveBeenCalled()
    })

    it('says when a membership sold to start later starts', async () => {
      dbMocks.getMembershipById.mockResolvedValue({
        id: 'mem_1',
        status: 'active',
        // 00:00 IST on 01/01/2099.
        startsAt: new Date('2098-12-31T18:30:00.000Z'),
        expiresAt: new Date('2099-03-31T18:29:59.999Z'),
      })

      const res = await start()

      expect(res.status).toBe(409)
      expect(await errorOf(res)).toMatchObject({
        code: ERROR_CODES.MEMBERSHIP_NOT_STARTED,
        message: 'This membership starts on 01/01/2099. The session can start from then.',
      })
    })

    it('falls back to a reload when the fresh read explains nothing', async () => {
      dbMocks.getMembershipById.mockResolvedValue(null)

      const res = await start()

      expect(res.status).toBe(409)
      expect(await errorOf(res)).toMatchObject({
        code: ERROR_CODES.MEMBERSHIP_EXPIRED,
        message:
          "The membership can't be used right now. Reload the booking to see where it stands.",
      })
    })
  })
})
