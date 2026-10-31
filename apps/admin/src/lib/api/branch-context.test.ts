// @vitest-environment node
/************************************************************
 * Module Name  : branch-context.test
 * Scope        : API Infrastructure — multi-branch authorization (R2)
 *
 * Description  : requireBranchRole must read access from the database on
 *                every call, use the switcher cookie only when it names an
 *                allowed branch, reject a form rendered for another branch, and
 *                refuse people with no branch or too low a role there.
 *
 * Approach     : Session, the access query and next/headers are mocked; the
 *                branch rules from @rgss/business stay real.
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getBranchAccessInputs: vi.fn(),
  cookie: { value: undefined as string | undefined },
}))

vi.mock('./session', () => ({ requireSession: mocks.requireSession }))
vi.mock('@rgss/db/queries', () => ({ getBranchAccessInputs: mocks.getBranchAccessInputs }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'rgss_admin_branch' && mocks.cookie.value !== undefined
        ? { name, value: mocks.cookie.value }
        : undefined,
  }),
}))

import { requireBranchRole, requireCurrentRole } from './branch-context'

const BRANCHES = [
  {
    id: 'rs',
    name: 'Rayasandra',
    code: 'RS',
    status: 'operational',
    isPrimary: true,
    displayOrder: 1,
    ownerUserId: 'own1',
    managerUserId: 'mgr1',
  },
  {
    id: 'mh',
    name: 'Marathahalli',
    code: 'MH',
    status: 'operational',
    isPrimary: false,
    displayOrder: 2,
    ownerUserId: 'own1',
    managerUserId: null,
  },
]

function signIn(id: string, role: string, profile: unknown = null) {
  // The session's cached role is deliberately stale: the database decides.
  mocks.requireSession.mockResolvedValue({ user: { id, role: 'developer' } })
  mocks.getBranchAccessInputs.mockResolvedValue({ user: { id, role }, branches: BRANCHES, profile })
}

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return error as { code: string; statusCode: number; message: string }
  }
  throw new Error('expected a rejection')
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cookie.value = undefined
})

describe('requireBranchRole', () => {
  it('defaults to the primary branch and reads access from the database', async () => {
    signIn('own1', 'owner')

    const ctx = await requireBranchRole('receptionist')

    expect(ctx.branch).toMatchObject({ id: 'rs', role: 'owner' })
    expect(mocks.getBranchAccessInputs).toHaveBeenCalledWith('own1')
  })

  it('uses the switcher choice when the person may act on that branch', async () => {
    signIn('own1', 'owner')
    mocks.cookie.value = 'mh'

    expect((await requireBranchRole('receptionist')).branch.id).toBe('mh')
  })

  it('ignores a switcher choice the person may not act on', async () => {
    signIn('mgr1', 'manager')
    mocks.cookie.value = 'mh'

    expect((await requireBranchRole('receptionist')).branch.id).toBe('rs')
  })

  it('rejects a form rendered for another branch with 409', async () => {
    signIn('own1', 'owner')
    mocks.cookie.value = 'mh'

    const error = await errorOf(requireBranchRole('receptionist', { renderedBranchId: 'rs' }))

    expect(error).toMatchObject({ code: 'BRANCH_CONTEXT_CHANGED', statusCode: 409 })
    expect(error.message).toContain('Marathahalli')
  })

  it('accepts a form rendered for the active branch', async () => {
    signIn('own1', 'owner')
    mocks.cookie.value = 'mh'

    expect((await requireBranchRole('receptionist', { renderedBranchId: 'mh' })).branch.id).toBe(
      'mh',
    )
  })

  it('refuses a person with no branch with 403', async () => {
    signIn('c1', 'customer')

    expect(await errorOf(requireBranchRole('staff'))).toMatchObject({
      code: 'BRANCH_ACCESS_NONE',
      statusCode: 403,
    })
  })

  it('refuses a role below the minimum at the active branch with 403', async () => {
    signIn('rec1', 'receptionist', { branchId: 'mh', roleWitness: 'receptionist', isActive: true })

    expect(await errorOf(requireBranchRole('manager'))).toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    })
    expect((await requireBranchRole('receptionist')).branch.id).toBe('mh')
  })

  it('treats a session whose account is gone as signed out', async () => {
    mocks.requireSession.mockResolvedValue({ user: { id: 'gone', role: 'owner' } })
    mocks.getBranchAccessInputs.mockResolvedValue(null)

    expect(await errorOf(requireBranchRole('staff'))).toMatchObject({
      code: 'UNAUTHENTICATED',
      statusCode: 401,
    })
  })
})

describe('requireCurrentRole', () => {
  it('checks the role in the database, not the session copy', async () => {
    signIn('own1', 'owner')

    expect(await errorOf(requireCurrentRole('developer'))).toMatchObject({ statusCode: 403 })
    expect((await requireCurrentRole('owner')).access.role).toBe('owner')
  })
})
