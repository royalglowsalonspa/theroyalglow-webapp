// @vitest-environment node
import { AppError, ERROR_CODES } from '@rgss/errors'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

const requireBranchRole = vi.hoisted(() => vi.fn())
const db = vi.hoisted(() => ({
  getBranchByIdAdmin: vi.fn(),
  getHistoricalMembershipSessionByKey: vi.fn(),
  getMembershipById: vi.fn(),
  getServicesByIds: vi.fn(),
  getSettlementSetting: vi.fn(),
  getStaffNamesByIds: vi.fn(),
  recordHistoricalMembershipSession: vi.fn(),
}))
const invoiceTaxFor = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api/branch-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/branch-context')>()),
  requireBranchRole,
}))
vi.mock('@rgss/db/queries', () => db)
vi.mock('@/lib/api/invoice-tax', () => ({
  invoiceTaxFor,
  serviceSacCodes: vi.fn(async () => new Map([['spa_1', '999723']])),
}))

import { POST } from './route'

const now = new Date('2026-11-22T11:00:00.000Z')
const input = {
  branchId: TEST_BRANCH.id,
  actualStart: '2026-11-20T11:00:00+05:30',
  actualEnd: '2026-11-20T12:00:00+05:30',
  staffId: 'stf_retained_1',
  reason: 'Reviewed the counter record',
  evidenceReference: 'Appointment log reference 16',
  idempotencyKey: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
  services: [{ serviceId: 'spa_1', durationMinutes: 60 }],
}
const issued = { booking: { id: 'bk_1' }, invoice: { id: 'inv_1' }, remainingMinutes: 60 }

function submit(overrides: Partial<typeof input> = {}) {
  return POST(
    new Request('https://admin.theroyalglow.in/api/memberships/mem_1/sessions/retrospective', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, ...overrides }),
    }),
    { params: Promise.resolve({ id: 'mem_1' }) },
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  requireBranchRole.mockResolvedValue(branchContext({ role: 'developer', userId: 'u_dev' }))
  db.getBranchByIdAdmin.mockResolvedValue({ ...TEST_BRANCH, code: 'RS', status: 'operational' })
  db.getHistoricalMembershipSessionByKey.mockResolvedValue(null)
  db.getMembershipById.mockResolvedValue({
    customerId: 'u_customer',
    status: 'expired',
    startsAt: new Date('2026-11-15T00:00:00.000Z'),
    expiresAt: new Date('2026-11-21T00:00:00.000Z'),
  })
  db.getServicesByIds.mockResolvedValue([{ id: 'spa_1', name: 'Spa Service', serviceType: 'spa' }])
  db.getStaffNamesByIds.mockResolvedValue([{ id: input.staffId, name: 'Retained Staff' }])
  db.getSettlementSetting.mockResolvedValue({ shareBps: 10_000 })
  db.recordHistoricalMembershipSession.mockResolvedValue({ ok: true, ...issued })
  invoiceTaxFor.mockResolvedValue({
    taxPointAt: now,
    financialYear: '2627',
    taxReviewStatus: 'reviewed',
    lines: [{ sacCode: '999723', rateBps: 500, taxVersionId: 'tax_1' }],
  })
})

afterEach(() => vi.useRealTimers())

describe('recording a retrospective membership session', () => {
  it('records an expired but valid visit with a retained staff profile and audit evidence', async () => {
    const response = await submit()
    expect(response.status).toBe(201)
    expect(requireBranchRole).toHaveBeenCalledWith('developer')
    expect((await response.json()).data).toEqual({ ...issued, duplicate: false })
    expect(db.recordHistoricalMembershipSession).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: input.branchId,
        changedById: 'u_dev',
        staffId: input.staffId,
        actualStart: new Date(input.actualStart),
        actualEnd: new Date(input.actualEnd),
        reason: input.reason,
        evidenceReference: input.evidenceReference,
        requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    )
    expect(invoiceTaxFor).toHaveBeenCalledWith(expect.objectContaining({ taxPoint: now }))
  })

  it('rejects a stale rendered branch before looking up the operation key', async () => {
    const response = await submit({ branchId: OTHER_BRANCH.id })
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(db.getHistoricalMembershipSessionByKey).not.toHaveBeenCalled()
  })

  it('rejects a caller without the Developer role before processing evidence', async () => {
    requireBranchRole.mockRejectedValue(
      new AppError({ code: ERROR_CODES.FORBIDDEN, message: 'Forbidden', statusCode: 403 }),
    )
    expect((await submit()).status).toBe(403)
    expect(db.getHistoricalMembershipSessionByKey).not.toHaveBeenCalled()
  })

  it('rejects missing evidence and inconsistent visit lengths without writing', async () => {
    expect((await submit({ evidenceReference: '' })).status).toBe(400)
    expect((await submit({ actualEnd: '2026-11-20T12:15:00+05:30' })).status).toBe(400)
    expect(db.recordHistoricalMembershipSession).not.toHaveBeenCalled()
  })

  it('replays the recorded invoice at its branch and rejects altered evidence for the same key', async () => {
    expect((await submit()).status).toBe(201)
    const fingerprint = db.recordHistoricalMembershipSession.mock.calls[0]?.[0].requestFingerprint
    db.getHistoricalMembershipSessionByKey.mockResolvedValue({ ...issued, fingerprint })
    const response = await submit()
    expect(response.status).toBe(200)
    expect((await response.json()).data).toEqual({ ...issued, duplicate: true })
    expect(db.getHistoricalMembershipSessionByKey).toHaveBeenLastCalledWith(
      'mem_1',
      input.idempotencyKey,
      input.branchId,
    )
    expect((await submit({ evidenceReference: 'Other reference' })).status).toBe(409)
    expect(db.recordHistoricalMembershipSession).toHaveBeenCalledTimes(1)
  })
})
