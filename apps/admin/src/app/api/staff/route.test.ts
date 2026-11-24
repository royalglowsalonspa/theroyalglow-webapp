// @vitest-environment node
/************************************************************
 * Module Name  : staff route.test
 * Scope        : API — Staff at the active branch (multi-branch R1.11)
 *
 * Description  : GET /api/staff lists the active branch's staff for the
 *                pickers. Asked about a slot (membership-scheduling.md
 *                slice 2b), each person says why they can't take it: a
 *                booking at the active branch is asked about with its own
 *                date, times and kind, never another branch's booking (404);
 *                Record now asks about a slot starting now in IST. A mix of
 *                the two, or anything else, is a 400.
 *
 * Approach     : requireBranchRole and @rgss/db/queries are mocked;
 *                @rgss/business and @rgss/types stay REAL.
 ************************************************************/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, TEST_BRANCH } from '@/test/branch-context'

const branchMocks = vi.hoisted(() => ({ requireBranchRole: vi.fn() }))
const dbMocks = vi.hoisted(() => ({
  getActiveStaffAtBranch: vi.fn(),
  getBookingForAdmin: vi.fn(),
  getStaffAvailability: vi.fn(),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: branchMocks.requireBranchRole }
})
vi.mock('@/lib/api/branch-roles', () => ({ changeBranchRole: vi.fn() }))
vi.mock('@rgss/db/queries', () => dbMocks)

import { GET } from './route'

function get(query = '') {
  return GET(new Request(`https://admin.theroyalglow.in/api/staff${query}`))
}

async function dataOf(res: Response) {
  return ((await res.json()) as { data: { branchId: string; staff: unknown[] } }).data
}

const ASHA = {
  id: 'stf_asha',
  userId: 'u_asha',
  name: 'Asha',
  designation: 'therapist',
  performs: 0,
  busy: { reason: 'working', since: '10:15' },
}

beforeEach(() => {
  vi.clearAllMocks()
  branchMocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_rec' }))
  dbMocks.getActiveStaffAtBranch.mockResolvedValue([
    { id: 'stf_asha', userId: 'u_asha', name: 'Asha', designation: 'therapist' },
  ])
  dbMocks.getStaffAvailability.mockResolvedValue([ASHA])
  dbMocks.getBookingForAdmin.mockResolvedValue({
    id: 'bk_1',
    bookingDate: new Date('2026-10-31T00:00:00.000Z'),
    startTime: '11:00:00',
    endTime: '12:00:00',
    serviceType: 'spa',
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/staff', () => {
  it('lists the active branch’s staff, Receptionist and above', async () => {
    const res = await get()

    expect(res.status).toBe(200)
    expect(branchMocks.requireBranchRole).toHaveBeenCalledWith('receptionist')
    expect(dbMocks.getActiveStaffAtBranch).toHaveBeenCalledWith(TEST_BRANCH.id)
    expect(await dataOf(res)).toEqual({
      branchId: TEST_BRANCH.id,
      staff: [{ id: 'stf_asha', name: 'Asha', designation: 'therapist' }],
    })
    expect(dbMocks.getStaffAvailability).not.toHaveBeenCalled()
  })

  it('says who can’t take a booking’s own slot, and why', async () => {
    const res = await get('?booking=bk_1')

    expect(res.status).toBe(200)
    expect(dbMocks.getBookingForAdmin).toHaveBeenCalledWith('bk_1', TEST_BRANCH.id)
    expect(dbMocks.getStaffAvailability).toHaveBeenCalledWith({
      branchId: TEST_BRANCH.id,
      slot: {
        dateISO: '2026-10-31',
        startTime: '11:00:00',
        endTime: '12:00:00',
        kind: 'spa',
        excludeBookingId: 'bk_1',
      },
    })
    expect((await dataOf(res)).staff).toEqual([
      { id: 'stf_asha', name: 'Asha', designation: 'therapist', busy: ASHA.busy },
    ])
  })

  it('treats a booking at another branch as not found', async () => {
    dbMocks.getBookingForAdmin.mockResolvedValue(null)

    const res = await get('?booking=bk_elsewhere')

    expect(res.status).toBe(404)
    expect(dbMocks.getStaffAvailability).not.toHaveBeenCalled()
  })

  it('asks about a slot starting now, in IST, for Record now', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 23:40 IST on 31 October 2026: the slot runs past midnight.
    vi.setSystemTime(new Date('2026-10-31T18:10:00.000Z'))

    const res = await get('?minutes=45&kind=spa')

    expect(res.status).toBe(200)
    expect(dbMocks.getStaffAvailability).toHaveBeenCalledWith({
      branchId: TEST_BRANCH.id,
      slot: { dateISO: '2026-10-31', startTime: '23:40', endTime: '00:25', kind: 'spa' },
    })
  })

  it('asks about a slot at a date and start, for a session booked ahead', async () => {
    const res = await get('?minutes=90&kind=spa&date=2026-11-07&start=16:30')

    expect(res.status).toBe(200)
    expect(dbMocks.getStaffAvailability).toHaveBeenCalledWith({
      branchId: TEST_BRANCH.id,
      slot: { dateISO: '2026-11-07', startTime: '16:30', endTime: '18:00', kind: 'spa' },
    })
  })

  it.each([
    ['a booking and minutes together', '?booking=bk_1&minutes=30&kind=spa'],
    ['minutes without a kind', '?minutes=30'],
    ['a kind without minutes', '?kind=spa'],
    ['no minutes', '?minutes=0&kind=spa'],
    ['more than a day', '?minutes=1441&kind=spa'],
    ['an unknown kind', '?minutes=30&kind=nails'],
    ['an unknown parameter', '?branch=elsewhere'],
    ['a date without a start', '?minutes=30&kind=spa&date=2026-11-07'],
    ['a start without a date', '?minutes=30&kind=spa&start=16:30'],
    ['a date and start without minutes', '?date=2026-11-07&start=16:30'],
    ['a booking with a date', '?booking=bk_1&date=2026-11-07&start=16:30'],
    ['a malformed date', '?minutes=30&kind=spa&date=07/11/2026&start=16:30'],
  ])('refuses %s with 400, reading nothing', async (_case, query) => {
    const res = await get(query)

    expect(res.status).toBe(400)
    expect(dbMocks.getStaffAvailability).not.toHaveBeenCalled()
    expect(dbMocks.getActiveStaffAtBranch).not.toHaveBeenCalled()
  })
})
