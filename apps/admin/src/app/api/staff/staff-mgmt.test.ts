// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : staff-mgmt.test
 * Scope        : Unit tests for the Staff page API — permissions and envelopes
 *
 * Description  : Every Staff management route asks requireBranchRole for the
 *                Manager level at the active branch and touches no data when
 *                it refuses; malformed payloads get the 400 envelope; each
 *                route exports only its methods; an empty service list clears
 *                capabilities without an existence check. Behaviour per branch
 *                and per role is covered by staff-routes.test.ts.
 *
 * Layer        : Testing
 *
 * Notes        : Node environment (server route handlers). requireBranchRole
 *                and the db queries are mocked.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireBranchRole: vi.fn(), audit: vi.fn() }))

const dbMocks = vi.hoisted(() => ({
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
vi.mock('@rgss/db/queries', () => dbMocks)

import * as staffRemoveRoute from '@/app/api/staff/[id]/remove/route'
import * as staffIdRoute from '@/app/api/staff/[id]/route'
import * as staffServicesRoute from '@/app/api/staff/[id]/services/route'
import * as staffAllRoute from '@/app/api/staff/all/route'
import * as candidatesRoute from '@/app/api/staff/candidates/route'

const BASE = 'https://admin.theroyalglow.in/api/staff'

const MANAGER_CTX = {
  session: { user: { id: 'u_mgr' } },
  access: { userId: 'u_mgr', role: 'manager', branches: [] },
  branch: {
    id: 'rs',
    name: 'Rayasandra',
    code: 'RS',
    status: 'operational',
    isPrimary: true,
    role: 'manager',
  },
}

const jsonReq = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

const params = (id: string) => ({ params: Promise.resolve({ id }) })

const refused = () => new AppError({ code: ERROR_CODES.FORBIDDEN, message: 'no', statusCode: 403 })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireBranchRole.mockResolvedValue(MANAGER_CTX)
})

describe('permissions', () => {
  const calls: Array<[string, () => Promise<Response>]> = [
    ['GET /api/staff/all', () => staffAllRoute.GET(new Request(`${BASE}/all`))],
    [
      'GET /api/staff/candidates',
      () => candidatesRoute.GET(new Request(`${BASE}/candidates?search=asha`)),
    ],
    ['GET /api/staff/[id]', () => staffIdRoute.GET(new Request(`${BASE}/st1`), params('st1'))],
    [
      'PATCH /api/staff/[id]',
      () => staffIdRoute.PATCH(jsonReq(`${BASE}/st1`, 'PATCH', { branchId: 'rs' }), params('st1')),
    ],
    [
      'POST /api/staff/[id]/remove',
      () =>
        staffRemoveRoute.POST(
          jsonReq(`${BASE}/st1/remove`, 'POST', { branchId: 'rs' }),
          params('st1'),
        ),
    ],
    [
      'PUT /api/staff/[id]/services',
      () =>
        staffServicesRoute.PUT(
          jsonReq(`${BASE}/st1/services`, 'PUT', { branchId: 'rs', serviceIds: [] }),
          params('st1'),
        ),
    ],
  ]

  it.each(calls)('%s asks for the Manager level at the active branch', async (_name, call) => {
    dbMocks.getBranchStaff.mockResolvedValue([])
    dbMocks.searchUsers.mockResolvedValue([])
    dbMocks.getStaffMemberAtBranch.mockResolvedValue(null)
    await call()
    expect(mocks.requireBranchRole).toHaveBeenCalledWith('manager')
  })

  it.each(calls)('%s touches no data when refused', async (_name, call) => {
    mocks.requireBranchRole.mockRejectedValue(refused())
    const res = await call()
    expect(res.status).toBe(403)
    for (const query of Object.values(dbMocks)) {
      expect(query).not.toHaveBeenCalled()
    }
  })
})

describe('payloads and envelopes', () => {
  it('rejects a malformed services payload with the 400 envelope', async () => {
    const res = await staffServicesRoute.PUT(
      jsonReq(`${BASE}/st1/services`, 'PUT', { branchId: 'rs', serviceIds: 'nope' }),
      params('st1'),
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 })
    expect(dbMocks.setStaffServices).not.toHaveBeenCalled()
  })

  it('rejects an edit without the rendered branch', async () => {
    const res = await staffIdRoute.PATCH(
      jsonReq(`${BASE}/st1`, 'PATCH', { bio: 'x' }),
      params('st1'),
    )
    expect(res.status).toBe(400)
    expect(dbMocks.updateStaffMemberAtBranch).not.toHaveBeenCalled()
  })

  it('clears capabilities for an empty list without an existence check', async () => {
    dbMocks.getStaffMemberAtBranch.mockResolvedValue({ id: 'st1', roleWitness: 'staff' })
    dbMocks.setStaffServices.mockResolvedValue([])

    const res = await staffServicesRoute.PUT(
      jsonReq(`${BASE}/st1/services`, 'PUT', { branchId: 'rs', serviceIds: [] }),
      params('st1'),
    )

    expect(res.status).toBe(200)
    expect(dbMocks.setStaffServices).toHaveBeenCalledWith('st1', [])
    expect(dbMocks.getServicesByIds).not.toHaveBeenCalled()
  })

  it('exports only the methods each route supports', () => {
    expect(Object.keys(staffAllRoute)).toEqual(['GET'])
    expect(Object.keys(candidatesRoute)).toEqual(['GET'])
    expect(Object.keys(staffIdRoute).sort()).toEqual(['GET', 'PATCH'])
    expect(Object.keys(staffRemoveRoute)).toEqual(['POST'])
    expect(Object.keys(staffServicesRoute)).toEqual(['PUT'])
  })
})
