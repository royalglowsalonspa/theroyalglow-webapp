// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : branches-routes.test
 * Scope        : Unit tests for admin Branch management routes
 *
 * Description  : Verifies GET /api/branches (list), POST /api/branches
 *                (create 201 + invalid 400), PATCH /api/branches/[id]
 *                (update 200 + 404), plus RBAC — Owner+ is required
 *                (manager/lower → 403, asserts requireRole called with 'owner',
 *                401 unauthenticated). Session + DB mocked.
 *
 * Layer        : Testing
 *
 * Notes        : Node environment. @rgss/types stays REAL so branchCreateSchema /
 *                branchUpdateSchema validation is genuinely exercised.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireSession: vi.fn(),
  getOptionalSession: vi.fn(),
}))

const dbMocks = vi.hoisted(() => ({
  getBranches: vi.fn(),
  getBranchById: vi.fn(),
  createBranch: vi.fn(),
  updateBranch: vi.fn(),
}))

vi.mock('@/lib/api/session', () => sessionMocks)
vi.mock('@rgss/db/queries', () => dbMocks)

import * as branchIdRoute from '@/app/api/branches/[id]/route'
import * as branchRoute from '@/app/api/branches/route'

const OWNER = { user: { id: 'u_owner', role: 'owner' } }

const jsonReq = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

const forbidden = () =>
  new AppError({ code: ERROR_CODES.FORBIDDEN, message: 'no', statusCode: 403 })
const unauthenticated = () =>
  new AppError({ code: ERROR_CODES.UNAUTHENTICATED, message: 'sign in', statusCode: 401 })

const validBranch = {
  name: 'Marathahalli',
  addressLine1: '123 Outer Ring Road',
  pincode: '560037',
  phone: '+91 80 1234 5678',
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionMocks.requireRole.mockResolvedValue(OWNER)
  sessionMocks.requireSession.mockResolvedValue(OWNER)
})

describe('GET /api/branches — list', () => {
  it('returns all branches (Owner+)', async () => {
    dbMocks.getBranches.mockResolvedValue([
      { id: 'br1', code: 'RS', name: 'Rayasandra' },
      { id: 'br2', code: 'MH', name: 'Marathahalli' },
    ])

    const res = await branchRoute.GET(new Request('https://admin.theroyalglow.in/api/branches'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(sessionMocks.requireRole).toHaveBeenCalledWith('owner')
    expect(body.data.branches).toHaveLength(2)
  })

  it('→ 401 when unauthenticated', async () => {
    sessionMocks.requireRole.mockRejectedValue(unauthenticated())
    const res = await branchRoute.GET(new Request('https://admin.theroyalglow.in/api/branches'))
    expect(res.status).toBe(401)
    expect(dbMocks.getBranches).not.toHaveBeenCalled()
  })
})

describe('POST /api/branches — create', () => {
  it('creates a branch and returns 201', async () => {
    dbMocks.createBranch.mockResolvedValue({ id: 'br_new', code: 'MARATH', name: 'Marathahalli' })

    const res = await branchRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/branches', 'POST', validBranch),
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(sessionMocks.requireRole).toHaveBeenCalledWith('owner')
    expect(body).toEqual({
      success: true,
      data: { branch: { id: 'br_new', code: 'MARATH', name: 'Marathahalli' } },
    })
    expect(dbMocks.createBranch).toHaveBeenCalledOnce()
  })

  it('rejects invalid data with 400 (bad pincode)', async () => {
    const res = await branchRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/branches', 'POST', {
        ...validBranch,
        pincode: '12', // not a 6-digit pincode
      }),
    )
    expect(res.status).toBe(400)
    expect(dbMocks.createBranch).not.toHaveBeenCalled()
  })

  it('rejects missing required fields with 400', async () => {
    const res = await branchRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/branches', 'POST', { name: 'No Address' }),
    )
    expect(res.status).toBe(400)
    expect(dbMocks.createBranch).not.toHaveBeenCalled()
  })

  it('→ 403 for a non-owner (manager)', async () => {
    sessionMocks.requireRole.mockRejectedValue(forbidden())
    const res = await branchRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/branches', 'POST', validBranch),
    )
    expect(res.status).toBe(403)
    expect(sessionMocks.requireRole).toHaveBeenCalledWith('owner')
    expect(dbMocks.createBranch).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/branches/[id] — update + status change', () => {
  it('updates a branch status and returns 200', async () => {
    dbMocks.getBranchById.mockResolvedValue({ id: 'br1', status: 'operational' })
    dbMocks.updateBranch.mockResolvedValue({ id: 'br1', status: 'temporarily_closed' })

    const res = await branchIdRoute.PATCH(
      jsonReq('https://admin.theroyalglow.in/api/branches/br1', 'PATCH', {
        status: 'temporarily_closed',
      }),
      { params: Promise.resolve({ id: 'br1' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(sessionMocks.requireRole).toHaveBeenCalledWith('owner')
    expect(dbMocks.updateBranch).toHaveBeenCalledWith('br1', { status: 'temporarily_closed' })
    expect(body.data.branch.status).toBe('temporarily_closed')
  })

  it('→ 404 when the branch is missing', async () => {
    dbMocks.getBranchById.mockResolvedValue(null)
    const res = await branchIdRoute.PATCH(
      jsonReq('https://admin.theroyalglow.in/api/branches/missing', 'PATCH', {
        status: 'shutdown',
      }),
      { params: Promise.resolve({ id: 'missing' }) },
    )
    expect(res.status).toBe(404)
    expect(dbMocks.updateBranch).not.toHaveBeenCalled()
  })

  it('rejects an invalid status with 400', async () => {
    const res = await branchIdRoute.PATCH(
      jsonReq('https://admin.theroyalglow.in/api/branches/br1', 'PATCH', { status: 'paused' }),
      { params: Promise.resolve({ id: 'br1' }) },
    )
    expect(res.status).toBe(400)
    expect(dbMocks.getBranchById).not.toHaveBeenCalled()
    expect(dbMocks.updateBranch).not.toHaveBeenCalled()
  })

  it('→ 403 for a non-owner (manager)', async () => {
    sessionMocks.requireRole.mockRejectedValue(forbidden())
    const res = await branchIdRoute.PATCH(
      jsonReq('https://admin.theroyalglow.in/api/branches/br1', 'PATCH', { status: 'shutdown' }),
      { params: Promise.resolve({ id: 'br1' }) },
    )
    expect(res.status).toBe(403)
    expect(sessionMocks.requireRole).toHaveBeenCalledWith('owner')
  })
})
