// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : branches-routes.test
 * Scope        : Unit tests for admin Branch management routes
 *
 * Description  : GET /api/branches lists only the branches the person can
 *                access and says whether they may change them. POST creates a
 *                branch with its Owner and PATCH edits one, Developer only
 *                (multi-branch R1.1); both check the role in the database,
 *                not the session. A new branch's Owner must be free to own it
 *                (409 otherwise); PATCH can't change the Owner. GET
 *                /api/branches/owner-candidates says who can own a branch.
 *
 * Layer        : Testing
 *
 * Notes        : Node environment. requireCurrentRole and the db queries are
 *                mocked; @rgss/types stays REAL so the schemas are exercised.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireCurrentRole: vi.fn(),
  audit: vi.fn(),
  revokeLiveUpdates: vi.fn(async () => 'stopped'),
}))

const dbMocks = vi.hoisted(() => ({
  getBranches: vi.fn(),
  getBranchById: vi.fn(),
  createBranch: vi.fn(),
  updateBranch: vi.fn(),
  searchUsers: vi.fn(),
  shutDownBranch: vi.fn(),
  getBranchShutdownBlockers: vi.fn(),
  deleteShutDownBranch: vi.fn(),
  // Pure; the real rule.
  shutdownIsClear: (b: {
    manager: unknown
    people: unknown[]
    bookings: { count: number }
    unpaidInvoices: { count: number }
    waitlist: { count: number }
  }) =>
    b.manager === null &&
    b.people.length === 0 &&
    b.bookings.count === 0 &&
    b.unpaidInvoices.count === 0 &&
    b.waitlist.count === 0,
}))

vi.mock('@/lib/api/branch-context', () => ({ requireCurrentRole: mocks.requireCurrentRole }))
vi.mock('@/lib/api/audit', () => ({ audit: mocks.audit }))
vi.mock('@/lib/realtime/revocation', () => ({ revokeLiveUpdates: mocks.revokeLiveUpdates }))
vi.mock('@rgss/db/queries', () => dbMocks)

import * as branchIdRoute from '@/app/api/branches/[id]/route'
import * as shutdownCheckRoute from '@/app/api/branches/[id]/shutdown-check/route'
import * as ownerCandidatesRoute from '@/app/api/branches/owner-candidates/route'
import * as branchRoute from '@/app/api/branches/route'

const BASE = 'https://admin.theroyalglow.in/api/branches'

function actAs(role: 'owner' | 'developer', branchIds: string[]) {
  mocks.requireCurrentRole.mockImplementation(async (minRole: string) => {
    if (minRole === 'developer' && role !== 'developer') {
      throw new AppError({ code: ERROR_CODES.FORBIDDEN, message: 'no', statusCode: 403 })
    }
    return {
      session: { user: { id: `u_${role}` } },
      access: { userId: `u_${role}`, role, branches: branchIds.map((id) => ({ id })) },
    }
  })
}

const jsonReq = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

const validBranch = {
  name: 'Marathahalli',
  addressLine1: '123 Outer Ring Road',
  pincode: '560037',
  phone: '+91 80 1234 5678',
  ownerUserId: 'u_new_owner',
}

beforeEach(() => {
  vi.clearAllMocks()
  actAs('developer', ['br1', 'br2'])
  dbMocks.getBranches.mockResolvedValue([
    { id: 'br1', code: 'RS', name: 'Rayasandra' },
    { id: 'br2', code: 'MH', name: 'Marathahalli' },
    { id: 'br3', code: 'X3', name: 'Elsewhere' },
  ])
})

describe('GET /api/branches — list', () => {
  it('lists only the branches the person can access', async () => {
    actAs('owner', ['br1'])
    const body = await (await branchRoute.GET(new Request(BASE))).json()

    expect(mocks.requireCurrentRole).toHaveBeenCalledWith('owner')
    expect(body.data).toEqual({
      branches: [{ id: 'br1', code: 'RS', name: 'Rayasandra' }],
      canEdit: false,
    })
  })

  it('lets the Developer change them', async () => {
    const body = await (await branchRoute.GET(new Request(BASE))).json()
    expect(body.data.canEdit).toBe(true)
    expect(body.data.branches).toHaveLength(2)
  })

  it('→ 401 when unauthenticated', async () => {
    mocks.requireCurrentRole.mockRejectedValue(
      new AppError({ code: ERROR_CODES.UNAUTHENTICATED, message: 'sign in', statusCode: 401 }),
    )
    const res = await branchRoute.GET(new Request(BASE))
    expect(res.status).toBe(401)
    expect(dbMocks.getBranches).not.toHaveBeenCalled()
  })
})

describe('POST /api/branches — create with an Owner', () => {
  it('creates a branch with its Owner and returns 201', async () => {
    dbMocks.createBranch.mockResolvedValue({
      ok: true,
      branch: { id: 'br_new', code: 'MARATH', name: 'Marathahalli' },
    })

    const res = await branchRoute.POST(jsonReq(BASE, 'POST', validBranch))

    expect(res.status).toBe(201)
    expect(mocks.requireCurrentRole).toHaveBeenCalledWith('developer')
    expect(dbMocks.createBranch).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Marathahalli', ownerUserId: 'u_new_owner' }),
    )
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ action: 'create', entityId: 'br_new', branchId: 'br_new' }),
    )
  })

  it('needs an Owner', async () => {
    const { ownerUserId: _omitted, ...withoutOwner } = validBranch
    const res = await branchRoute.POST(jsonReq(BASE, 'POST', withoutOwner))
    expect(res.status).toBe(400)
    expect(dbMocks.createBranch).not.toHaveBeenCalled()
  })

  it('→ 409 when the chosen Owner holds another role', async () => {
    dbMocks.createBranch.mockResolvedValue({ ok: false, reason: 'owner_unavailable' })
    const res = await branchRoute.POST(jsonReq(BASE, 'POST', validBranch))
    expect(res.status).toBe(409)
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('rejects invalid data with 400 (bad pincode)', async () => {
    const res = await branchRoute.POST(jsonReq(BASE, 'POST', { ...validBranch, pincode: '12' }))
    expect(res.status).toBe(400)
    expect(dbMocks.createBranch).not.toHaveBeenCalled()
  })

  it('→ 403 for an Owner', async () => {
    actAs('owner', ['br1'])
    const res = await branchRoute.POST(jsonReq(BASE, 'POST', validBranch))
    expect(res.status).toBe(403)
    expect(dbMocks.createBranch).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/branches/[id] — Developer edits', () => {
  it('updates a branch status and returns 200', async () => {
    dbMocks.getBranchById.mockResolvedValue({ id: 'br1', status: 'operational' })
    dbMocks.updateBranch.mockResolvedValue({ id: 'br1', status: 'temporarily_closed' })

    const res = await branchIdRoute.PATCH(
      jsonReq(`${BASE}/br1`, 'PATCH', { status: 'temporarily_closed' }),
      { params: Promise.resolve({ id: 'br1' }) },
    )

    expect(res.status).toBe(200)
    expect(mocks.requireCurrentRole).toHaveBeenCalledWith('developer')
    expect(dbMocks.updateBranch).toHaveBeenCalledWith('br1', { status: 'temporarily_closed' })
  })

  it('never changes the Owner', async () => {
    dbMocks.getBranchById.mockResolvedValue({ id: 'br1' })
    dbMocks.updateBranch.mockResolvedValue({ id: 'br1' })
    await branchIdRoute.PATCH(jsonReq(`${BASE}/br1`, 'PATCH', { ownerUserId: 'u_x' }), {
      params: Promise.resolve({ id: 'br1' }),
    })
    expect(dbMocks.updateBranch).toHaveBeenCalledWith('br1', {})
  })

  it('→ 404 when the branch is missing', async () => {
    dbMocks.getBranchById.mockResolvedValue(null)
    const res = await branchIdRoute.PATCH(
      jsonReq(`${BASE}/missing`, 'PATCH', { status: 'shutdown' }),
      { params: Promise.resolve({ id: 'missing' }) },
    )
    expect(res.status).toBe(404)
    expect(dbMocks.updateBranch).not.toHaveBeenCalled()
  })

  it('rejects an invalid status with 400', async () => {
    const res = await branchIdRoute.PATCH(jsonReq(`${BASE}/br1`, 'PATCH', { status: 'paused' }), {
      params: Promise.resolve({ id: 'br1' }),
    })
    expect(res.status).toBe(400)
    expect(dbMocks.updateBranch).not.toHaveBeenCalled()
  })

  it('→ 403 for an Owner', async () => {
    actAs('owner', ['br1'])
    const res = await branchIdRoute.PATCH(jsonReq(`${BASE}/br1`, 'PATCH', { status: 'shutdown' }), {
      params: Promise.resolve({ id: 'br1' }),
    })
    expect(res.status).toBe(403)
    expect(dbMocks.getBranchById).not.toHaveBeenCalled()
  })
})

describe('GET /api/branches/owner-candidates', () => {
  it('says who can own a branch', async () => {
    dbMocks.searchUsers.mockResolvedValue([
      {
        id: 'u1',
        name: 'Roshini',
        email: 'r@example.com',
        phone: null,
        role: 'owner',
        staff: null,
      },
      {
        id: 'u2',
        name: 'Kavya',
        email: 'k@example.com',
        phone: null,
        role: 'customer',
        staff: null,
      },
      {
        id: 'u3',
        name: 'Asha',
        email: 'a@example.com',
        phone: null,
        role: 'staff',
        staff: { designation: 'stylist', isActive: true },
      },
      {
        id: 'u4',
        name: 'Dev',
        email: 'd@example.com',
        phone: null,
        role: 'developer',
        staff: null,
      },
    ])

    const body = await (
      await ownerCandidatesRoute.GET(new Request(`${BASE}/owner-candidates?search=abc`))
    ).json()

    expect(mocks.requireCurrentRole).toHaveBeenCalledWith('developer')
    expect(
      body.data.people.map((p: { id: string; available: boolean }) => [p.id, p.available]),
    ).toEqual([
      ['u1', true],
      ['u2', true],
      ['u3', false],
      ['u4', false],
    ])
  })
})

// ── Shutdown and delete (multi-branch R1.10) ─────────────────────────────────

const OPEN = {
  manager: { userId: 'u_mgr', name: 'Manish' },
  people: [{ userId: 'u_rcp', name: 'Kavya', role: 'receptionist' }],
  bookings: { count: 2, upcoming: [] },
  unpaidInvoices: { count: 1, listed: [] },
  waitlist: { count: 0 },
}
const CLEAR = {
  manager: null,
  people: [],
  bookings: { count: 0, upcoming: [] },
  unpaidInvoices: { count: 0, listed: [] },
  waitlist: { count: 0 },
}
const ctxFor = (id: string) => ({ params: Promise.resolve({ id }) })

describe('PATCH /api/branches/[id] — shutting down (R1.10)', () => {
  beforeEach(() => {
    dbMocks.getBranchById.mockResolvedValue({
      id: 'br2',
      name: 'Marathahalli',
      status: 'operational',
    })
  })

  it('shuts a branch down through the guarded write, with the other edits', async () => {
    dbMocks.shutDownBranch.mockResolvedValue({
      ok: true,
      branch: { id: 'br2', status: 'shutdown' },
    })

    const res = await branchIdRoute.PATCH(
      jsonReq(`${BASE}/br2`, 'PATCH', { status: 'shutdown', temporaryCloseReason: 'Lease ended' }),
      ctxFor('br2'),
    )

    expect(res.status).toBe(200)
    expect(dbMocks.shutDownBranch).toHaveBeenCalledWith('br2', {
      temporaryCloseReason: 'Lease ended',
    })
    expect(dbMocks.updateBranch).not.toHaveBeenCalled()
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.any(Request),
      expect.anything(),
      expect.objectContaining({ action: 'status_change', entityId: 'br2', branchId: 'br2' }),
    )
  })

  it('answers 409 listing what is still open, and writes nothing', async () => {
    dbMocks.shutDownBranch.mockResolvedValue({ ok: false, reason: 'unresolved' })
    dbMocks.getBranchShutdownBlockers.mockResolvedValue(OPEN)

    const res = await branchIdRoute.PATCH(
      jsonReq(`${BASE}/br2`, 'PATCH', { status: 'shutdown' }),
      ctxFor('br2'),
    )
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error.code).toBe('BRANCH_SHUTDOWN_BLOCKED')
    expect(body.error.message).toBe(
      "Marathahalli can't shut down yet. Move the Manager, Manish, in Users & Roles. Remove or move 1 person who works here: Kavya (Receptionist). Complete, cancel or move 2 bookings still to happen. Settle 1 unpaid invoice.",
    )
    expect(body.error.details.lines).toHaveLength(4)
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('edits a branch that is already shut down without the shutdown check', async () => {
    dbMocks.getBranchById.mockResolvedValue({ id: 'br2', name: 'Marathahalli', status: 'shutdown' })
    dbMocks.updateBranch.mockResolvedValue({ id: 'br2' })

    await branchIdRoute.PATCH(
      jsonReq(`${BASE}/br2`, 'PATCH', { status: 'shutdown', phone: '+91 80 0000 0000' }),
      ctxFor('br2'),
    )

    expect(dbMocks.shutDownBranch).not.toHaveBeenCalled()
    expect(dbMocks.updateBranch).toHaveBeenCalledWith('br2', {
      status: 'shutdown',
      phone: '+91 80 0000 0000',
    })
  })
})

describe('GET /api/branches/[id]/shutdown-check', () => {
  it('lists what to resolve, Developer only', async () => {
    dbMocks.getBranchShutdownBlockers.mockResolvedValue(OPEN)

    const res = await shutdownCheckRoute.GET(
      new Request(`${BASE}/br2/shutdown-check`),
      ctxFor('br2'),
    )
    const body = await res.json()

    expect(mocks.requireCurrentRole).toHaveBeenCalledWith('developer')
    expect(body.data).toMatchObject({ branchId: 'br2', clear: false, blockers: OPEN })
    expect(body.data.lines[0]).toBe('Move the Manager, Manish, in Users & Roles.')
  })

  it('says when the branch is clear, and 404s for a missing one', async () => {
    dbMocks.getBranchShutdownBlockers.mockResolvedValueOnce(CLEAR)
    const clear = await (
      await shutdownCheckRoute.GET(new Request(`${BASE}/br2/shutdown-check`), ctxFor('br2'))
    ).json()
    expect(clear.data).toMatchObject({ clear: true, lines: [] })

    dbMocks.getBranchShutdownBlockers.mockResolvedValueOnce(null)
    const missing = await shutdownCheckRoute.GET(
      new Request(`${BASE}/x/shutdown-check`),
      ctxFor('x'),
    )
    expect(missing.status).toBe(404)
  })

  it('→ 403 for an Owner', async () => {
    actAs('owner', ['br2'])
    const res = await shutdownCheckRoute.GET(
      new Request(`${BASE}/br2/shutdown-check`),
      ctxFor('br2'),
    )
    expect(res.status).toBe(403)
    expect(dbMocks.getBranchShutdownBlockers).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/branches/[id] (R1.1, R1.10)', () => {
  beforeEach(() => {
    dbMocks.getBranchById.mockResolvedValue({ id: 'br2', name: 'Marathahalli', status: 'shutdown' })
  })

  it('deletes an empty shut-down branch and cuts off its returned Owner’s live updates', async () => {
    dbMocks.deleteShutDownBranch.mockResolvedValue({ ok: true, demotedOwnerId: 'u_solo_owner' })

    const res = await branchIdRoute.DELETE(
      new Request(`${BASE}/br2`, { method: 'DELETE' }),
      ctxFor('br2'),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({
      deleted: true,
      ownerReturnedToCustomer: 'u_solo_owner',
      liveUpdates: 'stopped',
    })
    expect(mocks.revokeLiveUpdates).toHaveBeenCalledWith(['u_solo_owner'])
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.any(Request),
      expect.anything(),
      expect.objectContaining({ action: 'delete', entityType: 'branch', entityId: 'br2' }),
    )
  })

  it('leaves the Owner alone when they own another branch', async () => {
    dbMocks.deleteShutDownBranch.mockResolvedValue({ ok: true, demotedOwnerId: null })

    const body = await (
      await branchIdRoute.DELETE(new Request(`${BASE}/br2`, { method: 'DELETE' }), ctxFor('br2'))
    ).json()

    expect(body.data.liveUpdates).toBe('none')
    expect(mocks.revokeLiveUpdates).not.toHaveBeenCalled()
  })

  it.each([
    ['not_shut_down', 409, 'Shut Marathahalli down before deleting it.'],
    [
      'not_empty',
      409,
      'Marathahalli has bookings, invoices or other records, so it stays as a shut-down branch.',
    ],
    ['changed', 409, 'Marathahalli changed while you were deleting it. Reload and try again.'],
    ['not_found', 404, 'Branch not found.'],
  ])('answers %s with %i', async (reason, status, message) => {
    dbMocks.deleteShutDownBranch.mockResolvedValue({ ok: false, reason })

    const res = await branchIdRoute.DELETE(
      new Request(`${BASE}/br2`, { method: 'DELETE' }),
      ctxFor('br2'),
    )

    expect(res.status).toBe(status)
    expect((await res.json()).error.message).toBe(message)
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('→ 403 for an Owner, before reading anything', async () => {
    actAs('owner', ['br2'])
    const res = await branchIdRoute.DELETE(
      new Request(`${BASE}/br2`, { method: 'DELETE' }),
      ctxFor('br2'),
    )
    expect(res.status).toBe(403)
    expect(dbMocks.deleteShutDownBranch).not.toHaveBeenCalled()
  })
})
