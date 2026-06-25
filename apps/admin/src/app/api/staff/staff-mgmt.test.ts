// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : staff-mgmt.test
 * Scope        : Unit tests for the admin Staff management API routes
 *
 * Description  : Verifies GET /api/staff/all (roster + service counts),
 *                GET /api/staff/[id] (profile + serviceIds + 404),
 *                PATCH /api/staff/[id] (update + 404 + 400 validation), and
 *                PUT /api/staff/[id]/services (replace capabilities, incl.
 *                referential validation and that setStaffServices is called with
 *                the parsed serviceIds) — plus RBAC (Manager+) and the response
 *                envelope. Session + DB are mocked; no live session/DB.
 *
 * Layer        : Testing
 *
 * Notes        : Node environment (server route handlers). Manager+.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireSession: vi.fn(),
  getOptionalSession: vi.fn(),
}))

const dbMocks = vi.hoisted(() => ({
  getStaffForAdmin: vi.fn(),
  getStaffProfileById: vi.fn(),
  updateStaffProfile: vi.fn(),
  setStaffServices: vi.fn(),
  getServicesByIds: vi.fn(),
}))

vi.mock('@/lib/api/session', () => sessionMocks)
vi.mock('@rgss/db/queries', () => dbMocks)

import * as staffIdRoute from '@/app/api/staff/[id]/route'
import * as staffServicesRoute from '@/app/api/staff/[id]/services/route'
import * as staffAllRoute from '@/app/api/staff/all/route'

const MANAGER = { user: { id: 'u_mgr', role: 'manager' } }
const jsonReq = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

const forbidden = () =>
  new AppError({ code: ERROR_CODES.FORBIDDEN, message: 'no', statusCode: 403 })

beforeEach(() => {
  vi.clearAllMocks()
  sessionMocks.requireRole.mockResolvedValue(MANAGER)
  sessionMocks.requireSession.mockResolvedValue(MANAGER)
})

describe('GET /api/staff/all', () => {
  it('returns the roster with service counts', async () => {
    dbMocks.getStaffForAdmin.mockResolvedValue([{ id: 'st1', name: 'Asha', serviceCount: 3 }])

    const res = await staffAllRoute.GET(new Request('https://admin.theroyalglow.in/api/staff/all'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual({ staff: [{ id: 'st1', name: 'Asha', serviceCount: 3 }] })
  })

  it('→ 403 for a non-manager', async () => {
    sessionMocks.requireRole.mockRejectedValue(forbidden())
    const res = await staffAllRoute.GET(new Request('https://admin.theroyalglow.in/api/staff/all'))
    expect(res.status).toBe(403)
    expect(dbMocks.getStaffForAdmin).not.toHaveBeenCalled()
  })

  it('exports GET only', () => {
    expect(typeof staffAllRoute.GET).toBe('function')
    expect((staffAllRoute as Record<string, unknown>).POST).toBeUndefined()
  })
})

describe('GET /api/staff/[id]', () => {
  it('returns the staff profile + serviceIds', async () => {
    dbMocks.getStaffProfileById.mockResolvedValue({
      id: 'st1',
      name: 'Asha',
      serviceIds: ['svc1', 'svc2'],
    })

    const res = await staffIdRoute.GET(new Request('https://admin.theroyalglow.in/api/staff/st1'), {
      params: Promise.resolve({ id: 'st1' }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: { staff: { id: 'st1', name: 'Asha', serviceIds: ['svc1', 'svc2'] } },
    })
  })

  it('→ 404 when the staff member is missing', async () => {
    dbMocks.getStaffProfileById.mockResolvedValue(null)

    const res = await staffIdRoute.GET(
      new Request('https://admin.theroyalglow.in/api/staff/missing'),
      { params: Promise.resolve({ id: 'missing' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toMatchObject({ code: ERROR_CODES.NOT_FOUND, statusCode: 404 })
  })

  it('→ 403 when role is insufficient', async () => {
    sessionMocks.requireRole.mockRejectedValue(forbidden())
    const res = await staffIdRoute.GET(new Request('https://admin.theroyalglow.in/api/staff/st1'), {
      params: Promise.resolve({ id: 'st1' }),
    })
    expect(res.status).toBe(403)
    expect(dbMocks.getStaffProfileById).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/staff/[id]', () => {
  it('updates editable profile fields (200)', async () => {
    dbMocks.getStaffProfileById.mockResolvedValue({ id: 'st1', designation: 'stylist' })
    dbMocks.updateStaffProfile.mockResolvedValue({ id: 'st1', designation: 'therapist' })

    const res = await staffIdRoute.PATCH(
      jsonReq('https://admin.theroyalglow.in/api/staff/st1', 'PATCH', {
        designation: 'therapist',
        isActive: true,
      }),
      { params: Promise.resolve({ id: 'st1' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({ staff: { id: 'st1', designation: 'therapist' } })
    expect(dbMocks.updateStaffProfile).toHaveBeenCalledWith(
      'st1',
      expect.objectContaining({ designation: 'therapist', isActive: true }),
    )
  })

  it('rejects an invalid designation with the 400 envelope', async () => {
    const res = await staffIdRoute.PATCH(
      jsonReq('https://admin.theroyalglow.in/api/staff/st1', 'PATCH', { designation: 'barber' }),
      { params: Promise.resolve({ id: 'st1' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 })
    expect(dbMocks.updateStaffProfile).not.toHaveBeenCalled()
  })

  it('→ 404 when the staff member is missing', async () => {
    dbMocks.getStaffProfileById.mockResolvedValue(null)
    const res = await staffIdRoute.PATCH(
      jsonReq('https://admin.theroyalglow.in/api/staff/missing', 'PATCH', { isActive: false }),
      { params: Promise.resolve({ id: 'missing' }) },
    )
    expect(res.status).toBe(404)
    expect(dbMocks.updateStaffProfile).not.toHaveBeenCalled()
  })

  it('→ 403 for a non-manager', async () => {
    sessionMocks.requireRole.mockRejectedValue(forbidden())
    const res = await staffIdRoute.PATCH(
      jsonReq('https://admin.theroyalglow.in/api/staff/st1', 'PATCH', { isActive: false }),
      { params: Promise.resolve({ id: 'st1' }) },
    )
    expect(res.status).toBe(403)
  })
})

describe('PUT /api/staff/[id]/services', () => {
  it('replaces capabilities and calls setStaffServices with the parsed serviceIds', async () => {
    dbMocks.getStaffProfileById.mockResolvedValue({ id: 'st1' })
    dbMocks.getServicesByIds.mockResolvedValue([{ id: 'svc1' }, { id: 'svc2' }])
    dbMocks.setStaffServices.mockResolvedValue(['svc1', 'svc2'])

    const res = await staffServicesRoute.PUT(
      jsonReq('https://admin.theroyalglow.in/api/staff/st1/services', 'PUT', {
        serviceIds: ['svc1', 'svc2'],
      }),
      { params: Promise.resolve({ id: 'st1' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({ staffId: 'st1', serviceIds: ['svc1', 'svc2'] })
    expect(dbMocks.setStaffServices).toHaveBeenCalledWith('st1', ['svc1', 'svc2'])
  })

  it('accepts an empty serviceIds array (clears capabilities)', async () => {
    dbMocks.getStaffProfileById.mockResolvedValue({ id: 'st1' })
    dbMocks.setStaffServices.mockResolvedValue([])

    const res = await staffServicesRoute.PUT(
      jsonReq('https://admin.theroyalglow.in/api/staff/st1/services', 'PUT', { serviceIds: [] }),
      { params: Promise.resolve({ id: 'st1' }) },
    )
    expect(res.status).toBe(200)
    expect(dbMocks.setStaffServices).toHaveBeenCalledWith('st1', [])
    expect(dbMocks.getServicesByIds).not.toHaveBeenCalled()
  })

  it('rejects a non-existent serviceId with 400', async () => {
    dbMocks.getStaffProfileById.mockResolvedValue({ id: 'st1' })
    dbMocks.getServicesByIds.mockResolvedValue([{ id: 'svc1' }])

    const res = await staffServicesRoute.PUT(
      jsonReq('https://admin.theroyalglow.in/api/staff/st1/services', 'PUT', {
        serviceIds: ['svc1', 'ghost'],
      }),
      { params: Promise.resolve({ id: 'st1' }) },
    )
    expect(res.status).toBe(400)
    expect(dbMocks.setStaffServices).not.toHaveBeenCalled()
  })

  it('rejects a malformed payload with the 400 envelope', async () => {
    const res = await staffServicesRoute.PUT(
      jsonReq('https://admin.theroyalglow.in/api/staff/st1/services', 'PUT', {
        serviceIds: 'nope',
      }),
      { params: Promise.resolve({ id: 'st1' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 })
    expect(dbMocks.setStaffServices).not.toHaveBeenCalled()
  })

  it('→ 404 when the staff member is missing', async () => {
    dbMocks.getStaffProfileById.mockResolvedValue(null)
    const res = await staffServicesRoute.PUT(
      jsonReq('https://admin.theroyalglow.in/api/staff/missing/services', 'PUT', {
        serviceIds: ['svc1'],
      }),
      { params: Promise.resolve({ id: 'missing' }) },
    )
    expect(res.status).toBe(404)
    expect(dbMocks.setStaffServices).not.toHaveBeenCalled()
  })

  it('→ 403 for a non-manager', async () => {
    sessionMocks.requireRole.mockRejectedValue(forbidden())
    const res = await staffServicesRoute.PUT(
      jsonReq('https://admin.theroyalglow.in/api/staff/st1/services', 'PUT', {
        serviceIds: ['svc1'],
      }),
      { params: Promise.resolve({ id: 'st1' }) },
    )
    expect(res.status).toBe(403)
    expect(dbMocks.setStaffServices).not.toHaveBeenCalled()
  })
})
