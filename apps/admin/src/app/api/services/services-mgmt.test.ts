// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : services-mgmt.test
 * Scope        : Unit tests for admin Service & Category routes post-CMS migration
 *
 * Description  : Service/category authoring moved to Payload CMS, so the admin
 *                write endpoints are retired. Verifies the four retired writes
 *                (POST /api/services, PATCH /api/services/[id],
 *                POST /api/service-categories, PATCH /api/service-categories/[id])
 *                answer 410 Gone with the standard error envelope and a message
 *                pointing at the CMS, and that the preserved read endpoints
 *                (GET /api/services, GET /api/services/all,
 *                GET /api/service-categories) still work.
 *
 * Layer        : Testing
 *
 * Notes        : Node environment. Session + DB mocked. The retired handlers must
 *                answer 410 WITHOUT touching the session or the DB — asserted
 *                explicitly, since a surviving write path is the real risk here.
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

import * as catIdRoute from '@/app/api/service-categories/[id]/route'
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

// Every retired write must answer with the standard error envelope, 410, the
// ENDPOINT_GONE code, and a message naming the CMS as the new authoring surface.
const expectGone = async (res: Response) => {
  const body = await res.json()
  expect(res.status).toBe(410)
  expect(body.success).toBe(false)
  expect(body.error).toMatchObject({
    code: ERROR_CODES.ENDPOINT_GONE,
    statusCode: 410,
    requestId: expect.any(String),
    retryable: false,
  })
  expect(body.error.message).toContain('Service management moved to CMS')
  expect(body.error.message).toContain('cms.theroyalglow.in')
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionMocks.requireRole.mockResolvedValue(MANAGER)
  sessionMocks.requireSession.mockResolvedValue(MANAGER)
})

describe('retired service write endpoints → 410 Gone', () => {
  it('POST /api/services → 410 and writes nothing', async () => {
    const res = await svcRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/services', 'POST', {
        categoryId: 'cat_salon',
        name: 'Haircut',
        durationMinutes: 45,
        pricePaise: 49_900,
      }),
    )

    await expectGone(res)
    expect(dbMocks.createService).not.toHaveBeenCalled()
    expect(sessionMocks.requireRole).not.toHaveBeenCalled()
  })

  it('PATCH /api/services/[id] → 410 and writes nothing', async () => {
    const res = await svcIdRoute.PATCH(
      jsonReq('https://admin.theroyalglow.in/api/services/svc1', 'PATCH', { isActive: false }),
      { params: Promise.resolve({ id: 'svc1' }) },
    )

    await expectGone(res)
    expect(dbMocks.updateService).not.toHaveBeenCalled()
    expect(dbMocks.getServiceById).not.toHaveBeenCalled()
  })

  it('POST /api/service-categories → 410 and writes nothing', async () => {
    const res = await catRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/service-categories', 'POST', {
        name: 'Hair',
        serviceType: 'salon',
      }),
    )

    await expectGone(res)
    expect(dbMocks.createServiceCategory).not.toHaveBeenCalled()
  })

  it('PATCH /api/service-categories/[id] → 410 and writes nothing', async () => {
    const res = await catIdRoute.PATCH(
      jsonReq('https://admin.theroyalglow.in/api/service-categories/cat1', 'PATCH', {
        name: 'Hair & Beauty',
      }),
      { params: Promise.resolve({ id: 'cat1' }) },
    )

    await expectGone(res)
    expect(dbMocks.updateServiceCategory).not.toHaveBeenCalled()
  })

  it('stays 410 even for a manager session and an invalid body', async () => {
    const res = await svcRoute.POST(
      jsonReq('https://admin.theroyalglow.in/api/services', 'POST', { serviceType: 'barber' }),
    )

    // A retired endpoint never validates: no 400, no 403 — always 410.
    await expectGone(res)
    expect(dbMocks.createService).not.toHaveBeenCalled()
  })
})

describe('preserved read endpoints', () => {
  it('GET /api/services returns the active catalogue grouped by category', async () => {
    dbMocks.getAllServicesGrouped.mockResolvedValue([{ id: 'cat1', services: [{ id: 'svc1' }] }])

    const res = await svcRoute.GET(new Request('https://admin.theroyalglow.in/api/services'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: { categories: [{ id: 'cat1', services: [{ id: 'svc1' }] }] },
    })
  })

  it('GET /api/services/all returns services + categories for management', async () => {
    dbMocks.getServicesForAdmin.mockResolvedValue([{ id: 'svc1' }])
    dbMocks.getServiceCategoriesAll.mockResolvedValue([{ id: 'cat1' }])

    const res = await svcAllRoute.GET(new Request('https://admin.theroyalglow.in/api/services/all'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({ services: [{ id: 'svc1' }], categories: [{ id: 'cat1' }] })
  })

  it('GET /api/service-categories lists all categories', async () => {
    dbMocks.getServiceCategoriesAll.mockResolvedValue([{ id: 'cat1', name: 'Hair' }])

    const res = await catRoute.GET(
      new Request('https://admin.theroyalglow.in/api/service-categories'),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({ categories: [{ id: 'cat1', name: 'Hair' }] })
  })

  it('GET /api/service-categories → 403 for a non-manager', async () => {
    sessionMocks.requireRole.mockRejectedValue(forbidden())

    const res = await catRoute.GET(
      new Request('https://admin.theroyalglow.in/api/service-categories'),
    )

    expect(res.status).toBe(403)
    expect(dbMocks.getServiceCategoriesAll).not.toHaveBeenCalled()
  })
})
