// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : waitlist-routes.test
 * Scope        : Unit tests for the admin Waitlist API routes
 *
 * Description  : Verifies GET /api/waitlist (list + pagination meta + status
 *                filter) and PATCH /api/waitlist/[id] (valid transition,
 *                illegal transition rejected, 404 missing), plus the guard
 *                (401 unauthenticated / 403 forbidden) and the response
 *                envelope. Both work on the active branch only: another
 *                branch's entry is not found, and a transition rendered for
 *                another branch is refused with 409 (multi-branch R2.3, R2.4).
 *
 * Approach     : requireBranchRole and the DB are mocked; assertRenderedBranch
 *                and the state machine stay real. No live session/DB.
 *
 * Layer        : Testing
 *
 * Notes        : Node environment (server route handlers). Receptionist+.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

const mocks = vi.hoisted(() => ({ requireBranchRole: vi.fn() }))

const dbMocks = vi.hoisted(() => ({
  getWaitlist: vi.fn(),
  getWaitlistEntryById: vi.fn(),
  updateWaitlistStatus: vi.fn(),
  recordAudit: vi.fn(),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: mocks.requireBranchRole }
})
vi.mock('@rgss/db/queries', () => dbMocks)

import * as waitlistIdRoute from '@/app/api/waitlist/[id]/route'
import * as waitlistRoute from '@/app/api/waitlist/route'

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

const patch = (id: string, body: Record<string, unknown>, branchId: string = TEST_BRANCH.id) =>
  waitlistIdRoute.PATCH(
    new Request(`https://admin.theroyalglow.in/api/waitlist/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ branchId, ...body }),
    }),
    { params: Promise.resolve({ id }) },
  )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_admin' }))
})

describe('GET /api/waitlist', () => {
  it('returns the active branch’s entries with pagination meta', async () => {
    dbMocks.getWaitlist.mockResolvedValue({
      rows: [{ id: 'w1', status: 'waiting', customerName: 'Asha' }],
      totalCount: 1,
    })

    const res = await waitlistRoute.GET(new Request('https://admin.theroyalglow.in/api/waitlist'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual({
      branchId: TEST_BRANCH.id,
      entries: [{ id: 'w1', status: 'waiting', customerName: 'Asha' }],
    })
    expect(body.meta).toMatchObject({ page: 1, totalPages: 1, totalCount: 1 })
    expect(mocks.requireBranchRole).toHaveBeenCalledWith('receptionist')
  })

  it('forwards the branch, status + pagination filters to the query', async () => {
    dbMocks.getWaitlist.mockResolvedValue({ rows: [], totalCount: 0 })

    await waitlistRoute.GET(
      new Request('https://admin.theroyalglow.in/api/waitlist?status=notified&page=2&pageSize=10'),
    )

    expect(dbMocks.getWaitlist).toHaveBeenCalledWith(
      TEST_BRANCH.id,
      expect.objectContaining({ status: 'notified', page: 2, pageSize: 10 }),
    )
  })

  it('rejects an invalid status with the 400 envelope', async () => {
    const res = await waitlistRoute.GET(
      new Request('https://admin.theroyalglow.in/api/waitlist?status=banana'),
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 })
    expect(dbMocks.getWaitlist).not.toHaveBeenCalled()
  })

  it('→ 401 when unauthenticated', async () => {
    mocks.requireBranchRole.mockRejectedValue(unauthenticated())
    const res = await waitlistRoute.GET(new Request('https://admin.theroyalglow.in/api/waitlist'))
    expect(res.status).toBe(401)
    expect(dbMocks.getWaitlist).not.toHaveBeenCalled()
  })

  it('→ 403 when role is insufficient', async () => {
    mocks.requireBranchRole.mockRejectedValue(forbidden())
    const res = await waitlistRoute.GET(new Request('https://admin.theroyalglow.in/api/waitlist'))
    expect(res.status).toBe(403)
  })

  it('exports GET only', () => {
    expect(typeof waitlistRoute.GET).toBe('function')
    expect((waitlistRoute as Record<string, unknown>).POST).toBeUndefined()
  })
})

describe('PATCH /api/waitlist/[id]', () => {
  it('applies a valid transition (waiting → notified) and audits it for the branch', async () => {
    dbMocks.getWaitlistEntryById.mockResolvedValue({ id: 'w1', status: 'waiting' })
    dbMocks.updateWaitlistStatus.mockResolvedValue({ id: 'w1', status: 'notified' })

    const res = await patch('w1', { status: 'notified' })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, data: { entry: { id: 'w1', status: 'notified' } } })
    expect(dbMocks.getWaitlistEntryById).toHaveBeenCalledWith('w1', TEST_BRANCH.id)
    expect(dbMocks.updateWaitlistStatus).toHaveBeenCalledWith('w1', TEST_BRANCH.id, 'notified')
    expect(dbMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u_admin',
        entityType: 'waitlist',
        entityId: 'w1',
        branchId: TEST_BRANCH.id,
      }),
    )
  })

  it('rejects an illegal transition (waiting → booked) with the 409 envelope', async () => {
    dbMocks.getWaitlistEntryById.mockResolvedValue({ id: 'w1', status: 'waiting' })

    const res = await patch('w1', { status: 'booked' })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toMatchObject({ code: ERROR_CODES.CONFLICT, statusCode: 409 })
    expect(dbMocks.updateWaitlistStatus).not.toHaveBeenCalled()
  })

  it('returns the 404 envelope when the branch has no such entry', async () => {
    // A missing entry and one at another branch read the same (R2.3).
    dbMocks.getWaitlistEntryById.mockResolvedValue(null)

    const res = await patch('missing', { status: 'notified' })
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toMatchObject({ code: ERROR_CODES.NOT_FOUND, statusCode: 404 })
    expect(dbMocks.updateWaitlistStatus).not.toHaveBeenCalled()
  })

  it('refuses a transition rendered for another branch with 409, before reading', async () => {
    const res = await patch('w1', { status: 'notified' }, OTHER_BRANCH.id)
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error.code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(dbMocks.getWaitlistEntryById).not.toHaveBeenCalled()
    expect(dbMocks.updateWaitlistStatus).not.toHaveBeenCalled()
  })

  it('rejects an invalid status payload with the 400 envelope', async () => {
    const res = await patch('w1', { status: 'banana' })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 })
    expect(dbMocks.getWaitlistEntryById).not.toHaveBeenCalled()
  })

  it('→ 403 when role is insufficient', async () => {
    mocks.requireBranchRole.mockRejectedValue(forbidden())
    const res = await patch('w1', { status: 'notified' })
    expect(res.status).toBe(403)
    expect(dbMocks.getWaitlistEntryById).not.toHaveBeenCalled()
  })
})
