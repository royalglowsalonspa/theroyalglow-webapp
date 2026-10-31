// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : staff-routes.test
 * Scope        : Unit tests for the Staff page API at the active branch
 *
 * Description  : Every Staff route works on the active branch only:
 *                GET /api/staff (picker), GET /api/staff/all (list with what
 *                the actor may do), GET /api/staff/candidates (Add staff
 *                search), POST /api/staff (Add staff through the real
 *                planner), GET|PATCH /api/staff/[id], POST
 *                /api/staff/[id]/remove and PUT /api/staff/[id]/services.
 *                Managers add, edit and remove Stylists and Therapists only;
 *                a tab rendered for another branch is refused; a record from
 *                another branch reads as not found.
 *
 * Notes        : Node environment. requireBranchRole, the db queries and the
 *                audit helper are mocked; @rgss/types (Zod) and the
 *                @rgss/business planner stay real.
 ************************************************************/

import type { BranchRoleSnapshot } from '@rgss/db/queries'
import { AppError, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireBranchRole: vi.fn(),
  audit: vi.fn(),
}))

const dbMocks = vi.hoisted(() => ({
  getActiveStaffAtBranch: vi.fn(),
  getBranchStaff: vi.fn(),
  getStaffMemberAtBranch: vi.fn(),
  updateStaffMemberAtBranch: vi.fn(),
  countUpcomingAssignments: vi.fn(),
  setStaffServices: vi.fn(),
  getServicesByIds: vi.fn(),
  searchUsers: vi.fn(),
  getRoleSnapshot: vi.fn(),
  applyBranchRolePlan: vi.fn(),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: mocks.requireBranchRole }
})
vi.mock('@/lib/api/audit', () => ({ audit: mocks.audit }))
// Revoking live updates is covered in revocation.test.ts; here only the hand-off.
const revokeLiveUpdates = vi.hoisted(() => vi.fn())
vi.mock('@/lib/realtime/revocation', () => ({ revokeLiveUpdates }))
vi.mock('@rgss/db/queries', () => dbMocks)

import * as staffRemoveRoute from '@/app/api/staff/[id]/remove/route'
import * as staffIdRoute from '@/app/api/staff/[id]/route'
import * as staffServicesRoute from '@/app/api/staff/[id]/services/route'
import * as staffAllRoute from '@/app/api/staff/all/route'
import * as candidatesRoute from '@/app/api/staff/candidates/route'
import * as staffRoute from '@/app/api/staff/route'

const URL_BASE = 'https://admin.theroyalglow.in/api/staff'

const SNAPSHOT: BranchRoleSnapshot = {
  users: [
    { id: 'mgr1', role: 'manager' },
    { id: 'own1', role: 'owner' },
    { id: 'rec1', role: 'receptionist' },
    { id: 'sty1', role: 'staff' },
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
      userId: 'sty1',
      designation: 'stylist',
      branchId: 'rs',
      roleWitness: 'staff',
      isActive: true,
    },
  ],
  branches: [
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
  ],
}

function actAs(id: 'mgr1' | 'own1' | 'rec1') {
  const role = id === 'mgr1' ? 'manager' : id === 'own1' ? 'owner' : 'receptionist'
  mocks.requireBranchRole.mockResolvedValue({
    session: { user: { id } },
    access: { userId: id, role, branches: [] },
    branch: {
      id: 'rs',
      name: 'Rayasandra',
      code: 'RS',
      status: 'operational',
      isPrimary: true,
      role,
    },
  })
}

const member = (overrides: Record<string, unknown> = {}) => ({
  id: 'st_sty1',
  userId: 'sty1',
  name: 'Asha',
  email: 'asha@example.com',
  role: 'staff',
  phone: null,
  designation: 'stylist',
  roleWitness: 'staff',
  bio: null,
  specialization: null,
  isActive: true,
  hireDate: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  serviceIds: ['svc1'],
  ...overrides,
})

const jsonReq = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  actAs('mgr1')
  dbMocks.getRoleSnapshot.mockResolvedValue(SNAPSHOT)
  dbMocks.applyBranchRolePlan.mockResolvedValue({ ok: true, signedOut: [], reassignments: 0 })
  dbMocks.countUpcomingAssignments.mockResolvedValue(0)
  revokeLiveUpdates.mockResolvedValue('none')
})

describe('GET /api/staff — picker', () => {
  it("lists the active branch's staff, lean", async () => {
    dbMocks.getActiveStaffAtBranch.mockResolvedValue([
      { id: 'st1', userId: 'u1', name: 'Asha', designation: 'stylist' },
    ])

    const res = await staffRoute.GET(new Request(URL_BASE))

    expect(mocks.requireBranchRole).toHaveBeenCalledWith('receptionist')
    expect(dbMocks.getActiveStaffAtBranch).toHaveBeenCalledWith('rs')
    expect((await res.json()).data).toEqual({
      branchId: 'rs',
      staff: [{ id: 'st1', name: 'Asha', designation: 'stylist' }],
    })
  })

  it('→ 401 when unauthenticated', async () => {
    mocks.requireBranchRole.mockRejectedValue(
      new AppError({ code: ERROR_CODES.UNAUTHENTICATED, message: 'sign in', statusCode: 401 }),
    )
    const res = await staffRoute.GET(new Request(URL_BASE))
    expect(res.status).toBe(401)
    expect(dbMocks.getActiveStaffAtBranch).not.toHaveBeenCalled()
  })
})

describe('POST /api/staff — Add staff', () => {
  it('makes a customer a Therapist here in one transaction', async () => {
    const res = await staffRoute.POST(
      jsonReq(URL_BASE, 'POST', {
        branchId: 'rs',
        userId: 'cus1',
        designation: 'therapist',
        specialization: 'Deep tissue',
      }),
    )

    expect(res.status).toBe(201)
    expect((await res.json()).data).toEqual({ changed: true, liveUpdates: 'none' })
    expect(mocks.requireBranchRole).toHaveBeenCalledWith('manager')
    const [{ writes, audit }] = dbMocks.applyBranchRolePlan.mock.calls[0] ?? [{}]
    expect(writes).toEqual([
      { kind: 'user_role', userId: 'cus1', from: 'customer', to: 'staff' },
      {
        kind: 'profile_activate',
        userId: 'cus1',
        designation: 'therapist',
        roleWitness: 'staff',
        branchId: 'rs',
        specialization: 'Deep tissue',
      },
    ])
    expect(audit).toMatchObject({ actorId: 'mgr1', entityId: 'cus1', branchId: 'rs' })
  })

  it('refuses a tab rendered for another branch', async () => {
    const res = await staffRoute.POST(
      jsonReq(URL_BASE, 'POST', { branchId: 'mh', userId: 'cus1', designation: 'stylist' }),
    )
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(dbMocks.applyBranchRolePlan).not.toHaveBeenCalled()
  })

  it('accepts only Stylist or Therapist', async () => {
    const res = await staffRoute.POST(
      jsonReq(URL_BASE, 'POST', { branchId: 'rs', userId: 'cus1', designation: 'receptionist' }),
    )
    expect(res.status).toBe(400)
    expect(dbMocks.getRoleSnapshot).not.toHaveBeenCalled()
  })

  it('refuses someone who already has a role', async () => {
    const res = await staffRoute.POST(
      jsonReq(URL_BASE, 'POST', { branchId: 'rs', userId: 'sty1', designation: 'stylist' }),
    )
    expect(res.status).toBe(409)
    expect((await res.json()).error.message).toBe('This person is already on the staff here.')
    expect(dbMocks.applyBranchRolePlan).not.toHaveBeenCalled()
  })

  it('reports a concurrent change as 409', async () => {
    dbMocks.applyBranchRolePlan.mockResolvedValue({ ok: false, reason: 'stale' })
    const res = await staffRoute.POST(
      jsonReq(URL_BASE, 'POST', { branchId: 'rs', userId: 'cus1', designation: 'stylist' }),
    )
    expect(res.status).toBe(409)
  })
})

describe('GET /api/staff/all — the branch list', () => {
  it('says what a Manager may do with each person', async () => {
    dbMocks.getBranchStaff.mockResolvedValue([
      member(),
      member({
        id: 'st_rec1',
        userId: 'rec1',
        designation: 'receptionist',
        roleWitness: 'receptionist',
      }),
    ])

    const body = await (await staffAllRoute.GET(new Request(`${URL_BASE}/all`))).json()

    expect(dbMocks.getBranchStaff).toHaveBeenCalledWith('rs')
    expect(body.data.branch).toEqual({ id: 'rs', name: 'Rayasandra', code: 'RS' })
    expect(
      body.data.staff.map((s: { canEdit: boolean; canRemove: boolean }) => [
        s.canEdit,
        s.canRemove,
      ]),
    ).toEqual([
      [true, true],
      [false, false],
    ])
  })

  it('lets the Owner edit everyone but remove only Stylists and Therapists here', async () => {
    actAs('own1')
    dbMocks.getBranchStaff.mockResolvedValue([
      member(),
      member({
        id: 'st_rec1',
        userId: 'rec1',
        designation: 'receptionist',
        roleWitness: 'receptionist',
      }),
    ])
    const body = await (await staffAllRoute.GET(new Request(`${URL_BASE}/all`))).json()
    expect(
      body.data.staff.map((s: { canEdit: boolean; canRemove: boolean }) => [
        s.canEdit,
        s.canRemove,
      ]),
    ).toEqual([
      [true, true],
      [true, false],
    ])
  })
})

describe('GET /api/staff/candidates — Add staff search', () => {
  it('says who can be added, without money or other branches', async () => {
    dbMocks.searchUsers.mockResolvedValue([
      { id: 'cus1', name: 'Kavya', email: 'kavya@example.com', phone: '9876543210', role: null },
      { id: 'sty1', name: 'Asha', email: 'asha@example.com', phone: null, role: 'staff' },
    ])

    const body = await (
      await candidatesRoute.GET(new Request(`${URL_BASE}/candidates?search=kav`))
    ).json()

    expect(dbMocks.getRoleSnapshot).toHaveBeenCalledWith('rs', ['mgr1', 'cus1', 'sty1'])
    expect(body.data).toEqual({
      branchId: 'rs',
      people: [
        {
          id: 'cus1',
          name: 'Kavya',
          email: 'kavya@example.com',
          phone: '9876543210',
          available: true,
          reason: null,
        },
        {
          id: 'sty1',
          name: 'Asha',
          email: 'asha@example.com',
          phone: null,
          available: false,
          reason: 'This person is already on the staff here.',
        },
      ],
    })
  })
})

describe('GET|PATCH /api/staff/[id]', () => {
  it('GET returns a staff member here with their upcoming bookings', async () => {
    dbMocks.getStaffMemberAtBranch.mockResolvedValue(member())
    dbMocks.countUpcomingAssignments.mockResolvedValue(2)

    const res = await staffIdRoute.GET(new Request(`${URL_BASE}/st_sty1`), params('st_sty1'))
    const body = await res.json()

    expect(dbMocks.getStaffMemberAtBranch).toHaveBeenCalledWith('st_sty1', 'rs')
    expect(body.data.staff).toMatchObject({ id: 'st_sty1', upcomingAssignments: 2 })
  })

  it('GET → 404 for someone who does not work here', async () => {
    dbMocks.getStaffMemberAtBranch.mockResolvedValue(null)
    const res = await staffIdRoute.GET(new Request(`${URL_BASE}/x`), params('x'))
    expect(res.status).toBe(404)
  })

  it("PATCH lets a Manager change a Stylist's title", async () => {
    dbMocks.getStaffMemberAtBranch.mockResolvedValue(member())
    dbMocks.updateStaffMemberAtBranch.mockResolvedValue(member({ designation: 'therapist' }))

    const res = await staffIdRoute.PATCH(
      jsonReq(`${URL_BASE}/st_sty1`, 'PATCH', { branchId: 'rs', designation: 'therapist' }),
      params('st_sty1'),
    )

    expect(res.status).toBe(200)
    expect(dbMocks.updateStaffMemberAtBranch).toHaveBeenCalledWith({
      id: 'st_sty1',
      branchId: 'rs',
      roles: ['staff'],
      patch: { designation: 'therapist' },
    })
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ entityType: 'staff_profile', branchId: 'rs' }),
    )
  })

  it('PATCH refuses a Manager editing the Receptionist', async () => {
    dbMocks.getStaffMemberAtBranch.mockResolvedValue(
      member({ id: 'st_rec1', designation: 'receptionist', roleWitness: 'receptionist' }),
    )
    const res = await staffIdRoute.PATCH(
      jsonReq(`${URL_BASE}/st_rec1`, 'PATCH', { branchId: 'rs', bio: 'Front desk' }),
      params('st_rec1'),
    )
    expect(res.status).toBe(403)
    expect(dbMocks.updateStaffMemberAtBranch).not.toHaveBeenCalled()
  })

  it("PATCH lets the Owner edit the Receptionist's details but not their title", async () => {
    actAs('own1')
    dbMocks.getStaffMemberAtBranch.mockResolvedValue(
      member({ id: 'st_rec1', designation: 'receptionist', roleWitness: 'receptionist' }),
    )
    dbMocks.updateStaffMemberAtBranch.mockResolvedValue(member({ id: 'st_rec1' }))

    const titled = await staffIdRoute.PATCH(
      jsonReq(`${URL_BASE}/st_rec1`, 'PATCH', { branchId: 'rs', designation: 'stylist' }),
      params('st_rec1'),
    )
    expect(titled.status).toBe(400)

    const res = await staffIdRoute.PATCH(
      jsonReq(`${URL_BASE}/st_rec1`, 'PATCH', { branchId: 'rs', specialization: 'Billing' }),
      params('st_rec1'),
    )
    expect(res.status).toBe(200)
    expect(dbMocks.updateStaffMemberAtBranch).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ['staff', 'receptionist', 'manager'] }),
    )
  })

  it('PATCH has no active toggle any more', async () => {
    dbMocks.getStaffMemberAtBranch.mockResolvedValue(member())
    dbMocks.updateStaffMemberAtBranch.mockResolvedValue(member())
    await staffIdRoute.PATCH(
      jsonReq(`${URL_BASE}/st_sty1`, 'PATCH', { branchId: 'rs', isActive: false }),
      params('st_sty1'),
    )
    expect(dbMocks.updateStaffMemberAtBranch).toHaveBeenCalledWith(
      expect.objectContaining({ patch: {} }),
    )
  })

  it('PATCH reports a concurrent move or removal as 409', async () => {
    dbMocks.getStaffMemberAtBranch.mockResolvedValue(member())
    dbMocks.updateStaffMemberAtBranch.mockResolvedValue(null)
    const res = await staffIdRoute.PATCH(
      jsonReq(`${URL_BASE}/st_sty1`, 'PATCH', { branchId: 'rs', bio: 'x' }),
      params('st_sty1'),
    )
    expect(res.status).toBe(409)
  })
})

describe('POST /api/staff/[id]/remove', () => {
  it('returns a Stylist to Customer and reports the bookings the removal released', async () => {
    dbMocks.getStaffMemberAtBranch.mockResolvedValue(member())
    // The same transaction took them off 3 confirmed bookings (R1.7).
    dbMocks.applyBranchRolePlan.mockResolvedValue({
      ok: true,
      signedOut: ['sty1'],
      reassignments: 3,
    })
    revokeLiveUpdates.mockResolvedValue('stopped')

    const res = await staffRemoveRoute.POST(
      jsonReq(`${URL_BASE}/st_sty1/remove`, 'POST', { branchId: 'rs' }),
      params('st_sty1'),
    )

    expect((await res.json()).data).toEqual({
      changed: true,
      reassignments: 3,
      liveUpdates: 'stopped',
    })
    // Counted by the removal itself, not read again afterwards.
    expect(dbMocks.countUpcomingAssignments).not.toHaveBeenCalled()
    // The removed Stylist's live-update tokens are revoked (R2.6).
    expect(revokeLiveUpdates).toHaveBeenCalledWith(['sty1'])
    const [{ writes }] = dbMocks.applyBranchRolePlan.mock.calls[0] ?? [{}]
    expect(writes).toEqual([
      { kind: 'profile_deactivate', userId: 'sty1' },
      { kind: 'user_role', userId: 'sty1', from: 'staff', to: 'customer' },
      { kind: 'end_sessions', userId: 'sty1' },
    ])
  })

  it('sends the Receptionist and the Manager to Users & Roles', async () => {
    dbMocks.getStaffMemberAtBranch.mockResolvedValue(
      member({ id: 'st_rec1', userId: 'rec1', roleWitness: 'receptionist' }),
    )
    const res = await staffRemoveRoute.POST(
      jsonReq(`${URL_BASE}/st_rec1/remove`, 'POST', { branchId: 'rs' }),
      params('st_rec1'),
    )
    expect(res.status).toBe(400)
    expect(dbMocks.applyBranchRolePlan).not.toHaveBeenCalled()
  })

  it('→ 404 for someone who does not work here', async () => {
    dbMocks.getStaffMemberAtBranch.mockResolvedValue(null)
    const res = await staffRemoveRoute.POST(
      jsonReq(`${URL_BASE}/x/remove`, 'POST', { branchId: 'rs' }),
      params('x'),
    )
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/staff/[id]/services', () => {
  it('replaces the services of a Stylist here', async () => {
    dbMocks.getStaffMemberAtBranch.mockResolvedValue(member())
    dbMocks.getServicesByIds.mockResolvedValue([{ id: 'svc1' }, { id: 'svc2' }])
    dbMocks.setStaffServices.mockResolvedValue(['svc1', 'svc2'])

    const res = await staffServicesRoute.PUT(
      jsonReq(`${URL_BASE}/st_sty1/services`, 'PUT', {
        branchId: 'rs',
        serviceIds: ['svc1', 'svc2'],
      }),
      params('st_sty1'),
    )

    expect((await res.json()).data).toEqual({ staffId: 'st_sty1', serviceIds: ['svc1', 'svc2'] })
    expect(dbMocks.setStaffServices).toHaveBeenCalledWith('st_sty1', ['svc1', 'svc2'])
  })

  it('rejects a non-existent serviceId with 400', async () => {
    dbMocks.getStaffMemberAtBranch.mockResolvedValue(member())
    dbMocks.getServicesByIds.mockResolvedValue([{ id: 'svc1' }])
    const res = await staffServicesRoute.PUT(
      jsonReq(`${URL_BASE}/st_sty1/services`, 'PUT', {
        branchId: 'rs',
        serviceIds: ['svc1', 'ghost'],
      }),
      params('st_sty1'),
    )
    expect(res.status).toBe(400)
    expect(dbMocks.setStaffServices).not.toHaveBeenCalled()
  })

  it('→ 404 for someone at another branch and 403 for a Manager on the Receptionist', async () => {
    dbMocks.getStaffMemberAtBranch.mockResolvedValue(null)
    const missing = await staffServicesRoute.PUT(
      jsonReq(`${URL_BASE}/x/services`, 'PUT', { branchId: 'rs', serviceIds: [] }),
      params('x'),
    )
    expect(missing.status).toBe(404)

    dbMocks.getStaffMemberAtBranch.mockResolvedValue(member({ roleWitness: 'receptionist' }))
    const refused = await staffServicesRoute.PUT(
      jsonReq(`${URL_BASE}/st_rec1/services`, 'PUT', { branchId: 'rs', serviceIds: [] }),
      params('st_rec1'),
    )
    expect(refused.status).toBe(403)
    expect(dbMocks.setStaffServices).not.toHaveBeenCalled()
  })
})
