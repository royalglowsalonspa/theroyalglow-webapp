// @vitest-environment node
/************************************************************
 * Module Name  : me/schedule/route.test
 * Scope        : GET /api/me/schedule — the caller's own week (multi-branch R5.10)
 *
 * Description  : The caller's schedule names the branch each working day is
 *                at, from the caller's own branches only, and never returns
 *                the raw branch id of a day.
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  loadBranchAccess: vi.fn(),
  getStaffProfileByUserId: vi.fn(),
  getStaffSchedule: vi.fn(),
}))

vi.mock('@/lib/api/session', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/api/branch-context', () => ({ loadBranchAccess: mocks.loadBranchAccess }))
vi.mock('@rgss/db/queries', () => ({
  getStaffProfileByUserId: mocks.getStaffProfileByUserId,
  getStaffSchedule: mocks.getStaffSchedule,
}))

import { GET } from '@/app/api/me/schedule/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireRole.mockResolvedValue({ user: { id: 'u_mgr', role: 'manager' } })
  mocks.getStaffProfileByUserId.mockResolvedValue({ id: 'st_mgr' })
  mocks.loadBranchAccess.mockResolvedValue({
    userId: 'u_mgr',
    role: 'manager',
    branches: [
      { id: 'rs', name: 'Rayasandra' },
      { id: 'mh', name: 'Marathahalli' },
    ],
  })
})

describe('GET /api/me/schedule', () => {
  it('names the branch of each working day, and only the caller’s branches', async () => {
    mocks.getStaffSchedule.mockResolvedValue([
      {
        id: 's1',
        dayOfWeek: 1,
        isWorking: true,
        startTime: '10:00:00',
        endTime: '18:00:00',
        branchId: 'rs',
      },
      {
        id: 's2',
        dayOfWeek: 2,
        isWorking: true,
        startTime: '10:00:00',
        endTime: '18:00:00',
        branchId: 'mh',
      },
      { id: 's3', dayOfWeek: 3, isWorking: false, startTime: null, endTime: null, branchId: null },
      // A row left at a branch they no longer work at is not named.
      {
        id: 's4',
        dayOfWeek: 4,
        isWorking: true,
        startTime: '10:00:00',
        endTime: '18:00:00',
        branchId: 'kr',
      },
    ])

    const res = await GET(new Request('https://admin.theroyalglow.in/api/me/schedule'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mocks.requireRole).toHaveBeenCalledWith('staff')
    expect(body.data.schedule.map((d: { branchName: string | null }) => d.branchName)).toEqual([
      'Rayasandra',
      'Marathahalli',
      null,
      null,
    ])
    for (const day of body.data.schedule) {
      expect(day).not.toHaveProperty('branchId')
    }
  })

  it('answers 404 for an account with no staff profile', async () => {
    mocks.getStaffProfileByUserId.mockResolvedValue(null)

    const res = await GET(new Request('https://admin.theroyalglow.in/api/me/schedule'))

    expect(res.status).toBe(404)
    expect(mocks.getStaffSchedule).not.toHaveBeenCalled()
  })
})
