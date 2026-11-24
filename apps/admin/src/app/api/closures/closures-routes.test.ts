// @vitest-environment node
/************************************************************
 * Module Name  : closures-routes.test
 * Scope        : Unit tests — branch closures (multi-branch R1.8, R2.3, R2.4)
 *
 * Description  : GET|POST /api/closures and DELETE /api/closures/[id]:
 *                - the branch's Manager, Owner and the Developer maintain its
 *                  closures; only the Developer closes every branch;
 *                - another branch's closure reads as not found;
 *                - a request closes one day or a range, never the past;
 *                - bookings left on a newly closed day are reported, not
 *                  cancelled;
 *                - writes rendered for another branch get 409.
 *
 * Approach     : requireBranchRole, the db queries and the audit helper are
 *                mocked; assertRenderedBranch, the business rules and the Zod
 *                schemas stay real. The clock is pinned to 29/10/2026 IST.
 ************************************************************/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

const mocks = vi.hoisted(() => ({
  requireBranchRole: vi.fn(),
  audit: vi.fn(),
}))

const dbMocks = vi.hoisted(() => ({
  getBranchClosures: vi.fn(),
  createClosures: vi.fn(),
  getActiveBookingsOnDates: vi.fn(),
  getClosureById: vi.fn(),
  deleteClosure: vi.fn(),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: mocks.requireBranchRole }
})
vi.mock('@/lib/api/audit', () => ({ audit: mocks.audit }))
vi.mock('@rgss/db/queries', () => dbMocks)

import * as closureIdRoute from '@/app/api/closures/[id]/route'
import * as closuresRoute from '@/app/api/closures/route'

const BASE = 'https://admin.theroyalglow.in/api/closures'

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'cl_1',
  branchId: TEST_BRANCH.id,
  date: '2026-11-08',
  name: 'Diwali',
  createdAt: new Date('2026-10-29T06:00:00.000Z'),
  ...overrides,
})

const post = (body: Record<string, unknown>) =>
  closuresRoute.POST(
    new Request(BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

const remove = (id: string, branchId: string = TEST_BRANCH.id) =>
  closureIdRoute.DELETE(new Request(`${BASE}/${id}?branchId=${branchId}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  })

function actAs(role: 'receptionist' | 'manager' | 'owner' | 'developer') {
  mocks.requireBranchRole.mockResolvedValue(branchContext({ userId: `u_${role}`, role }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  // 11:30 IST on 29/10/2026.
  vi.setSystemTime(new Date('2026-10-29T06:00:00.000Z'))
  actAs('manager')
  dbMocks.getActiveBookingsOnDates.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/closures', () => {
  it("lists the branch's closures from today, and what a Manager may remove", async () => {
    dbMocks.getBranchClosures.mockResolvedValue([
      row({ id: 'cl_all', branchId: null, name: 'Republic Day', date: '2027-01-26' }),
      row(),
    ])

    const res = await closuresRoute.GET(new Request(BASE))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mocks.requireBranchRole).toHaveBeenCalledWith('manager')
    expect(dbMocks.getBranchClosures).toHaveBeenCalledWith(TEST_BRANCH.id, '2026-10-29', undefined)
    expect(body.data).toEqual({
      branchId: TEST_BRANCH.id,
      canCloseAllBranches: false,
      closures: [
        {
          id: 'cl_all',
          date: '2027-01-26',
          name: 'Republic Day',
          allBranches: true,
          canRemove: false,
        },
        { id: 'cl_1', date: '2026-11-08', name: 'Diwali', allBranches: false, canRemove: true },
      ],
    })
  })

  it('lets the Developer remove every closure and close every branch', async () => {
    actAs('developer')
    dbMocks.getBranchClosures.mockResolvedValue([row({ id: 'cl_all', branchId: null })])

    const body = await (await closuresRoute.GET(new Request(BASE))).json()

    expect(body.data.canCloseAllBranches).toBe(true)
    expect(body.data.closures[0].canRemove).toBe(true)
  })

  it('takes an explicit range and rejects a bad date', async () => {
    dbMocks.getBranchClosures.mockResolvedValue([])
    await closuresRoute.GET(new Request(`${BASE}?from=2026-11-01&to=2026-11-30`))
    expect(dbMocks.getBranchClosures).toHaveBeenCalledWith(
      TEST_BRANCH.id,
      '2026-11-01',
      '2026-11-30',
    )

    const bad = await closuresRoute.GET(new Request(`${BASE}?from=2026-02-30`))
    expect(bad.status).toBe(400)
  })
})

describe('POST /api/closures', () => {
  it('closes the active branch on every day of a range and reports bookings left to move', async () => {
    dbMocks.createClosures.mockResolvedValue({
      created: [row({ id: 'c1', date: '2026-11-08' }), row({ id: 'c2', date: '2026-11-09' })],
      alreadyClosed: ['2026-11-10'],
    })
    const affected = [
      {
        id: 'bk_1',
        bookingNumber: 'BK-RS-2611-H-12345',
        branchName: 'Rayasandra',
        date: '2026-11-09',
        startTime: '11:00',
        status: 'confirmed',
        customerName: 'Priya',
      },
    ]
    dbMocks.getActiveBookingsOnDates.mockResolvedValue(affected)

    const res = await post({
      branchId: TEST_BRANCH.id,
      date: '2026-11-08',
      endDate: '2026-11-10',
      name: ' Diwali ',
    })
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(dbMocks.createClosures).toHaveBeenCalledWith({
      branchId: TEST_BRANCH.id,
      dates: ['2026-11-08', '2026-11-09', '2026-11-10'],
      name: 'Diwali',
    })
    expect(dbMocks.getActiveBookingsOnDates).toHaveBeenCalledWith(
      ['2026-11-08', '2026-11-09'],
      TEST_BRANCH.id,
    )
    expect(body.data.alreadyClosed).toEqual(['2026-11-10'])
    expect(body.data.affectedBookings).toEqual(affected)
    expect(body.data.closures.map((c: { id: string }) => c.id)).toEqual(['c1', 'c2'])
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.any(Request),
      expect.anything(),
      expect.objectContaining({
        action: 'create',
        entityType: 'closure',
        entityId: 'c1',
        branchId: TEST_BRANCH.id,
      }),
    )
  })

  it('lets only the Developer close every branch', async () => {
    const asManager = await post({
      branchId: TEST_BRANCH.id,
      date: '2026-11-08',
      name: 'Diwali',
      allBranches: true,
    })
    expect(asManager.status).toBe(403)
    expect(dbMocks.createClosures).not.toHaveBeenCalled()

    actAs('developer')
    dbMocks.createClosures.mockResolvedValue({
      created: [row({ branchId: null })],
      alreadyClosed: [],
    })
    const asDeveloper = await post({
      branchId: TEST_BRANCH.id,
      date: '2026-11-08',
      name: 'Diwali',
      allBranches: true,
    })
    expect(asDeveloper.status).toBe(201)
    expect(dbMocks.createClosures).toHaveBeenCalledWith(expect.objectContaining({ branchId: null }))
    // The Developer sees the bookings left to move at every branch.
    expect(dbMocks.getActiveBookingsOnDates).toHaveBeenCalledWith(['2026-11-08'], null)
  })

  it('refuses a Receptionist even if the role check were bypassed', async () => {
    actAs('receptionist')
    const res = await post({ branchId: TEST_BRANCH.id, date: '2026-11-08', name: 'Diwali' })
    expect(res.status).toBe(403)
    expect(dbMocks.createClosures).not.toHaveBeenCalled()
  })

  it('refuses a form rendered for another branch (409)', async () => {
    const res = await post({ branchId: OTHER_BRANCH.id, date: '2026-11-08', name: 'Diwali' })
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.error.code).toBe('BRANCH_CONTEXT_CHANGED')
    expect(dbMocks.createClosures).not.toHaveBeenCalled()
  })

  it('refuses the past, a reversed range and a missing name', async () => {
    for (const body of [
      { branchId: TEST_BRANCH.id, date: '2026-10-28', name: 'Late' },
      { branchId: TEST_BRANCH.id, date: '2026-11-08', endDate: '2026-11-07', name: 'Back' },
      { branchId: TEST_BRANCH.id, date: '2026-11-08', name: '' },
    ]) {
      expect((await post(body)).status).toBe(400)
    }
    expect(dbMocks.createClosures).not.toHaveBeenCalled()
  })

  it('answers 200 without an audit entry when every day was already closed', async () => {
    dbMocks.createClosures.mockResolvedValue({ created: [], alreadyClosed: ['2026-11-08'] })

    const res = await post({ branchId: TEST_BRANCH.id, date: '2026-11-08', name: 'Diwali' })

    expect(res.status).toBe(200)
    expect((await res.json()).data.alreadyClosed).toEqual(['2026-11-08'])
    expect(mocks.audit).not.toHaveBeenCalled()
    expect(dbMocks.getActiveBookingsOnDates).toHaveBeenCalledWith([], TEST_BRANCH.id)
  })
})

describe('DELETE /api/closures/[id]', () => {
  it("reopens one of the branch's days, compare-and-delete, audited", async () => {
    dbMocks.getClosureById.mockResolvedValue(row())
    dbMocks.deleteClosure.mockResolvedValue(row())

    const res = await remove('cl_1')

    expect(res.status).toBe(200)
    expect(dbMocks.deleteClosure).toHaveBeenCalledWith({ id: 'cl_1', branchId: TEST_BRANCH.id })
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.any(Request),
      expect.anything(),
      expect.objectContaining({ action: 'delete', entityId: 'cl_1', branchId: TEST_BRANCH.id }),
    )
  })

  it("reads another branch's closure as not found", async () => {
    dbMocks.getClosureById.mockResolvedValue(row({ branchId: OTHER_BRANCH.id }))

    const res = await remove('cl_1')

    expect(res.status).toBe(404)
    expect(dbMocks.deleteClosure).not.toHaveBeenCalled()
  })

  it('lets only the Developer reopen a day closed for every branch', async () => {
    dbMocks.getClosureById.mockResolvedValue(row({ branchId: null }))

    expect((await remove('cl_1')).status).toBe(403)
    expect(dbMocks.deleteClosure).not.toHaveBeenCalled()

    actAs('developer')
    dbMocks.deleteClosure.mockResolvedValue(row({ branchId: null }))
    expect((await remove('cl_1')).status).toBe(200)
    expect(dbMocks.deleteClosure).toHaveBeenCalledWith({ id: 'cl_1', branchId: null })
  })

  it('answers 404 when the closure went meanwhile, or never existed', async () => {
    dbMocks.getClosureById.mockResolvedValue(row())
    dbMocks.deleteClosure.mockResolvedValue(null)
    expect((await remove('cl_1')).status).toBe(404)

    dbMocks.getClosureById.mockResolvedValue(null)
    expect((await remove('cl_gone')).status).toBe(404)
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('refuses a page rendered for another branch (409)', async () => {
    const res = await remove('cl_1', OTHER_BRANCH.id)
    expect(res.status).toBe(409)
    expect(dbMocks.getClosureById).not.toHaveBeenCalled()
  })
})
