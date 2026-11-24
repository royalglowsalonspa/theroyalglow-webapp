// @vitest-environment node
/************************************************************
 * Module Name  : bookings/closed-day-bookings.test
 * Scope        : Page loaders — dashboard list of bookings on closed days
 *                (multi-branch R1.8, MS-09)
 *
 * Description  : The dashboard lists the active branch's bookings on days it
 *                is now closed, at most CLOSED_DAY_BOOKINGS_LIMIT with the
 *                total, hides when there are none or the viewer can't open
 *                the dashboard, and never breaks the dashboard when its read
 *                fails.
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

const pageMock = vi.hoisted(() => vi.fn())
const dbMocks = vi.hoisted(() => ({ getBookingsOnClosedDays: vi.fn() }))

vi.mock('@/lib/api/branch-page', () => ({ branchForPage: pageMock }))
vi.mock('@rgss/db/queries', () => dbMocks)

import { CLOSED_DAY_BOOKINGS_LIMIT, closedDayBookings } from './closed-day-bookings'

const ACCESS = {
  ok: true,
  branch: {
    id: 'branch_rs',
    name: 'Rayasandra',
    code: 'RS',
    status: 'operational',
    isPrimary: true,
    role: 'receptionist',
  },
}

const row = (n: number) => ({
  id: `bk_${n}`,
  bookingNumber: `BK-RS-2611-H-${10_000 + n}`,
  date: '2026-11-08',
  startTime: '11:00',
  status: 'confirmed',
  customerName: `Customer ${n}`,
  closureName: 'Diwali',
})

beforeEach(() => {
  vi.clearAllMocks()
  pageMock.mockResolvedValue(ACCESS)
})

describe('closedDayBookings', () => {
  it('lists the active branch’s bookings on closed days', async () => {
    dbMocks.getBookingsOnClosedDays.mockResolvedValue([row(1), row(2)])

    expect(await closedDayBookings()).toEqual({
      total: 2,
      items: [
        {
          bookingId: 'bk_1',
          bookingNumber: 'BK-RS-2611-H-10001',
          date: '2026-11-08',
          startTime: '11:00',
          customerName: 'Customer 1',
          closureName: 'Diwali',
        },
        {
          bookingId: 'bk_2',
          bookingNumber: 'BK-RS-2611-H-10002',
          date: '2026-11-08',
          startTime: '11:00',
          customerName: 'Customer 2',
          closureName: 'Diwali',
        },
      ],
    })
    expect(pageMock).toHaveBeenCalledWith('receptionist')
    expect(dbMocks.getBookingsOnClosedDays).toHaveBeenCalledWith('branch_rs')
  })

  it('lists the first few and counts the rest', async () => {
    const rows = Array.from({ length: CLOSED_DAY_BOOKINGS_LIMIT + 3 }, (_, i) => row(i + 1))
    dbMocks.getBookingsOnClosedDays.mockResolvedValue(rows)

    const list = await closedDayBookings()

    expect(list?.total).toBe(CLOSED_DAY_BOOKINGS_LIMIT + 3)
    expect(list?.items.map((item) => item.bookingId)).toEqual(
      rows.slice(0, CLOSED_DAY_BOOKINGS_LIMIT).map((r) => r.id),
    )
  })

  it('hides when no booking is on a closed day', async () => {
    dbMocks.getBookingsOnClosedDays.mockResolvedValue([])

    expect(await closedDayBookings()).toBeNull()
  })

  it('hides for someone who cannot open the dashboard at any branch', async () => {
    pageMock.mockResolvedValue({ ok: false, message: 'No branch' })

    expect(await closedDayBookings()).toBeNull()
    expect(dbMocks.getBookingsOnClosedDays).not.toHaveBeenCalled()
  })

  it('hides instead of breaking the dashboard when the read fails', async () => {
    dbMocks.getBookingsOnClosedDays.mockRejectedValue(new Error('connection reset'))

    expect(await closedDayBookings()).toBeNull()
  })
})
