// @vitest-environment node
/************************************************************
 * Module Name  : bookings/unoffered-service-bookings.test
 * Scope        : Page loaders — dashboard list of bookings with a service the
 *                branch no longer offers (multi-branch R4.4)
 *
 * Description  : The dashboard lists the active branch's bookings with a
 *                service it no longer offers, at most
 *                UNOFFERED_SERVICE_BOOKINGS_LIMIT with the total, hides when
 *                there are none or the viewer can't open the dashboard, and
 *                never breaks the dashboard when its read fails.
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

const pageMock = vi.hoisted(() => vi.fn())
const dbMocks = vi.hoisted(() => ({ getBookingsWithServicesNotOffered: vi.fn() }))

vi.mock('@/lib/api/branch-page', () => ({ branchForPage: pageMock }))
vi.mock('@rgss/db/queries', () => dbMocks)

import {
  UNOFFERED_SERVICE_BOOKINGS_LIMIT,
  unofferedServiceBookings,
} from './unoffered-service-bookings'

const ACCESS = {
  ok: true,
  branch: {
    id: 'branch_mh',
    name: 'Marathahalli',
    code: 'MH',
    status: 'operational',
    isPrimary: false,
    role: 'receptionist',
  },
}

const row = (n: number) => ({
  id: `bk_${n}`,
  bookingNumber: `BK-MH-2611-S-${10_000 + n}`,
  date: '2026-11-12',
  startTime: '15:00',
  status: 'pending',
  customerName: `Customer ${n}`,
  services: ['Hot Stone 90'],
})

beforeEach(() => {
  vi.clearAllMocks()
  pageMock.mockResolvedValue(ACCESS)
})

describe('unofferedServiceBookings', () => {
  it('lists the active branch’s bookings with a service it no longer offers', async () => {
    dbMocks.getBookingsWithServicesNotOffered.mockResolvedValue([row(1)])

    expect(await unofferedServiceBookings()).toEqual({
      branchName: 'Marathahalli',
      total: 1,
      items: [
        {
          bookingId: 'bk_1',
          bookingNumber: 'BK-MH-2611-S-10001',
          date: '2026-11-12',
          startTime: '15:00',
          customerName: 'Customer 1',
          services: ['Hot Stone 90'],
        },
      ],
    })
    expect(pageMock).toHaveBeenCalledWith('receptionist')
    expect(dbMocks.getBookingsWithServicesNotOffered).toHaveBeenCalledWith('branch_mh')
  })

  it('lists the first few and counts the rest', async () => {
    const rows = Array.from({ length: UNOFFERED_SERVICE_BOOKINGS_LIMIT + 2 }, (_, i) => row(i + 1))
    dbMocks.getBookingsWithServicesNotOffered.mockResolvedValue(rows)

    const list = await unofferedServiceBookings()

    expect(list?.total).toBe(UNOFFERED_SERVICE_BOOKINGS_LIMIT + 2)
    expect(list?.items).toHaveLength(UNOFFERED_SERVICE_BOOKINGS_LIMIT)
  })

  it('hides when none, for someone who can’t open the dashboard, and when the read fails', async () => {
    dbMocks.getBookingsWithServicesNotOffered.mockResolvedValue([])
    expect(await unofferedServiceBookings()).toBeNull()

    pageMock.mockResolvedValue({ ok: false, message: 'No branch' })
    expect(await unofferedServiceBookings()).toBeNull()

    pageMock.mockResolvedValue(ACCESS)
    dbMocks.getBookingsWithServicesNotOffered.mockRejectedValue(new Error('connection reset'))
    expect(await unofferedServiceBookings()).toBeNull()
  })
})
