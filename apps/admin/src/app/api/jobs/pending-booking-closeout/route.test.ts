// @vitest-environment node
/************************************************************
 * Module Name  : pending-booking-closeout route.test
 * Scope        : API — Background Jobs
 *
 * Description  : The end-of-day closeout job must reject unverified requests
 *                before touching the database, close lapsed pending bookings
 *                through the status-guarded query, nudge realtime once per
 *                closed booking, and ping its heartbeat only on success.
 *                Also covers the slimmed stale-booking-alert (alert only) and
 *                the customer-stats reconcile job. DB, realtime, dispatch and
 *                heartbeat seams are mocked; the QStash verifier is REAL.
 ************************************************************/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  closeLapsedPendingBookings: vi.fn(),
  refreshCustomerStats: vi.fn(),
  getPendingBooking: vi.fn(),
  getBranchPeople: vi.fn(),
  hasNotification: vi.fn(),
  createNotification: vi.fn(),
  updateBookingStatus: vi.fn(),
}))
const publishMock = vi.hoisted(() => vi.fn())
const heartbeatMock = vi.hoisted(() => vi.fn())
const dispatchMock = vi.hoisted(() => vi.fn())

vi.mock('@rgss/db/queries', () => dbMocks)
vi.mock('@/lib/realtime/publish', () => ({ publishBookingEvent: publishMock }))
vi.mock('@/lib/jobs/heartbeat', () => ({ pingHeartbeat: heartbeatMock }))
vi.mock('@/lib/notifications/dispatch', () => ({ dispatchNotification: dispatchMock }))

import { POST as statsPOST } from '../customer-stats-reconcile/route'
import { POST as stalePOST } from '../stale-booking-alert/route'
import { POST as closeoutPOST } from './route'

function jobRequest(body = '{}'): Request {
  return new Request('https://admin.theroyalglow.in/api/jobs/x', { method: 'POST', body })
}

// Outside production with no signing keys / internal token, the real verifier
// allows local invocation (documented dev bypass).
function allowUnsignedDevRequests() {
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', undefined)
  vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', undefined)
  vi.stubEnv('INTERNAL_JOB_TOKEN', undefined)
}

// Production with nothing configured fails closed.
function rejectAllRequests() {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', undefined)
  vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', undefined)
  vi.stubEnv('INTERNAL_JOB_TOKEN', undefined)
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/jobs/pending-booking-closeout', () => {
  it('rejects an unverified request before any database work', async () => {
    rejectAllRequests()
    const res = await closeoutPOST(jobRequest())
    expect(res.status).toBe(401)
    expect(dbMocks.closeLapsedPendingBookings).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
    expect(heartbeatMock).not.toHaveBeenCalled()
  })

  it('closes lapsed bookings, publishes each as no_show, and pings the heartbeat', async () => {
    allowUnsignedDevRequests()
    dbMocks.closeLapsedPendingBookings.mockResolvedValue([
      { id: 'bk_1', bookingNumber: 'BK-RS-2610-H-11111', branchId: 'br_1', customerId: 'c_1' },
      { id: 'bk_2', bookingNumber: 'BK-RS-2610-S-22222', branchId: 'br_1', customerId: 'c_2' },
    ])

    const res = await closeoutPOST(jobRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, closed: 2 })
    expect(dbMocks.closeLapsedPendingBookings).toHaveBeenCalledOnce()
    expect(publishMock).toHaveBeenCalledTimes(2)
    expect(publishMock).toHaveBeenCalledWith({
      bookingId: 'bk_1',
      branchId: 'br_1',
      customerId: 'c_1',
      event: 'status_changed',
      data: { status: 'no_show' },
    })
    expect(heartbeatMock).toHaveBeenCalledWith('PENDING_CLOSEOUT')
  })

  it('succeeds quietly when nothing is lapsed', async () => {
    allowUnsignedDevRequests()
    dbMocks.closeLapsedPendingBookings.mockResolvedValue([])

    const res = await closeoutPOST(jobRequest())
    expect(await res.json()).toEqual({ success: true, closed: 0 })
    expect(publishMock).not.toHaveBeenCalled()
    expect(heartbeatMock).toHaveBeenCalledWith('PENDING_CLOSEOUT')
  })

  it('returns 500 (so QStash retries) and skips the heartbeat when the update fails', async () => {
    allowUnsignedDevRequests()
    dbMocks.closeLapsedPendingBookings.mockRejectedValue(new Error('connection reset'))

    const res = await closeoutPOST(jobRequest())
    expect(res.status).toBe(500)
    expect(heartbeatMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/jobs/customer-stats-reconcile', () => {
  it('rejects an unverified request before any database work', async () => {
    rejectAllRequests()
    const res = await statsPOST(jobRequest())
    expect(res.status).toBe(401)
    expect(dbMocks.refreshCustomerStats).not.toHaveBeenCalled()
  })

  it('recomputes every customer and reports how many changed', async () => {
    allowUnsignedDevRequests()
    dbMocks.refreshCustomerStats.mockResolvedValue(6)

    const res = await statsPOST(jobRequest())
    expect(await res.json()).toEqual({ success: true, changed: 6 })
    // No argument = every customer profile (the backfill + safety net).
    expect(dbMocks.refreshCustomerStats).toHaveBeenCalledWith()
    expect(heartbeatMock).toHaveBeenCalledWith('CUSTOMER_STATS')
  })

  it('returns 500 and skips the heartbeat on failure', async () => {
    allowUnsignedDevRequests()
    dbMocks.refreshCustomerStats.mockRejectedValue(new Error('timeout'))

    const res = await statsPOST(jobRequest())
    expect(res.status).toBe(500)
    expect(heartbeatMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/jobs/stale-booking-alert (alert only)', () => {
  it('alerts the branch front desk for a still-pending booking, even an old one, without changing its status', async () => {
    allowUnsignedDevRequests()
    dbMocks.getPendingBooking.mockResolvedValue({
      id: 'bk_old',
      status: 'pending',
      bookingDate: new Date('2026-10-21T00:00:00.000Z'),
      createdAt: new Date('2026-10-18T00:00:00.000Z'),
      customerId: 'c_1',
      branchId: 'br_1',
    })
    dbMocks.getBranchPeople.mockResolvedValue({
      branches: [
        {
          id: 'br_1',
          name: 'Rayasandra',
          owner: { userId: 'o_1', name: 'Owner', email: 'o@x.test' },
          manager: { userId: 'r_2', name: 'Manager', email: 'm@x.test' },
          receptionist: { userId: 'r_1', name: 'Reception', email: 'r@x.test' },
        },
      ],
      developer: null,
    })
    dbMocks.hasNotification.mockResolvedValue(false)
    dbMocks.createNotification.mockResolvedValue({ id: 'n_1', channel: 'push' })

    const res = await stalePOST(jobRequest(JSON.stringify({ bookingId: 'bk_old' })))
    expect(await res.json()).toEqual({ success: true, action: 'alerted', notified: 2 })
    expect(dbMocks.updateBookingStatus).not.toHaveBeenCalled()
    expect(dispatchMock).toHaveBeenCalledTimes(2)
  })

  it('does nothing once the booking has been actioned', async () => {
    allowUnsignedDevRequests()
    dbMocks.getPendingBooking.mockResolvedValue({ id: 'bk_1', status: 'confirmed' })

    const res = await stalePOST(jobRequest(JSON.stringify({ bookingId: 'bk_1' })))
    expect(await res.json()).toEqual({ success: true, action: 'none', notified: 0 })
    expect(dbMocks.createNotification).not.toHaveBeenCalled()
  })
})
