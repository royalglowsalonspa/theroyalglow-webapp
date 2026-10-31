// @vitest-environment node
/************************************************************
 * Module Name  : leave-schedule-routes.test
 * Scope        : Unit tests — leave and weekly schedules at the active branch
 *                (multi-branch R2.3, R2.4, R5.10)
 *
 * Description  : GET /api/leave, PATCH /api/leave/[id], GET|PUT /api/schedule:
 *                - the queue and the grid are the active branch's people;
 *                - nobody decides their own leave; a Manager's leave needs the
 *                  branch's Owner or the Developer;
 *                - two people deciding at once: the loser gets 409;
 *                - a shared Manager's day held by another branch shows as
 *                  "elsewhere" without hours or branch, and can't be claimed;
 *                - writes rendered for another branch get 409.
 *
 * Approach     : requireBranchRole, the db queries and notification dispatch
 *                are mocked; assertRenderedBranch, the business rules and the
 *                Zod schemas stay real.
 ************************************************************/

import { ERROR_CODES } from '@rgss/errors'
import { DEFAULT_BOOKING_RULES, DEFAULT_BUSINESS_HOURS } from '@rgss/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

const mocks = vi.hoisted(() => ({
  requireBranchRole: vi.fn(),
  dispatchNotification: vi.fn(),
}))

const dbMocks = vi.hoisted(() => ({
  getLeaveRequests: vi.fn(),
  getLeaveById: vi.fn(),
  updateLeaveStatus: vi.fn(),
  getBookingSummaries: vi.fn(),
  createNotification: vi.fn(),
  recordAudit: vi.fn(),
  getBranchClosures: vi.fn(async () => []),
  getWeeklyScheduleGrid: vi.fn(),
  getBranchSettingsForAdmin: vi.fn(),
  isStaffAtBranch: vi.fn(),
  getScheduleDays: vi.fn(),
  upsertStaffSchedule: vi.fn(),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: mocks.requireBranchRole }
})
vi.mock('@/lib/notifications/dispatch', () => ({
  dispatchNotification: mocks.dispatchNotification,
}))
vi.mock('@rgss/db/queries', () => dbMocks)

import * as leaveIdRoute from '@/app/api/leave/[id]/route'
import * as leaveRoute from '@/app/api/leave/route'
import * as scheduleRoute from '@/app/api/schedule/route'

const json = (url: string, method: string, body: unknown) =>
  new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const decide = (id: string, body: Record<string, unknown>) =>
  leaveIdRoute.PATCH(json(`https://admin.theroyalglow.in/api/leave/${id}`, 'PATCH', body), {
    params: Promise.resolve({ id }),
  })

const leaveRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'lv1',
  staffId: 'st_sty',
  staffName: 'Asha',
  staffUserId: 'u_sty',
  staffRoleWitness: 'staff',
  leaveType: 'casual',
  date: '2026-11-03',
  reason: null,
  approvalStatus: 'pending',
  rejectionReason: null,
  createdAt: '2026-10-29T00:00:00.000Z',
  ...overrides,
})

const fullWeek = (working: number[]) =>
  Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    isWorking: working.includes(dayOfWeek),
    startTime: working.includes(dayOfWeek) ? '10:00' : null,
    endTime: working.includes(dayOfWeek) ? '18:00' : null,
  }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireBranchRole.mockResolvedValue(
    branchContext({ userId: 'u_rec', role: 'receptionist' }),
  )
  dbMocks.createNotification.mockResolvedValue({ id: 'n1', channel: 'push' })
  dbMocks.getBookingSummaries.mockResolvedValue([])
  dbMocks.updateLeaveStatus.mockResolvedValue({
    leave: { id: 'lv1', approvalStatus: 'approved' },
    reassignedBookingIds: [],
  })
  // The active branch's own settings (R6.3), as the admin view reads them.
  dbMocks.getBranchSettingsForAdmin.mockResolvedValue({
    current: {
      branchId: TEST_BRANCH.id,
      branchName: TEST_BRANCH.name,
      revision: 3,
      savedAt: '2026-10-30T05:00:00.000Z',
      savedByName: 'Katabathuni Bose',
      businessHours: { ...DEFAULT_BUSINESS_HOURS, sun: { open: null, close: null, closed: true } },
      bookingRules: DEFAULT_BOOKING_RULES,
    },
    history: [],
  })
})

describe('GET /api/leave', () => {
  it('lists the branch’s leave and says which requests the actor may decide', async () => {
    dbMocks.getLeaveRequests.mockResolvedValue([
      leaveRow(),
      leaveRow({ id: 'lv2', staffUserId: 'u_rec', staffRoleWitness: 'receptionist' }),
      leaveRow({ id: 'lv3', staffUserId: 'u_mgr', staffRoleWitness: 'manager' }),
    ])

    const res = await leaveRoute.GET(new Request('https://admin.theroyalglow.in/api/leave'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(dbMocks.getLeaveRequests).toHaveBeenCalledWith(TEST_BRANCH.id, {})
    expect(body.data.branchId).toBe(TEST_BRANCH.id)
    const byId = Object.fromEntries(
      body.data.leave.map((r: { id: string; canDecide: boolean }) => [r.id, r.canDecide]),
    )
    expect(byId).toEqual({ lv1: true, lv2: false, lv3: false })
    // Internal identity fields stay on the server.
    expect(body.data.leave[0]).not.toHaveProperty('staffUserId')
  })
})

describe('PATCH /api/leave/[id]', () => {
  it('approves a Stylist’s leave and returns only this branch’s released bookings', async () => {
    dbMocks.getLeaveById.mockResolvedValue(leaveRow())
    // The approval took them off two confirmed bookings, one of them elsewhere.
    dbMocks.updateLeaveStatus.mockResolvedValue({
      leave: { id: 'lv1', approvalStatus: 'approved' },
      reassignedBookingIds: ['bk_here', 'bk_elsewhere'],
    })
    const here = {
      bookingId: 'bk_here',
      bookingNumber: 'BK-RS-2611-H-12345',
      startTime: '11:00',
      customerName: 'Kavya',
      serviceNames: ['Haircut'],
    }
    dbMocks.getBookingSummaries.mockResolvedValue([here])

    const res = await decide('lv1', { action: 'approve', branchId: TEST_BRANCH.id })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(dbMocks.getLeaveById).toHaveBeenCalledWith('lv1', TEST_BRANCH.id)
    expect(dbMocks.updateLeaveStatus).toHaveBeenCalledWith(
      'lv1',
      TEST_BRANCH.id,
      'approved',
      'u_rec',
      undefined,
    )
    // Summaries are read at this branch only; another branch's booking stays private.
    expect(dbMocks.getBookingSummaries).toHaveBeenCalledWith(
      ['bk_here', 'bk_elsewhere'],
      TEST_BRANCH.id,
    )
    expect(body.data).toEqual({
      leave: { id: 'lv1', approvalStatus: 'approved' },
      conflicts: [here],
    })
    expect(dbMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'staff_time_off', branchId: TEST_BRANCH.id }),
    )
  })

  it('refuses deciding your own leave', async () => {
    dbMocks.getLeaveById.mockResolvedValue(
      leaveRow({ staffUserId: 'u_rec', staffRoleWitness: 'receptionist' }),
    )

    const res = await decide('lv1', { action: 'approve', branchId: TEST_BRANCH.id })

    expect(res.status).toBe(403)
    expect(dbMocks.updateLeaveStatus).not.toHaveBeenCalled()
  })

  it('leaves a Manager’s leave to the Owner', async () => {
    dbMocks.getLeaveById.mockResolvedValue(
      leaveRow({ staffUserId: 'u_mgr', staffRoleWitness: 'manager' }),
    )

    const asReceptionist = await decide('lv1', { action: 'approve', branchId: TEST_BRANCH.id })
    expect(asReceptionist.status).toBe(403)

    mocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_own', role: 'owner' }))
    const asOwner = await decide('lv1', { action: 'approve', branchId: TEST_BRANCH.id })
    expect(asOwner.status).toBe(200)
    expect(dbMocks.updateLeaveStatus).toHaveBeenCalledOnce()
  })

  it('answers 409 when someone else decided it first', async () => {
    dbMocks.getLeaveById.mockResolvedValue(leaveRow())
    dbMocks.updateLeaveStatus.mockResolvedValue(null)

    const res = await decide('lv1', {
      action: 'reject',
      branchId: TEST_BRANCH.id,
      rejectionReason: 'Short-staffed',
    })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error.code).toBe(ERROR_CODES.LEAVE_ALREADY_DECIDED)
    expect(dbMocks.createNotification).not.toHaveBeenCalled()
  })

  it('treats leave of someone at another branch as not found', async () => {
    dbMocks.getLeaveById.mockResolvedValue(null)

    const res = await decide('lv1', { action: 'approve', branchId: TEST_BRANCH.id })

    expect(res.status).toBe(404)
  })

  it('refuses a decision made in another branch’s queue (409)', async () => {
    const res = await decide('lv1', { action: 'approve', branchId: OTHER_BRANCH.id })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error.code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(dbMocks.getLeaveById).not.toHaveBeenCalled()
  })
})

describe('GET /api/schedule', () => {
  it('shows a day another branch holds as elsewhere, without hours or branch', async () => {
    mocks.requireBranchRole.mockResolvedValue(branchContext({ role: 'manager' }))
    dbMocks.getWeeklyScheduleGrid.mockResolvedValue({
      dates: ['2026-11-01'],
      staff: [
        {
          staff: { id: 'st_mgr', userId: 'u_mgr', name: 'Manish' },
          schedule: [
            {
              id: 's1',
              staffId: 'st_mgr',
              dayOfWeek: 1,
              isWorking: true,
              startTime: '10:00:00',
              endTime: '18:00:00',
              branchId: TEST_BRANCH.id,
            },
            {
              id: 's2',
              staffId: 'st_mgr',
              dayOfWeek: 2,
              isWorking: true,
              startTime: '11:00:00',
              endTime: '19:00:00',
              branchId: OTHER_BRANCH.id,
            },
          ],
          leaveDates: [],
          bookingCountsByDate: {},
        },
      ],
    })

    const res = await scheduleRoute.GET(
      new Request('https://admin.theroyalglow.in/api/schedule?weekStart=2026-11-01'),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mocks.requireBranchRole).toHaveBeenCalledWith('manager')
    expect(dbMocks.getWeeklyScheduleGrid).toHaveBeenCalledWith(TEST_BRANCH.id, '2026-11-01')
    // Settings are Developer-only, so the grid carries the active branch's own
    // opening hours (R6.3): this branch is closed on Sundays.
    expect(dbMocks.getBranchSettingsForAdmin).toHaveBeenCalledWith(TEST_BRANCH.id, 1)
    expect(body.data.businessHours).toEqual({
      ...DEFAULT_BUSINESS_HOURS,
      sun: { open: null, close: null, closed: true },
    })
    const [here, there] = body.data.staff[0].schedule
    expect(here).toMatchObject({ dayOfWeek: 1, isWorking: true, elsewhere: false })
    expect(there).toMatchObject({
      dayOfWeek: 2,
      isWorking: false,
      startTime: null,
      elsewhere: true,
    })
    expect(JSON.stringify(body)).not.toContain(OTHER_BRANCH.id)
  })

  it("sends no hours when the branch's can't be read, rather than inventing them", async () => {
    dbMocks.getWeeklyScheduleGrid.mockResolvedValue({ dates: [], staff: [] })
    dbMocks.getBranchSettingsForAdmin.mockResolvedValue({
      current: {
        branchId: TEST_BRANCH.id,
        branchName: TEST_BRANCH.name,
        revision: 3,
        savedAt: '2026-10-30T05:00:00.000Z',
        savedByName: null,
        businessHours: null,
        bookingRules: DEFAULT_BOOKING_RULES,
      },
      history: [],
    })

    const res = await scheduleRoute.GET(
      new Request('https://admin.theroyalglow.in/api/schedule?weekStart=2026-11-01'),
    )

    expect(res.status).toBe(200)
    expect((await res.json()).data.businessHours).toBeNull()
  })
})

describe('PUT /api/schedule', () => {
  const put = (body: Record<string, unknown>) =>
    scheduleRoute.PUT(json('https://admin.theroyalglow.in/api/schedule', 'PUT', body))

  beforeEach(() => {
    mocks.requireBranchRole.mockResolvedValue(branchContext({ role: 'manager' }))
    dbMocks.isStaffAtBranch.mockResolvedValue(true)
    dbMocks.getScheduleDays.mockResolvedValue([])
    dbMocks.upsertStaffSchedule.mockResolvedValue({ ok: true, reassignedBookingIds: [] })
  })

  it('saves a week at the active branch, by the person saving it', async () => {
    const entries = fullWeek([1, 2, 3])

    const res = await put({ branchId: TEST_BRANCH.id, staffId: 'st_sty', entries })

    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ ok: true, reassignments: 0 })
    expect(dbMocks.isStaffAtBranch).toHaveBeenCalledWith('st_sty', TEST_BRANCH.id)
    // branchContext() acts as user_1.
    expect(dbMocks.upsertStaffSchedule).toHaveBeenCalledWith(
      'st_sty',
      TEST_BRANCH.id,
      entries,
      'user_1',
    )
  })

  it('says how many bookings the new week took the person off (MS-09)', async () => {
    dbMocks.upsertStaffSchedule.mockResolvedValue({
      ok: true,
      reassignedBookingIds: ['bk_1', 'bk_2'],
    })

    const res = await put({ branchId: TEST_BRANCH.id, staffId: 'st_sty', entries: fullWeek([1]) })

    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ ok: true, reassignments: 2 })
  })

  it('refuses claiming a day another branch holds, naming the day only', async () => {
    dbMocks.getScheduleDays.mockResolvedValue([
      { dayOfWeek: 2, isWorking: true, branchId: OTHER_BRANCH.id },
    ])

    const res = await put({
      branchId: TEST_BRANCH.id,
      staffId: 'st_mgr',
      entries: fullWeek([1, 2]),
    })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error.code).toBe(ERROR_CODES.SCHEDULE_DAY_ELSEWHERE)
    expect(body.error.message).toContain('Tuesday')
    expect(body.error.message).not.toContain(OTHER_BRANCH.name)
    expect(dbMocks.upsertStaffSchedule).not.toHaveBeenCalled()
  })

  it('lets a day off stand beside a day another branch holds', async () => {
    dbMocks.getScheduleDays.mockResolvedValue([
      { dayOfWeek: 2, isWorking: true, branchId: OTHER_BRANCH.id },
    ])

    const res = await put({ branchId: TEST_BRANCH.id, staffId: 'st_mgr', entries: fullWeek([1]) })

    expect(res.status).toBe(200)
  })

  it('answers 409 when the guarded write finds the week changed meanwhile', async () => {
    dbMocks.upsertStaffSchedule.mockResolvedValue({ ok: false, reason: 'stale' })

    const res = await put({ branchId: TEST_BRANCH.id, staffId: 'st_sty', entries: fullWeek([1]) })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error.code).toBe(ERROR_CODES.SCHEDULE_DAY_ELSEWHERE)
  })

  it('treats someone who does not work here as not found', async () => {
    dbMocks.isStaffAtBranch.mockResolvedValue(false)

    const res = await put({ branchId: TEST_BRANCH.id, staffId: 'st_far', entries: fullWeek([1]) })

    expect(res.status).toBe(404)
    expect(dbMocks.upsertStaffSchedule).not.toHaveBeenCalled()
  })

  it('refuses a week rendered for another branch (409)', async () => {
    const res = await put({ branchId: OTHER_BRANCH.id, staffId: 'st_sty', entries: fullWeek([1]) })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error.code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(dbMocks.isStaffAtBranch).not.toHaveBeenCalled()
  })
})
