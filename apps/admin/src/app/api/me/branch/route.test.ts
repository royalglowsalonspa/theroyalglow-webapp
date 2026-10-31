// @vitest-environment node
/************************************************************
 * Module Name  : me/branch route.test
 * Scope        : API — The admin branch switcher (multi-branch R2.1, R2.4)
 *
 * Description  : GET lists the branches the person can access from current
 *                rows and names the active one, honouring the switcher cookie
 *                only for an accessible branch. PUT stores a new choice only
 *                for a branch the person can access, in the HttpOnly cookie.
 *
 * Approach     : Session, the access query and next/headers are mocked; the
 *                branch rules from @rgss/business stay real.
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getBranchAccessInputs: vi.fn(),
  cookie: { value: undefined as string | undefined },
  set: vi.fn(),
}))

vi.mock('@/lib/api/session', () => ({ requireSession: mocks.requireSession }))
vi.mock('@rgss/db/queries', () => ({ getBranchAccessInputs: mocks.getBranchAccessInputs }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'rgss_admin_branch' && mocks.cookie.value !== undefined
        ? { name, value: mocks.cookie.value }
        : undefined,
    set: mocks.set,
  }),
}))

import { GET, PUT } from './route'

const branch = (id: string, order: number, ownerUserId: string) => ({
  id,
  name: id === 'rs' ? 'Rayasandra' : id === 'mh' ? 'Marathahalli' : 'Elsewhere',
  code: id.toUpperCase(),
  status: 'operational',
  isPrimary: order === 1,
  displayOrder: order,
  ownerUserId,
  managerUserId: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cookie.value = undefined
  mocks.requireSession.mockResolvedValue({ user: { id: 'own1' } })
  mocks.getBranchAccessInputs.mockResolvedValue({
    user: { id: 'own1', role: 'owner' },
    branches: [branch('rs', 1, 'own1'), branch('mh', 2, 'own1'), branch('x3', 3, 'own2')],
    profile: null,
  })
})

const put = (body: unknown) =>
  new Request('https://admin.theroyalglow.in/api/me/branch', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('GET /api/me/branch', () => {
  it('lists the accessible branches and the active one', async () => {
    mocks.cookie.value = 'mh'
    const body = await (
      await GET(new Request('https://admin.theroyalglow.in/api/me/branch'))
    ).json()

    expect(body.data.active).toMatchObject({ id: 'mh', role: 'owner' })
    expect(body.data.branches.map((b: { id: string }) => b.id)).toEqual(['rs', 'mh'])
  })

  it('ignores a stored branch the person can no longer access', async () => {
    mocks.cookie.value = 'x3'
    const body = await (
      await GET(new Request('https://admin.theroyalglow.in/api/me/branch'))
    ).json()
    expect(body.data.active.id).toBe('rs')
  })
})

describe('PUT /api/me/branch', () => {
  it('stores an accessible branch in the HttpOnly cookie', async () => {
    const res = await PUT(put({ branchId: 'mh' }))

    expect(res.status).toBe(200)
    expect((await res.json()).data.active).toMatchObject({ id: 'mh' })
    expect(mocks.set).toHaveBeenCalledWith(
      'rgss_admin_branch',
      'mh',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    )
  })

  it('refuses a branch the person can’t access, storing nothing', async () => {
    const res = await PUT(put({ branchId: 'x3' }))
    expect(res.status).toBe(404)
    expect(mocks.set).not.toHaveBeenCalled()
  })

  it('rejects a malformed body with 400', async () => {
    const res = await PUT(put({}))
    expect(res.status).toBe(400)
    expect(mocks.set).not.toHaveBeenCalled()
  })
})
