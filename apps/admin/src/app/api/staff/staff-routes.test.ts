// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : staff-routes.test
 * Scope        : Unit tests for the admin Staff management API routes
 *
 * Description  : Verifies the full Staff management surface —
 *                GET /api/staff (active picker, Receptionist+),
 *                POST /api/staff (create by email: 201, unknown email → 404,
 *                already-staff → 409, validation → 400),
 *                GET /api/staff/all (roster + service counts),
 *                GET|PATCH /api/staff/[id] (profile + serviceIds, update,
 *                404, 400), and PUT /api/staff/[id]/services (replace
 *                capabilities incl. referential validation) — plus the
 *                response envelope and RBAC (401 unauthenticated /
 *                403 forbidden). Session + DB are mocked; no live session/DB.
 *
 * Layer        : Testing
 *
 * Notes        : Node environment (server route handlers). @rgss/types stays
 *                REAL so the Zod schemas are genuinely exercised.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireSession: vi.fn(),
  getOptionalSession: vi.fn(),
}))

const dbMocks = vi.hoisted(() => ({
  getActiveStaff: vi.fn(),
  createStaffProfile: vi.fn(),
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
import * as staffRoute from '@/app/api/staff/route'

const MANAGER = { user: { id: 'u_mgr', role: 'manager' } }

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

beforeEach(() => {
  vi.clearAllMocks()
  sessionMocks.requireRole.mockResolvedValue(MANAGER)
  sessionMocks.requireSession.mockResolvedValue(MANAGER)
})

describe('GET /api/staff — active picker', () => {
  it('returns the lean active-staff list (Receptionist+)', async () => {
    dbMocks.getActiveStaff.mockResolvedValue([
      { id: 'st1', name: 'Asha', designation: 'stylist', extra: 'dropped' },
    ])

    const res = await staffRoute.GET(new Request('https://admin.theroyalglow.in/api/staff'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: { staff: [{ id: 'st1', name: 'Asha', designation: 'stylist' }] },
    })
  })

  it('→ 401 when unauthenticated', async () => {
    sessionMocks.requireRole.mockRejectedValue(unauthenticated())
    const res = await staffRoute.GET(new Request('https://admin.theroyalglow.in/api/staff'))
    expect(res.status).toBe(401)
    expect(dbMocks.getActiveStaff).not.toHaveBeenCalled()
  })
})

describe('POST /api/staff — create by email', () => {
  it('creates a staff profile and returns 201 with the envelope', async () => {
    dbMocks.createStaffProfile.mockResolvedValue({
      ok: true,
      staff: { id: 'st9', designation: 'therapist' },
    })

    const res = await staffRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/staff', 'POST', {
        email: 'New.Hire@Example.com',
        designation: 'therapist',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body).toEqual({
      success: true,
      data: { staff: { id: 'st9', designation: 'therapist' } },
    })
    // Email is normalised (trim + lowercase) by the Zod schema before the query.
    expect(dbMocks.createStaffProfile).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new.hire@example.com', designation: 'therapist' }),
    )
  })

  it('→ 404 when no account exists for the email', async () => {
    dbMocks.createStaffProfile.mockResolvedValue({ ok: false, reason: 'user_not_found' })

    const res = await staffRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/staff', 'POST', {
        email: 'ghost@example.com',
        designation: 'stylist',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toMatchObject({ code: ERROR_CODES.NOT_FOUND, statusCode: 404 })
    expect(body.error.message).toMatch(/sign in first/i)
  })

  it('→ 409 when the account is already a staff member', async () => {
    dbMocks.createStaffProfile.mockResolvedValue({ ok: false, reason: 'already_staff' })

    const res = await staffRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/staff', 'POST', {
        email: 'asha@example.com',
        designation: 'stylist',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toMatchObject({ code: ERROR_CODES.CONFLICT, statusCode: 409 })
  })

  it('rejects an invalid designation with the 400 envelope', async () => {
    const res = await staffRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/staff', 'POST', {
        email: 'asha@example.com',
        designation: 'barber',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 })
    expect(dbMocks.createStaffProfile).not.toHaveBeenCalled()
  })

  it('rejects a malformed email with 400', async () => {
    const res = await staffRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/staff', 'POST', {
        email: 'not-an-email',
        designation: 'stylist',
      }),
    )
    expect(res.status).toBe(400)
    expect(dbMocks.createStaffProfile).not.toHaveBeenCalled()
  })

  it('→ 403 for a non-manager', async () => {
    sessionMocks.requireRole.mockRejectedValue(forbidden())
    const res = await staffRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/staff', 'POST', {
        email: 'asha@example.com',
        designation: 'stylist',
      }),
    )
    expect(res.status).toBe(403)
    expect(dbMocks.createStaffProfile).not.toHaveBeenCalled()
  })
})

describe('GET /api/staff/all — roster', () => {
  it('returns the roster with service counts', async () => {
    dbMocks.getStaffForAdmin.mockResolvedValue([{ id: 'st1', name: 'Asha', serviceCount: 3 }])

    const res = await staffAllRoute.GET(new Request('https://admin.theroyalglow.in/api/staff/all'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({ staff: [{ id: 'st1', name: 'Asha', serviceCount: 3 }] })
  })

  it('→ 403 for a non-manager', async () => {
    sessionMocks.requireRole.mockRejectedValue(forbidden())
    const res = await staffAllRoute.GET(new Request('https://admin.theroyalglow.in/api/staff/all'))
    expect(res.status).toBe(403)
    expect(dbMocks.getStaffForAdmin).not.toHaveBeenCalled()
  })
})

describe('GET|PATCH /api/staff/[id]', () => {
  it('GET returns the profile + serviceIds', async () => {
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
    expect(body.data).toEqual({ staff: { id: 'st1', name: 'Asha', serviceIds: ['svc1', 'svc2'] } })
  })

  it('GET → 404 when the staff member is missing', async () => {
    dbMocks.getStaffProfileById.mockResolvedValue(null)
    const res = await staffIdRoute.GET(
      new Request('https://admin.theroyalglow.in/api/staff/missing'),
      { params: Promise.resolve({ id: 'missing' }) },
    )
    expect(res.status).toBe(404)
  })

  it('PATCH updates editable fields and calls updateStaffProfile', async () => {
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

  it('PATCH rejects an invalid designation with 400', async () => {
    const res = await staffIdRoute.PATCH(
      jsonReq('https://admin.theroyalglow.in/api/staff/st1', 'PATCH', { designation: 'barber' }),
      { params: Promise.resolve({ id: 'st1' }) },
    )
    expect(res.status).toBe(400)
    expect(dbMocks.updateStaffProfile).not.toHaveBeenCalled()
  })

  it('PATCH → 404 when the staff member is missing', async () => {
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
    const res = await staffIdRoute.GET(new Request('https://admin.theroyalglow.in/api/staff/st1'), {
      params: Promise.resolve({ id: 'st1' }),
    })
    expect(res.status).toBe(403)
    expect(dbMocks.getStaffProfileById).not.toHaveBeenCalled()
  })
})

describe('PUT /api/staff/[id]/services — replace capabilities', () => {
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

  it('accepts an empty serviceIds array (clears capabilities, skips existence check)', async () => {
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
