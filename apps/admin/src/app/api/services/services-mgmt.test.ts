// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : services-mgmt.test
 * Scope        : Unit tests for admin Service & Category management routes
 *
 * Description  : Verifies POST /api/services + PATCH /api/services/[id]
 *                (incl. the SPA 30/60 slot-length rule and Salon 5-min steps),
 *                GET /api/services/all, and POST /api/service-categories — plus
 *                RBAC (Manager+) and the response envelope. Session + DB mocked.
 *
 * Layer        : Testing
 *
 * Notes        : Node environment. @rgss/types stays REAL (pure validators incl.
 *                isValidDurationForType), so the SPA rule is genuinely exercised.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireSession: vi.fn(),
  getOptionalSession: vi.fn(),
}))

const dbMocks = vi.hoisted(() => ({
  getAllServicesGrouped: vi.fn(),
  getServicesForAdmin: vi.fn(),
  getServiceCategoriesAll: vi.fn(),
  getServiceCategoryById: vi.fn(),
  getServiceById: vi.fn(),
  createService: vi.fn(),
  updateService: vi.fn(),
  createServiceCategory: vi.fn(),
  updateServiceCategory: vi.fn(),
}))

vi.mock('@/lib/api/session', () => sessionMocks)
vi.mock('@rgss/db/queries', () => dbMocks)

import * as catRoute from '@/app/api/service-categories/route'
import * as svcIdRoute from '@/app/api/services/[id]/route'
import * as svcAllRoute from '@/app/api/services/all/route'
import * as svcRoute from '@/app/api/services/route'

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

describe('POST /api/services — create + slot-length rule', () => {
  it('creates a Salon service with a 5-minute-step duration', async () => {
    dbMocks.getServiceCategoryById.mockResolvedValue({ id: 'cat_salon', serviceType: 'salon' })
    dbMocks.createService.mockResolvedValue({ id: 'svc1', name: 'Haircut' })

    const res = await svcRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/services', 'POST', {
        categoryId: 'cat_salon',
        name: 'Haircut',
        durationMinutes: 45,
        pricePaise: 49900,
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body).toEqual({ success: true, data: { service: { id: 'svc1', name: 'Haircut' } } })
    expect(dbMocks.createService).toHaveBeenCalledOnce()
  })

  it('rejects a SPA service that is not 30 or 60 minutes', async () => {
    dbMocks.getServiceCategoryById.mockResolvedValue({ id: 'cat_spa', serviceType: 'spa' })

    const res = await svcRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/services', 'POST', {
        categoryId: 'cat_spa',
        name: 'Aroma Massage',
        durationMinutes: 45,
        pricePaise: 150000,
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.message).toMatch(/30 or 60/)
    expect(dbMocks.createService).not.toHaveBeenCalled()
  })

  it('accepts a SPA service of 60 minutes', async () => {
    dbMocks.getServiceCategoryById.mockResolvedValue({ id: 'cat_spa', serviceType: 'spa' })
    dbMocks.createService.mockResolvedValue({ id: 'svc2' })

    const res = await svcRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/services', 'POST', {
        categoryId: 'cat_spa',
        name: 'Deep Tissue',
        durationMinutes: 60,
        pricePaise: 200000,
      }),
    )
    expect(res.status).toBe(201)
  })

  it('rejects an unknown category with 400', async () => {
    dbMocks.getServiceCategoryById.mockResolvedValue(null)
    const res = await svcRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/services', 'POST', {
        categoryId: 'nope',
        name: 'X',
        durationMinutes: 30,
        pricePaise: 100,
      }),
    )
    expect(res.status).toBe(400)
    expect(dbMocks.createService).not.toHaveBeenCalled()
  })

  it('→ 403 for a non-manager', async () => {
    sessionMocks.requireRole.mockRejectedValue(forbidden())
    const res = await svcRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/services', 'POST', {
        categoryId: 'c',
        name: 'X',
        durationMinutes: 30,
        pricePaise: 100,
      }),
    )
    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/services/[id] — update + rule revalidation', () => {
  it('rejects changing a SPA service to 45 minutes', async () => {
    dbMocks.getServiceById.mockResolvedValue({
      id: 'svc1',
      categoryId: 'cat_spa',
      durationMinutes: 60,
    })
    dbMocks.getServiceCategoryById.mockResolvedValue({ id: 'cat_spa', serviceType: 'spa' })

    const res = await svcIdRoute.PATCH(
      jsonReq('https://admin.theroyalglow.in/api/services/svc1', 'PATCH', { durationMinutes: 45 }),
      { params: Promise.resolve({ id: 'svc1' }) },
    )
    expect(res.status).toBe(400)
    expect(dbMocks.updateService).not.toHaveBeenCalled()
  })

  it('deactivates a service (isActive=false) without touching duration', async () => {
    dbMocks.getServiceById.mockResolvedValue({
      id: 'svc1',
      categoryId: 'cat_salon',
      durationMinutes: 45,
    })
    dbMocks.getServiceCategoryById.mockResolvedValue({ id: 'cat_salon', serviceType: 'salon' })
    dbMocks.updateService.mockResolvedValue({ id: 'svc1', isActive: false })

    const res = await svcIdRoute.PATCH(
      jsonReq('https://admin.theroyalglow.in/api/services/svc1', 'PATCH', { isActive: false }),
      { params: Promise.resolve({ id: 'svc1' }) },
    )
    expect(res.status).toBe(200)
    expect(dbMocks.updateService).toHaveBeenCalledWith('svc1', { isActive: false })
  })

  it('→ 404 when the service is missing', async () => {
    dbMocks.getServiceById.mockResolvedValue(null)
    const res = await svcIdRoute.PATCH(
      jsonReq('https://admin.theroyalglow.in/api/services/missing', 'PATCH', { isActive: false }),
      { params: Promise.resolve({ id: 'missing' }) },
    )
    expect(res.status).toBe(404)
  })
})

describe('GET /api/services/all + categories', () => {
  it('returns services + categories for management', async () => {
    dbMocks.getServicesForAdmin.mockResolvedValue([{ id: 'svc1' }])
    dbMocks.getServiceCategoriesAll.mockResolvedValue([{ id: 'cat1' }])

    const res = await svcAllRoute.GET(new Request('https://admin.theroyalglow.in/api/services/all'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({ services: [{ id: 'svc1' }], categories: [{ id: 'cat1' }] })
  })

  it('POST /api/service-categories creates a category (201)', async () => {
    dbMocks.createServiceCategory.mockResolvedValue({ id: 'cat_new', name: 'Hair' })
    const res = await catRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/service-categories', 'POST', {
        name: 'Hair',
        serviceType: 'salon',
      }),
    )
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.data).toEqual({ category: { id: 'cat_new', name: 'Hair' } })
  })

  it('POST /api/service-categories rejects an invalid type', async () => {
    const res = await catRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/service-categories', 'POST', {
        name: 'Hair',
        serviceType: 'barber',
      }),
    )
    expect(res.status).toBe(400)
    expect(dbMocks.createServiceCategory).not.toHaveBeenCalled()
  })
})
