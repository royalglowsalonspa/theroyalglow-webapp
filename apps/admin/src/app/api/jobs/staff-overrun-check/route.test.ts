// @vitest-environment node
/************************************************************
 * Module Name  : jobs/staff-overrun-check route.test
 * Scope        : API — Background Jobs (membership-scheduling.md slice 2b, MS-08)
 *
 * Description  : The job flags bookings held up because their person is
 *                still with another customer (15 minutes ahead, 10 minutes'
 *                grace) and tells each one's own branch front desk, naming up
 *                to three people free to take it who may do that kind of
 *                work. Every held-up booking is told about once per person,
 *                so the next run retries a failed alert. It is refused
 *                without a valid signature and fails with 500 for a retry.
 *
 * Approach     : @rgss/db/queries, dispatch and the heartbeat are mocked; the
 *                verifier, raiseStaffOverruns, alertBranchFrontDesk and
 *                @rgss/business are real.
 ************************************************************/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  OVERRUN_GRACE_MINUTES: 10,
  OVERRUN_LEAD_MINUTES: 15,
  createNotification: vi.fn(),
  flagStaffOverruns: vi.fn(),
  getBranchPeople: vi.fn(),
  getLiveStaffOverruns: vi.fn(),
  getStaffAvailability: vi.fn(),
  hasNotification: vi.fn(),
}))
const dispatchMock = vi.hoisted(() => vi.fn())
const heartbeatMock = vi.hoisted(() => vi.fn())

vi.mock('@rgss/db/queries', () => dbMocks)
vi.mock('@/lib/notifications/dispatch', () => ({ dispatchNotification: dispatchMock }))
vi.mock('@/lib/jobs/heartbeat', () => ({ pingHeartbeat: heartbeatMock }))

import { POST } from './route'

const RECEPTION = { userId: 'reception', name: 'Kavya', email: 'reception@x.test' }
const MANAGER = { userId: 'manager', name: 'Manish', email: 'manager@x.test' }

const RS = {
  id: 'branch_rs',
  name: 'Rayasandra',
  code: 'RS',
  status: 'operational',
  isPrimary: true,
  phone: '+910000000000',
  googleMapsUrl: null,
  owner: { userId: 'owner', name: 'Owner', email: 'owner@x.test' },
  manager: MANAGER,
  receptionist: RECEPTION,
}

// Asha's 11:00 SPA booking at Rayasandra, held up by her earlier customer.
const HELD_UP = {
  bookingId: 'bk_1',
  branchId: 'branch_rs',
  bookingDate: '2026-10-31',
  startTime: '11:00',
  endTime: '12:00',
  kind: 'spa' as const,
  staffId: 'stf_asha',
  staffName: 'Asha',
  serviceIds: ['svc_aroma'],
}

function person(id: string, name: string, designation: string, extra = {}) {
  return { id, userId: `u_${id}`, name, designation, performs: 0, busy: null, ...extra }
}

const PEOPLE = [
  person('stf_asha', 'Asha', 'therapist', {
    performs: 1,
    busy: { reason: 'working', since: '10:15' },
  }),
  person('stf_lata', 'Lata', 'therapist', { performs: 1 }),
  person('stf_ravi', 'Ravi', 'stylist'),
  person('stf_meena', 'Meena', 'therapist', { busy: { reason: 'on_leave' } }),
  person('stf_manish', 'Manish', 'manager'),
  person('stf_neha', 'Neha', 'therapist', {
    busy: { reason: 'booked', from: '11:00', to: '12:00' },
  }),
]

function jobRequest(): Request {
  return new Request('https://admin.theroyalglow.in/api/jobs/staff-overrun-check', {
    method: 'POST',
    body: '{}',
  })
}

function notifications() {
  return dbMocks.createNotification.mock.calls.map(([p]) => p)
}

beforeEach(() => {
  vi.clearAllMocks()
  // Outside production with no keys or token, the real verifier allows the
  // documented local invocation.
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', undefined)
  vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', undefined)
  vi.stubEnv('INTERNAL_JOB_TOKEN', undefined)
  dbMocks.flagStaffOverruns.mockResolvedValue(['bk_1'])
  dbMocks.getLiveStaffOverruns.mockResolvedValue([HELD_UP])
  dbMocks.getStaffAvailability.mockResolvedValue(PEOPLE)
  dbMocks.getBranchPeople.mockResolvedValue({ branches: [RS], developer: null })
  dbMocks.hasNotification.mockResolvedValue(false)
  dbMocks.createNotification.mockImplementation(async (p) => ({
    id: `n_${p.userId}`,
    channel: 'push',
    ...p,
  }))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/jobs/staff-overrun-check', () => {
  it('flags bookings due within 15 minutes, held up past a 10-minute grace', async () => {
    const res = await POST(jobRequest())

    expect(res.status).toBe(200)
    expect(dbMocks.flagStaffOverruns).toHaveBeenCalledWith({
      leadMinutes: 15,
      graceMinutes: 10,
      bookingId: undefined,
    })
    expect(dbMocks.getLiveStaffOverruns).toHaveBeenCalledWith({ bookingId: undefined })
    expect(await res.json()).toEqual({ success: true, flagged: 1, heldUp: 1, notified: 2 })
    expect(heartbeatMock).toHaveBeenCalledWith('STAFF_OVERRUN')
  })

  it("tells the booking's own front desk, naming who is free to take it", async () => {
    await POST(jobRequest())

    expect(dbMocks.getBranchPeople).toHaveBeenCalledWith(['branch_rs'])
    // Suggestions come from the booking's own slot, without the booking itself.
    expect(dbMocks.getStaffAvailability).toHaveBeenCalledWith({
      branchId: 'branch_rs',
      slot: {
        dateISO: '2026-10-31',
        startTime: '11:00',
        endTime: '12:00',
        kind: 'spa',
        excludeBookingId: 'bk_1',
      },
      serviceIds: ['svc_aroma'],
    })
    expect(
      notifications()
        .map((n) => n.userId)
        .sort(),
    ).toEqual(['manager', 'reception'])
    for (const n of notifications()) {
      expect(n).toMatchObject({
        type: 'staff_overrun',
        bookingId: 'bk_1',
        channel: 'push',
        title: 'Booking Held Up',
        // Free and a SPA candidate: Lata, then the Manager. Not Asha (busy),
        // Ravi (a Stylist), Meena (on leave) or Neha (booked then).
        body: 'Asha is still with another customer, so the 11:00 booking at Rayasandra on 31/10/2026 can’t start yet. Wait for them or assign someone else. Free then: Lata, Manish.',
      })
    }
    expect(dispatchMock).toHaveBeenCalledTimes(2)
  })

  it('leaves out the suggestions when nobody is free', async () => {
    dbMocks.getStaffAvailability.mockResolvedValue(PEOPLE.slice(0, 1))

    await POST(jobRequest())

    expect(notifications()[0]?.body).toBe(
      'Asha is still with another customer, so the 11:00 booking at Rayasandra on 31/10/2026 can’t start yet. Wait for them or assign someone else.',
    )
  })

  it('tells nobody twice: a later run retries only the people not yet told', async () => {
    dbMocks.flagStaffOverruns.mockResolvedValue([])
    dbMocks.hasNotification.mockImplementation(
      async (userId: string, type: string, bookingId: string) =>
        userId === 'reception' && type === 'staff_overrun' && bookingId === 'bk_1',
    )

    const res = await POST(jobRequest())

    expect(await res.json()).toEqual({ success: true, flagged: 0, heldUp: 1, notified: 1 })
    expect(notifications().map((n) => n.userId)).toEqual(['manager'])
  })

  it('does nothing when no booking is held up', async () => {
    dbMocks.flagStaffOverruns.mockResolvedValue([])
    dbMocks.getLiveStaffOverruns.mockResolvedValue([])

    const res = await POST(jobRequest())

    expect(await res.json()).toEqual({ success: true, flagged: 0, heldUp: 0, notified: 0 })
    expect(dbMocks.getStaffAvailability).not.toHaveBeenCalled()
    expect(dbMocks.createNotification).not.toHaveBeenCalled()
    expect(heartbeatMock).toHaveBeenCalledWith('STAFF_OVERRUN')
  })

  it('refuses an unsigned request when signing keys are set, writing nothing', async () => {
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'sig_current')
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'sig_next')

    const res = await POST(jobRequest())

    expect(res.status).toBe(401)
    expect(dbMocks.flagStaffOverruns).not.toHaveBeenCalled()
    expect(heartbeatMock).not.toHaveBeenCalled()
  })

  it('fails with 500 for a QStash retry, without the heartbeat', async () => {
    dbMocks.flagStaffOverruns.mockRejectedValue(new Error('db down'))

    const res = await POST(jobRequest())

    expect(res.status).toBe(500)
    expect(heartbeatMock).not.toHaveBeenCalled()
  })
})
