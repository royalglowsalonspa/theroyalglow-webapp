// @vitest-environment node
/************************************************************
 * Module Name  : ably/token route.test (admin)
 * Scope        : API — Admin Realtime (multi-branch R2.6)
 *
 * Description  : POST /api/ably/token issues a token for the branches where the
 *                person is a Receptionist or above, read now, and nothing else;
 *                below Receptionist at the active branch it refuses; without a
 *                realtime key it answers 503.
 *
 * Approach     : requireBranchRole and the token helper are mocked; the role
 *                comparison stays real.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BranchContext } from '@/lib/api/branch-context'

const mocks = vi.hoisted(() => ({
  requireBranchRole: vi.fn(),
  createAblyTokenRequest: vi.fn(),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: mocks.requireBranchRole }
})
vi.mock('@/lib/realtime/ably', () => ({ createAblyTokenRequest: mocks.createAblyTokenRequest }))

import { POST } from './route'

const tokenRequest = () =>
  new Request('https://admin.theroyalglow.in/api/ably/token', { method: 'POST' })

function context(branches: { id: string; role: string }[]): BranchContext {
  const accessible = branches.map((b) => ({
    id: b.id,
    name: b.id,
    code: b.id,
    status: 'operational',
    isPrimary: false,
    role: b.role,
  }))
  return {
    session: { user: { id: 'u_1', role: 'manager' } },
    access: { userId: 'u_1', role: 'manager', branches: accessible },
    branch: accessible[0],
  } as unknown as BranchContext
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createAblyTokenRequest.mockResolvedValue({ keyName: 'k', nonce: 'n' })
})

describe('POST /api/ably/token (admin)', () => {
  it('covers every branch where the person is a Receptionist or above', async () => {
    mocks.requireBranchRole.mockResolvedValue(
      context([
        { id: 'branch_rs', role: 'manager' },
        { id: 'branch_mh', role: 'manager' },
      ]),
    )

    const res = await POST(tokenRequest())

    expect(res.status).toBe(200)
    expect(mocks.requireBranchRole).toHaveBeenCalledWith('receptionist')
    expect(mocks.createAblyTokenRequest).toHaveBeenCalledWith({
      userId: 'u_1',
      branchIds: ['branch_rs', 'branch_mh'],
    })
  })

  it('leaves out a branch where the person is only Staff', async () => {
    mocks.requireBranchRole.mockResolvedValue(
      context([
        { id: 'branch_rs', role: 'receptionist' },
        { id: 'branch_mh', role: 'staff' },
      ]),
    )

    await POST(tokenRequest())

    expect(mocks.createAblyTokenRequest).toHaveBeenCalledWith({
      userId: 'u_1',
      branchIds: ['branch_rs'],
    })
  })

  it('refuses below Receptionist at the active branch, issuing nothing', async () => {
    mocks.requireBranchRole.mockRejectedValue(
      new AppError({ code: ERROR_CODES.FORBIDDEN, message: 'No.', statusCode: 403 }),
    )

    const res = await POST(tokenRequest())

    expect(res.status).toBe(403)
    expect(mocks.createAblyTokenRequest).not.toHaveBeenCalled()
  })

  it('answers 503 when realtime is not configured', async () => {
    mocks.requireBranchRole.mockResolvedValue(context([{ id: 'branch_rs', role: 'owner' }]))
    mocks.createAblyTokenRequest.mockResolvedValue(null)

    const res = await POST(tokenRequest())

    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe(ERROR_CODES.SERVICE_UNAVAILABLE)
  })
})
