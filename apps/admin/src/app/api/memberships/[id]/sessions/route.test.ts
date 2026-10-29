// @vitest-environment node
/************************************************************
 * Module Name  : memberships/[id]/sessions route.test
 * Scope        : API — Admin Membership
 *
 * Description  : POST /api/memberships/[id]/sessions must answer a retried
 *                request (same idempotency key) with the session it already
 *                recorded, before any balance check, and reject a key reused
 *                for a different session. When the guarded write finds the
 *                membership unavailable, the error says why, from a fresh read.
 *
 *                The session is performed at the active branch: a form
 *                rendered for another branch is refused, as are staff from
 *                another branch (multi-branch R2.3, R2.4, R9).
 *
 * Approach     : requireBranchRole and @rgss/db/queries are mocked.
 *                assertRenderedBranch and @rgss/business stay REAL, so the
 *                balance check and the replay comparison are the production
 *                rules.
 ************************************************************/

import { ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

const branchMocks = vi.hoisted(() => ({ requireBranchRole: vi.fn() }))
const dbMocks = vi.hoisted(() => ({
  getBranchByIdAdmin: vi.fn(),
  getMembershipById: vi.fn(),
  getMembershipSessionByKey: vi.fn(),
  getServicesByIds: vi.fn(),
  getStaffNamesByIds: vi.fn(),
  isStaffAtBranch: vi.fn(),
  recordMembershipSession: vi.fn(),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: branchMocks.requireBranchRole }
})
vi.mock('@rgss/db/queries', () => dbMocks)

import { POST } from './route'

const KEY = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const LINE = { serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' }
const IN_30_DAYS = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

function membership(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem_1',
    customerId: 'usr_1',
    status: 'active',
    expiresAt: IN_30_DAYS,
    totalHoursMinutes: 600,
    usedHoursMinutes: 0,
    ...overrides,
  }
}

const RECORDED = {
  booking: { id: 'bk_1' },
  invoice: { id: 'inv_1' },
  services: [LINE],
  remainingMinutes: 0,
}

function post(body: Record<string, unknown>) {
  return POST(
    new Request('https://admin.theroyalglow.in/api/memberships/mem_1/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ branchId: TEST_BRANCH.id, ...body }),
    }),
    { params: Promise.resolve({ id: 'mem_1' }) },
  )
}

async function errorOf(res: Response) {
  return ((await res.json()) as { error: { code: string; message: string } }).error
}

beforeEach(() => {
  vi.clearAllMocks()
  branchMocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_rec' }))
  dbMocks.getMembershipById.mockResolvedValue(membership())
  dbMocks.getMembershipSessionByKey.mockResolvedValue(null)
  dbMocks.getServicesByIds.mockResolvedValue([{ id: 'svc_aroma_60', name: 'Aroma 60' }])
  dbMocks.getStaffNamesByIds.mockResolvedValue([{ id: 'stf_1', name: 'Anita' }])
  dbMocks.getBranchByIdAdmin.mockResolvedValue({
    id: TEST_BRANCH.id,
    name: TEST_BRANCH.name,
    code: 'RS',
    number: 1,
    status: 'operational',
  })
  dbMocks.isStaffAtBranch.mockResolvedValue(true)
  dbMocks.recordMembershipSession.mockResolvedValue({
    ok: true,
    booking: { id: 'bk_2' },
    invoice: { id: 'inv_2' },
    remainingMinutes: 540,
  })
})

describe('POST /api/memberships/[id]/sessions', () => {
  it('records a new session and hands the key to the guarded write', async () => {
    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(201)
    expect(branchMocks.requireBranchRole).toHaveBeenCalledWith('receptionist')
    expect(dbMocks.getBranchByIdAdmin).toHaveBeenCalledWith(TEST_BRANCH.id)
    expect(dbMocks.isStaffAtBranch).toHaveBeenCalledWith('stf_1', TEST_BRANCH.id)
    expect((await res.json()).data).toEqual({
      booking: { id: 'bk_2' },
      invoice: { id: 'inv_2' },
      remainingMinutes: 540,
      duplicate: false,
    })
    const params = dbMocks.recordMembershipSession.mock.calls[0]?.[0]
    expect(params).toMatchObject({
      membershipId: 'mem_1',
      customerId: 'usr_1',
      branchId: TEST_BRANCH.id,
      idempotencyKey: KEY,
      services: [
        {
          serviceId: 'svc_aroma_60',
          staffId: 'stf_1',
          serviceNameSnapshot: 'Aroma 60',
          staffNameSnapshot: 'Anita',
          durationMinutes: 60,
        },
      ],
    })
    // The balance comes from the write itself, not from this request's read.
    expect(params).not.toHaveProperty('totalHoursMinutes')
    expect(params).not.toHaveProperty('usedHoursMinutes')
  })

  it('replays a retry before the balance check, even when the hours are spent', async () => {
    dbMocks.getMembershipById.mockResolvedValue(membership({ usedHoursMinutes: 600 }))
    dbMocks.getMembershipSessionByKey.mockResolvedValue(RECORDED)

    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(200)
    expect(dbMocks.getMembershipSessionByKey).toHaveBeenCalledWith('mem_1', KEY)
    expect((await res.json()).data).toEqual({
      booking: { id: 'bk_1' },
      invoice: { id: 'inv_1' },
      remainingMinutes: 0,
      duplicate: true,
    })
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('rejects a key reused for a different session, writing nothing', async () => {
    dbMocks.getMembershipSessionByKey.mockResolvedValue({
      ...RECORDED,
      services: [{ ...LINE, durationMinutes: 90 }],
    })

    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe('CONFLICT')
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('records without a replay lookup when the request has no key', async () => {
    const res = await post({ services: [LINE] })

    expect(res.status).toBe(201)
    expect(dbMocks.getMembershipSessionByKey).not.toHaveBeenCalled()
    expect(dbMocks.recordMembershipSession.mock.calls[0]?.[0]).toMatchObject({
      idempotencyKey: null,
    })
  })

  it.each([
    ['too short', 'abc'],
    ['with other characters', 'key with spaces!'],
  ])('rejects a key that is %s', async (_label, idempotencyKey) => {
    const res = await post({ services: [LINE], idempotencyKey })

    expect(res.status).toBe(400)
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('refuses up front when the membership is short of minutes', async () => {
    dbMocks.getMembershipById.mockResolvedValue(membership({ usedHoursMinutes: 580 }))

    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe('MEMBERSHIP_INSUFFICIENT_HOURS')
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it.each([
    [
      'expired since it was read',
      membership({ status: 'expired' }),
      'MEMBERSHIP_EXPIRED',
      'This membership is not active or has expired',
    ],
    [
      'spent since it was read',
      membership({ usedHoursMinutes: 600 }),
      'MEMBERSHIP_INSUFFICIENT_HOURS',
      'The requested session duration exceeds the remaining membership hours',
    ],
    [
      'apparently unchanged',
      membership(),
      'MEMBERSHIP_INSUFFICIENT_HOURS',
      'The membership changed while this session was being recorded. Refresh and try again.',
    ],
  ])(
    'explains a guarded write that found the membership %s',
    async (_label, current, code, message) => {
      dbMocks.getMembershipById.mockResolvedValueOnce(membership()).mockResolvedValueOnce(current)
      dbMocks.recordMembershipSession.mockResolvedValue({ ok: false, reason: 'unavailable' })

      const res = await post({ services: [LINE], idempotencyKey: KEY })

      expect(res.status).toBe(409)
      expect(await errorOf(res)).toMatchObject({ code, message })
      expect(dbMocks.getMembershipById).toHaveBeenCalledTimes(2)
    },
  )

  it('answers a concurrent duplicate with the session that committed first', async () => {
    dbMocks.getMembershipSessionByKey.mockResolvedValueOnce(null).mockResolvedValueOnce(RECORDED)
    dbMocks.recordMembershipSession.mockResolvedValue({ ok: false, reason: 'duplicate_key' })

    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({ booking: { id: 'bk_1' }, duplicate: true })
  })

  it('rejects a duplicate key that belongs to something else', async () => {
    dbMocks.recordMembershipSession.mockResolvedValue({ ok: false, reason: 'duplicate_key' })

    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe('CONFLICT')
  })
})

describe('POST /api/memberships/[id]/sessions — at the active branch', () => {
  it('refuses a form rendered for another branch, without writing', async () => {
    const res = await post({ branchId: OTHER_BRANCH.id, services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(dbMocks.getMembershipById).not.toHaveBeenCalled()
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('refuses staff who work at another branch', async () => {
    dbMocks.isStaffAtBranch.mockResolvedValue(false)

    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(400)
    expect((await errorOf(res)).message).toBe('Choose staff who work at Rayasandra.')
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('takes no sessions at a branch that is not operational', async () => {
    dbMocks.getBranchByIdAdmin.mockResolvedValue({
      id: TEST_BRANCH.id,
      name: TEST_BRANCH.name,
      code: 'RS',
      number: 1,
      status: 'temporarily_closed',
    })

    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(400)
    expect(dbMocks.recordMembershipSession).not.toHaveBeenCalled()
  })

  it('uses the shared hours of a membership sold at another branch', async () => {
    dbMocks.getMembershipById.mockResolvedValue(
      membership({ sellingBranchId: OTHER_BRANCH.id, sellingBranch: OTHER_BRANCH }),
    )

    const res = await post({ services: [LINE], idempotencyKey: KEY })

    expect(res.status).toBe(201)
    expect(dbMocks.recordMembershipSession.mock.calls[0]?.[0]).toMatchObject({
      branchId: TEST_BRANCH.id,
    })
  })
})
