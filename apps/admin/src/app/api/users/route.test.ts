// @vitest-environment node
/************************************************************
 * Module Name  : users route.test
 * Scope        : API — Users & Roles at the active branch (R1.4, R1.5)
 *
 * Description  : GET /api/users previews, for each match, the roles they can
 *                be given at the active branch, without naming other
 *                branches. POST plans with the real @rgss/business planner and
 *                applies through applyBranchRolePlan: only the Developer sets
 *                the Owner, the Owner sets the Manager and Receptionist, a
 *                stale tab or stale holder is refused, and nothing is written
 *                for a refused or already-satisfied change.
 *                GET /api/users/branch-roles lists the holders.
 *
 * Approach     : requireBranchRole and the db queries are mocked; the planner
 *                and the rendered-branch check stay real.
 ************************************************************/

import type { BranchRoleSnapshot } from '@rgss/db/queries'
import { AppError, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireBranchRole: vi.fn(),
  searchUsers: vi.fn(),
  getRoleSnapshot: vi.fn(),
  applyBranchRolePlan: vi.fn(),
  getPeopleByIds: vi.fn(),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: mocks.requireBranchRole }
})
// Revoking live updates is covered in revocation.test.ts; here only the hand-off.
const revokeLiveUpdates = vi.hoisted(() => vi.fn())
vi.mock('@/lib/realtime/revocation', () => ({ revokeLiveUpdates }))
vi.mock('@rgss/db/queries', () => ({
  searchUsers: mocks.searchUsers,
  getRoleSnapshot: mocks.getRoleSnapshot,
  applyBranchRolePlan: mocks.applyBranchRolePlan,
  getPeopleByIds: mocks.getPeopleByIds,
}))

import { GET as GET_HOLDERS } from './branch-roles/route'
import { GET, POST } from './route'

const branchRow = (
  id: string,
  ownerUserId: string,
  managerUserId: string | null,
  order: number,
) => ({
  id,
  name: id === 'rs' ? 'Rayasandra' : 'Marathahalli',
  code: id.toUpperCase(),
  status: 'operational' as const,
  isPrimary: order === 1,
  displayOrder: order,
  ownerUserId,
  managerUserId,
})

const SNAPSHOT: BranchRoleSnapshot = {
  users: [
    { id: 'dev1', role: 'developer' },
    { id: 'own1', role: 'owner' },
    { id: 'own2', role: 'owner' },
    { id: 'mgr1', role: 'manager' },
    { id: 'rec1', role: 'receptionist' },
    { id: 'sty2', role: 'staff' },
    { id: 'cus1', role: 'customer' },
  ],
  profiles: [
    {
      userId: 'mgr1',
      designation: 'manager',
      branchId: null,
      roleWitness: 'manager',
      isActive: true,
    },
    {
      userId: 'rec1',
      designation: 'receptionist',
      branchId: 'rs',
      roleWitness: 'receptionist',
      isActive: true,
    },
    {
      userId: 'sty2',
      designation: 'stylist',
      branchId: 'mh',
      roleWitness: 'staff',
      isActive: true,
    },
  ],
  branches: [branchRow('rs', 'own1', 'mgr1', 1), branchRow('mh', 'own2', null, 2)],
}

function person(id: string) {
  return { id, name: `Name ${id}`, email: `${id}@example.com`, phone: null }
}

function match(id: string) {
  return {
    ...person(id),
    role: null,
    image: null,
    banned: false,
    createdAt: new Date(),
    staff: null,
  }
}

function actAs(id: 'own1' | 'dev1') {
  mocks.requireBranchRole.mockResolvedValue({
    session: { user: { id } },
    access: { userId: id, role: id === 'dev1' ? 'developer' : 'owner', branches: [] },
    branch: {
      id: 'rs',
      name: 'Rayasandra',
      code: 'RS',
      status: 'operational',
      isPrimary: true,
      role: id === 'dev1' ? 'developer' : 'owner',
    },
  })
}

const search = (term: string) =>
  new Request(`https://admin.theroyalglow.in/api/users?search=${term}`)

const post = (body: unknown) =>
  new Request('https://admin.theroyalglow.in/api/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  actAs('own1')
  mocks.getRoleSnapshot.mockResolvedValue(SNAPSHOT)
  mocks.applyBranchRolePlan.mockResolvedValue({ ok: true, signedOut: [] })
  revokeLiveUpdates.mockResolvedValue('none')
})

describe('GET /api/users', () => {
  it('needs the Owner of the active branch or the Developer', async () => {
    mocks.searchUsers.mockResolvedValue([])
    await GET(search('pri'))
    expect(mocks.requireBranchRole).toHaveBeenCalledWith('owner')
  })

  it('reads no snapshot when nothing matches', async () => {
    mocks.searchUsers.mockResolvedValue([])
    const body = await (await GET(search('pr'))).json()
    expect(body.data).toEqual({ branchId: 'rs', users: [] })
    expect(mocks.getRoleSnapshot).not.toHaveBeenCalled()
  })

  it('offers an Owner the Manager and Receptionist roles for a customer, not the Owner', async () => {
    mocks.searchUsers.mockResolvedValue([match('cus1')])
    const body = await (await GET(search('name'))).json()

    expect(mocks.getRoleSnapshot).toHaveBeenCalledWith('rs', ['own1', 'cus1'])
    expect(body.data.users).toEqual([
      {
        ...person('cus1'),
        here: null,
        actions: ['set_manager', 'set_receptionist'],
        note: null,
      },
    ])
  })

  it('offers the Developer the Owner role as well', async () => {
    actAs('dev1')
    mocks.searchUsers.mockResolvedValue([match('cus1')])
    const body = await (await GET(search('name'))).json()
    expect(body.data.users[0].actions).toEqual(['set_owner', 'set_manager', 'set_receptionist'])
  })

  it('says someone at another branch is unavailable without naming the branch', async () => {
    mocks.searchUsers.mockResolvedValue([match('sty2')])
    const body = await (await GET(search('name'))).json()
    expect(body.data.users[0]).toMatchObject({
      here: null,
      actions: [],
      note: 'This person works at another branch.',
    })
    expect(JSON.stringify(body)).not.toContain('Marathahalli')
  })

  it('marks the current holders and protects yourself and the Developer', async () => {
    mocks.searchUsers.mockResolvedValue([match('mgr1'), match('own1'), match('dev1')])
    const body = await (await GET(search('name'))).json()
    const [manager, self, developer] = body.data.users
    expect(manager).toMatchObject({ here: 'manager', note: null })
    expect(self).toMatchObject({
      here: 'owner',
      note: 'This is you. Nobody changes their own role.',
    })
    expect(developer).toMatchObject({
      actions: [],
      note: "The Developer account's role can only be changed in the database.",
    })
  })
})

describe('POST /api/users', () => {
  it('replaces the Manager in one transaction, naming the holder it replaces', async () => {
    const res = await POST(
      post({ kind: 'set_manager', branchId: 'rs', userId: 'cus1', expectedHolderId: 'mgr1' }),
    )

    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ changed: true, liveUpdates: 'none' })
    expect(revokeLiveUpdates).toHaveBeenCalledWith([])
    expect(mocks.getRoleSnapshot).toHaveBeenCalledWith('rs', ['own1', 'cus1'])
    const [{ snapshot, writes, audit }] = mocks.applyBranchRolePlan.mock.calls[0] ?? [{}]
    expect(snapshot).toBe(SNAPSHOT)
    expect(writes).toEqual(
      expect.arrayContaining([
        { kind: 'branch_manager', branchId: 'rs', from: 'mgr1', to: 'cus1' },
        { kind: 'user_role', userId: 'cus1', from: 'customer', to: 'manager' },
        // mgr1 managed only rs, so they become a Customer and are signed out.
        { kind: 'user_role', userId: 'mgr1', from: 'manager', to: 'customer' },
        { kind: 'end_sessions', userId: 'mgr1' },
      ]),
    )
    expect(audit).toMatchObject({
      actorId: 'own1',
      action: 'status_change',
      entityType: 'user',
      entityId: 'cus1',
      branchId: 'rs',
      oldValues: { role: 'customer', profile: null },
    })
  })

  it('refuses a tab rendered for another branch before reading anything', async () => {
    const res = await POST(
      post({ kind: 'set_receptionist', branchId: 'mh', userId: 'cus1', expectedHolderId: null }),
    )
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(mocks.getRoleSnapshot).not.toHaveBeenCalled()
  })

  it('lets only the Developer change the Owner', async () => {
    const res = await POST(
      post({ kind: 'set_owner', branchId: 'rs', userId: 'cus1', expectedHolderId: 'own1' }),
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toBe('Only the Developer can change a branch Owner.')
    expect(mocks.applyBranchRolePlan).not.toHaveBeenCalled()

    actAs('dev1')
    const ok = await POST(
      post({ kind: 'set_owner', branchId: 'rs', userId: 'cus1', expectedHolderId: 'own1' }),
    )
    expect(ok.status).toBe(200)
    expect(mocks.applyBranchRolePlan).toHaveBeenCalledTimes(1)
  })

  it('refuses a holder that changed since the page was rendered', async () => {
    const res = await POST(
      post({ kind: 'set_receptionist', branchId: 'rs', userId: 'cus1', expectedHolderId: null }),
    )
    expect(res.status).toBe(409)
    expect((await res.json()).error.message).toMatch(/changed this branch just now/)
    expect(mocks.applyBranchRolePlan).not.toHaveBeenCalled()
  })

  it('reports a change the database found stale as 409', async () => {
    mocks.applyBranchRolePlan.mockResolvedValue({ ok: false, reason: 'stale' })
    const res = await POST(post({ kind: 'remove', branchId: 'rs', userId: 'rec1' }))
    expect(res.status).toBe(409)
  })

  it('writes nothing when the change is already true', async () => {
    const res = await POST(
      post({ kind: 'set_manager', branchId: 'rs', userId: 'mgr1', expectedHolderId: 'mgr1' }),
    )
    expect((await res.json()).data).toEqual({ changed: false, liveUpdates: 'none' })
    expect(mocks.applyBranchRolePlan).not.toHaveBeenCalled()
    expect(revokeLiveUpdates).not.toHaveBeenCalled()
  })

  it('rejects a malformed request with 400', async () => {
    const res = await POST(post({ kind: 'set_manager', branchId: 'rs' }))
    expect(res.status).toBe(400)
    expect(mocks.getRoleSnapshot).not.toHaveBeenCalled()
  })

  it('passes authentication failures through', async () => {
    mocks.requireBranchRole.mockRejectedValue(
      new AppError({ code: ERROR_CODES.UNAUTHENTICATED, message: 'sign in', statusCode: 401 }),
    )
    const res = await POST(post({ kind: 'remove', branchId: 'rs', userId: 'rec1' }))
    expect(res.status).toBe(401)
  })
})

describe('GET /api/users/branch-roles', () => {
  it("lists the branch's holders and what an Owner may change", async () => {
    mocks.getPeopleByIds.mockImplementation(async (ids: string[]) => ids.map(person))

    const body = await (await GET_HOLDERS(new Request('https://admin.theroyalglow.in/x'))).json()

    expect(mocks.getPeopleByIds).toHaveBeenCalledWith(['own1', 'mgr1', 'rec1'])
    expect(body.data).toEqual({
      branch: { id: 'rs', name: 'Rayasandra', code: 'RS', status: 'operational' },
      owner: person('own1'),
      manager: person('mgr1'),
      receptionist: person('rec1'),
      can: { setOwner: false, setManager: true, setReceptionist: true },
    })
  })

  it('lets the Developer change the Owner', async () => {
    actAs('dev1')
    mocks.getPeopleByIds.mockResolvedValue([])
    const body = await (await GET_HOLDERS(new Request('https://admin.theroyalglow.in/x'))).json()
    expect(body.data.can.setOwner).toBe(true)
  })
})
