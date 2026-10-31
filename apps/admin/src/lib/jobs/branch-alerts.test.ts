// @vitest-environment node
/************************************************************
 * Module Name  : jobs/branch-alerts.test
 * Scope        : Background Jobs — alerts to a branch's front desk (R7.4)
 *
 * Description  : A booking alert reaches only its own branch's Receptionist
 *                and Manager (or the Owner without a Manager), names the
 *                branch, and never repeats for someone already told about
 *                that booking. DB and dispatch seams are mocked.
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  getBranchPeople: vi.fn(),
  hasNotification: vi.fn(),
  createNotification: vi.fn(),
}))
const dispatchMock = vi.hoisted(() => vi.fn())

vi.mock('@rgss/db/queries', () => dbMocks)
vi.mock('@/lib/notifications/dispatch', () => ({ dispatchNotification: dispatchMock }))

import { alertBranchFrontDesk } from './branch-alerts'

const OWNER = { userId: 'owner', name: 'Owner', email: 'owner@x.test' }
const MANAGER = { userId: 'manager', name: 'Manager', email: 'manager@x.test' }
const RECEPTION = { userId: 'reception', name: 'Reception', email: 'reception@x.test' }

function branch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'branch_rs',
    name: 'Rayasandra',
    owner: OWNER,
    manager: MANAGER,
    receptionist: RECEPTION,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  dbMocks.hasNotification.mockResolvedValue(false)
  dbMocks.createNotification.mockImplementation(async (p: { userId: string }) => ({
    id: `n_${p.userId}`,
    channel: 'push',
  }))
})

describe('alertBranchFrontDesk', () => {
  it('tells the branch Receptionist and Manager, naming the branch', async () => {
    dbMocks.getBranchPeople.mockResolvedValue({ branches: [branch()], developer: OWNER })

    const result = await alertBranchFrontDesk({
      branchId: 'branch_rs',
      bookingId: 'bk_1',
      type: 'stale_pending_booking',
      data: { date: '25/10/2026' },
    })

    expect(result).toEqual({ notified: 2, recipients: 2 })
    expect(dbMocks.getBranchPeople).toHaveBeenCalledWith(['branch_rs'])
    const told = dbMocks.createNotification.mock.calls.map(([p]) => p.userId)
    expect(told).toEqual(['reception', 'manager'])
    const [first] = dbMocks.createNotification.mock.calls[0] ?? []
    expect(first).toMatchObject({ type: 'stale_pending_booking', bookingId: 'bk_1' })
    expect(first.body).toContain('at Rayasandra')
    expect(dispatchMock).toHaveBeenCalledTimes(2)
  })

  it('puts the Owner in for a branch without a Manager', async () => {
    dbMocks.getBranchPeople.mockResolvedValue({
      branches: [
        branch({ id: 'branch_mh', name: 'Marathahalli', manager: null, receptionist: null }),
      ],
      developer: null,
    })

    const result = await alertBranchFrontDesk({
      branchId: 'branch_mh',
      bookingId: 'bk_2',
      type: 'no_show_check',
      data: { date: '25/10/2026' },
    })

    expect(result.notified).toBe(1)
    expect(dbMocks.createNotification.mock.calls.map(([p]) => p.userId)).toEqual(['owner'])
  })

  it('skips anyone already told about this booking (a retry after a partial fan-out)', async () => {
    dbMocks.getBranchPeople.mockResolvedValue({ branches: [branch()], developer: null })
    dbMocks.hasNotification.mockImplementation(
      async (userId: string, type: string, bookingId: string) =>
        userId === 'reception' && type === 'no_show_check' && bookingId === 'bk_3',
    )

    const result = await alertBranchFrontDesk({
      branchId: 'branch_rs',
      bookingId: 'bk_3',
      type: 'no_show_check',
      data: {},
    })

    expect(result).toEqual({ notified: 1, recipients: 2 })
    expect(dbMocks.createNotification.mock.calls.map(([p]) => p.userId)).toEqual(['manager'])
  })

  it('tells nobody when the branch is unknown', async () => {
    dbMocks.getBranchPeople.mockResolvedValue({ branches: [], developer: OWNER })

    const result = await alertBranchFrontDesk({
      branchId: 'gone',
      bookingId: 'bk_4',
      type: 'stale_pending_booking',
      data: {},
    })

    expect(result).toEqual({ notified: 0, recipients: 0 })
    expect(dbMocks.createNotification).not.toHaveBeenCalled()
  })
})
