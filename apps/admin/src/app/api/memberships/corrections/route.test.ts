// @vitest-environment node
import { AppError, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

const mocks = vi.hoisted(() => ({
  requireBranchRole: vi.fn(),
  recordMembershipCorrection: vi.fn(),
}))
vi.mock('@/lib/api/branch-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/branch-context')>()),
  requireBranchRole: mocks.requireBranchRole,
}))
vi.mock('@rgss/db/queries', () => ({
  recordMembershipCorrection: mocks.recordMembershipCorrection,
}))

import { POST } from './route'

const input = {
  branchId: TEST_BRANCH.id,
  bookingId: 'booking_1',
  membershipId: 'membership_1',
  originalInvoiceId: 'invoice_1',
  availableMinutesDelta: -30,
  reason: 'Reviewed the signed appointment record',
  evidenceReference: 'Log reference 17',
  idempotencyKey: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
}

function post(overrides: Partial<typeof input> = {}) {
  return POST(
    new Request('https://admin.theroyalglow.in/api/memberships/corrections', {
      method: 'POST',
      body: JSON.stringify({ ...input, ...overrides }),
    }),
    undefined,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.requireBranchRole.mockResolvedValue(branchContext({ role: 'developer', userId: 'dev_1' }))
})

describe('POST /api/memberships/corrections', () => {
  it('commits the requested minute adjustment as the authenticated Developer', async () => {
    const data = { correction: { id: 'correction_1' }, remainingMinutes: 30, duplicate: false }
    mocks.recordMembershipCorrection.mockResolvedValue({ ok: true, ...data })
    const response = await post()
    expect(response.status).toBe(201)
    expect((await response.json()).data).toEqual(data)
    expect(mocks.requireBranchRole).toHaveBeenCalledWith('developer')
    expect(mocks.recordMembershipCorrection).toHaveBeenCalledWith({
      ...input,
      performedBy: 'dev_1',
    })
  })

  it('blocks stale branch, unauthorized, and zero-minute requests before writing', async () => {
    expect((await post({ availableMinutesDelta: 0 })).status).toBe(400)
    const stale = await post({ branchId: OTHER_BRANCH.id })
    expect(stale.status).toBe(409)
    expect((await stale.json()).error.code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    mocks.requireBranchRole.mockRejectedValue(
      new AppError({
        code: ERROR_CODES.FORBIDDEN,
        statusCode: 403,
        message: 'Forbidden',
      }),
    )
    expect((await post()).status).toBe(403)
    expect(mocks.recordMembershipCorrection).not.toHaveBeenCalled()
  })

  it('returns the linked note on a replay and handles a refused financial adjustment', async () => {
    mocks.recordMembershipCorrection
      .mockResolvedValueOnce({
        ok: true,
        correction: { id: 'correction_1' },
        remainingMinutes: 30,
        duplicate: true,
      })
      .mockResolvedValueOnce({ ok: false, reason: 'balance' })
    expect((await post()).status).toBe(200)
    expect((await post()).status).toBe(409)
  })
})
