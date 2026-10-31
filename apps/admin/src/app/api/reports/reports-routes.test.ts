// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : reports-routes.test
 * Scope        : Unit tests for the admin Reports API route
 *
 * Description  : Verifies GET /api/reports — the standard success envelope and
 *                combined payload shape, RBAC (401 unauthenticated / 403
 *                forbidden / Manager+ guard), range param forwarding to the
 *                query layer, the 400 envelope on invalid dates, and the
 *                settlement block (money for the Owner and the Developer,
 *                minutes and gems only for a Manager). Session + DB are
 *                mocked; no live session/DB.
 *
 * Layer        : Testing
 *
 * Notes        : Node environment (server route handler). Manager+.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, TEST_BRANCH } from '@/test/branch-context'

const mocks = vi.hoisted(() => ({ requireBranchRole: vi.fn() }))

const dbMocks = vi.hoisted(() => ({
  getRevenueSummary: vi.fn(),
  getRevenueTrend: vi.fn(),
  getBookingsByStatus: vi.fn(),
  getTopServices: vi.fn(),
  getBranchSettlementReport: vi.fn(),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: mocks.requireBranchRole }
})
vi.mock('@rgss/db/queries', () => dbMocks)

import * as reportsRoute from '@/app/api/reports/route'

const SUMMARY = {
  rangeRevenuePaise: 500000,
  invoiceCount: 4,
  bookingCount: 6,
  avgTicketPaise: 125000,
  todayRevenuePaise: 100000,
  mtdRevenuePaise: 500000,
}
const TREND = [{ date: '2026-06-01', revenuePaise: 100000 }]
const BY_STATUS = [{ status: 'completed', count: 4 }]
const TOP = [{ name: 'Hair Spa', bookings: 3, revenuePaise: 300000 }]
const SETTLEMENT = {
  memberships: {
    deliveredMinutes: 120,
    deliveredValuePaise: 250000,
    ownMembersMinutes: 60,
    ownMembersValuePaise: 125000,
    toReceivePaise: 250000,
    toPayPaise: 125000,
  },
  gems: { issued: 40, redeemed: 25, toReceivePaise: 1500, toPayPaise: 500 },
}

const unauthenticated = () =>
  new AppError({
    code: ERROR_CODES.UNAUTHENTICATED,
    message: 'You must be signed in.',
    statusCode: 401,
  })

const forbidden = () =>
  new AppError({
    code: ERROR_CODES.FORBIDDEN,
    message: 'You do not have permission to perform this action.',
    statusCode: 403,
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_manager', role: 'manager' }))
  dbMocks.getRevenueSummary.mockResolvedValue(SUMMARY)
  dbMocks.getRevenueTrend.mockResolvedValue(TREND)
  dbMocks.getBookingsByStatus.mockResolvedValue(BY_STATUS)
  dbMocks.getTopServices.mockResolvedValue(TOP)
  dbMocks.getBranchSettlementReport.mockResolvedValue(SETTLEMENT)
})

describe('GET /api/reports', () => {
  it('returns the combined payload in the success envelope', async () => {
    const res = await reportsRoute.GET(
      new Request('https://admin.theroyalglow.in/api/reports?range=30d'),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({
      summary: SUMMARY,
      revenueTrend: TREND,
      bookingsByStatus: BY_STATUS,
      topServices: TOP,
    })
    expect(body.data.range).toMatchObject({ from: expect.any(String), to: expect.any(String) })
  })

  it('enforces the Manager+ guard', async () => {
    await reportsRoute.GET(new Request('https://admin.theroyalglow.in/api/reports'))
    expect(mocks.requireBranchRole).toHaveBeenCalledWith('manager')
  })

  it('forwards the resolved range to every query', async () => {
    await reportsRoute.GET(new Request('https://admin.theroyalglow.in/api/reports?range=7d'))

    const expectedRange = { from: expect.any(String), to: expect.any(String) }
    // Every figure is the active branch's alone (multi-branch R2.3).
    for (const query of [
      dbMocks.getRevenueSummary,
      dbMocks.getRevenueTrend,
      dbMocks.getBookingsByStatus,
      dbMocks.getTopServices,
      dbMocks.getBranchSettlementReport,
    ]) {
      expect(query).toHaveBeenCalledWith(TEST_BRANCH.id, expect.objectContaining(expectedRange))
    }
  })

  it("shows the branch's Owner every settlement figure", async () => {
    mocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_owner', role: 'owner' }))
    const res = await reportsRoute.GET(new Request('https://admin.theroyalglow.in/api/reports'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.settlement).toEqual(SETTLEMENT)
  })

  it('shows the Developer every settlement figure', async () => {
    mocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_dev', role: 'developer' }))
    const res = await reportsRoute.GET(new Request('https://admin.theroyalglow.in/api/reports'))
    const body = await res.json()

    expect(body.data.settlement).toEqual(SETTLEMENT)
  })

  it('shows a Manager minutes and gems but no settlement money', async () => {
    const res = await reportsRoute.GET(new Request('https://admin.theroyalglow.in/api/reports'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.settlement).toEqual({
      memberships: {
        deliveredMinutes: 120,
        deliveredValuePaise: null,
        ownMembersMinutes: 60,
        ownMembersValuePaise: null,
        toReceivePaise: null,
        toPayPaise: null,
      },
      gems: { issued: 40, redeemed: 25, toReceivePaise: null, toPayPaise: null },
    })
  })

  it('forwards an explicit from/to range to the query layer', async () => {
    await reportsRoute.GET(
      new Request('https://admin.theroyalglow.in/api/reports?from=2026-06-01&to=2026-06-15'),
    )

    expect(dbMocks.getRevenueSummary).toHaveBeenCalledWith(TEST_BRANCH.id, {
      from: '2026-06-01',
      to: '2026-06-15',
    })
  })

  it('rejects an invalid date with the 400 envelope', async () => {
    const res = await reportsRoute.GET(
      new Request('https://admin.theroyalglow.in/api/reports?from=not-a-date&to=2026-06-15'),
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 })
    expect(dbMocks.getRevenueSummary).not.toHaveBeenCalled()
  })

  it('rejects a single-sided range (from without to) with 400', async () => {
    const res = await reportsRoute.GET(
      new Request('https://admin.theroyalglow.in/api/reports?from=2026-06-01'),
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 })
    expect(dbMocks.getRevenueSummary).not.toHaveBeenCalled()
  })

  it('→ 401 when unauthenticated', async () => {
    mocks.requireBranchRole.mockRejectedValue(unauthenticated())
    const res = await reportsRoute.GET(new Request('https://admin.theroyalglow.in/api/reports'))
    expect(res.status).toBe(401)
    expect(dbMocks.getRevenueSummary).not.toHaveBeenCalled()
  })

  it('→ 403 when role is insufficient', async () => {
    mocks.requireBranchRole.mockRejectedValue(forbidden())
    const res = await reportsRoute.GET(new Request('https://admin.theroyalglow.in/api/reports'))
    expect(res.status).toBe(403)
    expect(dbMocks.getRevenueSummary).not.toHaveBeenCalled()
  })

  it('exports GET only', () => {
    expect(typeof reportsRoute.GET).toBe('function')
    expect((reportsRoute as Record<string, unknown>).POST).toBeUndefined()
  })
})
