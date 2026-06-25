// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : settings-routes.test
 * Scope        : Unit tests for admin Settings routes
 *
 * Description  : Verifies GET /api/settings (returns defaults when unset) and
 *                PUT /api/settings (each section: valid → saved; invalid
 *                section/value → 400), plus RBAC (401 unauthenticated /
 *                403 under-privileged) and the response envelope. Session + DB
 *                queries mocked; @rgss/types stays REAL so the section schemas
 *                are genuinely exercised.
 *
 * Layer        : Testing
 *
 * Notes        : Node environment. SETTING_KEYS is provided by the db mock so
 *                the route's section→key mapping resolves.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { DEFAULT_BOOKING_RULES, DEFAULT_BUSINESS_HOURS, DEFAULT_GST } from '@rgss/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireSession: vi.fn(),
  getOptionalSession: vi.fn(),
}))

const dbMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getSetting: vi.fn(),
  upsertSetting: vi.fn(),
  SETTING_KEYS: { businessHours: 'business_hours', gst: 'gst', bookingRules: 'booking_rules' },
}))

vi.mock('@/lib/api/session', () => sessionMocks)
vi.mock('@rgss/db/queries', () => dbMocks)

import * as settingsRoute from '@/app/api/settings/route'

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

const URL = 'https://admin.theroyalglow.in/api/settings'

beforeEach(() => {
  vi.clearAllMocks()
  sessionMocks.requireRole.mockResolvedValue(MANAGER)
  sessionMocks.requireSession.mockResolvedValue(MANAGER)
})

describe('GET /api/settings', () => {
  it('returns the full settings object with defaults when unset', async () => {
    dbMocks.getSettings.mockResolvedValue({
      businessHours: DEFAULT_BUSINESS_HOURS,
      gst: DEFAULT_GST,
      bookingRules: DEFAULT_BOOKING_RULES,
    })

    const res = await settingsRoute.GET(new Request(URL))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: {
        settings: {
          businessHours: DEFAULT_BUSINESS_HOURS,
          gst: DEFAULT_GST,
          bookingRules: DEFAULT_BOOKING_RULES,
        },
      },
    })
    expect(dbMocks.getSettings).toHaveBeenCalledOnce()
  })

  it('→ 401 when unauthenticated', async () => {
    sessionMocks.requireRole.mockRejectedValue(unauthenticated())
    const res = await settingsRoute.GET(new Request(URL))
    expect(res.status).toBe(401)
    expect(dbMocks.getSettings).not.toHaveBeenCalled()
  })

  it('→ 403 for a non-manager', async () => {
    sessionMocks.requireRole.mockRejectedValue(forbidden())
    const res = await settingsRoute.GET(new Request(URL))
    expect(res.status).toBe(403)
    expect(dbMocks.getSettings).not.toHaveBeenCalled()
  })
})

describe('PUT /api/settings — per-section update', () => {
  it('saves businessHours (valid → saved) and returns the stored value', async () => {
    const value = {
      ...DEFAULT_BUSINESS_HOURS,
      sun: { open: null, close: null, closed: true },
    }
    dbMocks.upsertSetting.mockResolvedValue({ key: 'business_hours', value })

    const res = await settingsRoute.PUT(jsonReq(URL, 'PUT', { section: 'businessHours', value }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({ section: 'businessHours', value })
    expect(dbMocks.upsertSetting).toHaveBeenCalledWith('business_hours', value, 'u_mgr')
  })

  it('saves gst (valid → saved)', async () => {
    const value = { ratePercent: 12, inclusive: true }
    dbMocks.upsertSetting.mockResolvedValue({ key: 'gst', value })

    const res = await settingsRoute.PUT(jsonReq(URL, 'PUT', { section: 'gst', value }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({ section: 'gst', value })
    expect(dbMocks.upsertSetting).toHaveBeenCalledWith('gst', value, 'u_mgr')
  })

  it('saves bookingRules (valid → saved)', async () => {
    const value = {
      minAdvanceLeadTimeMinutes: 30,
      maxAdvanceBookingDays: 14,
      cancellationCutoffHours: 6,
      maxActiveBookingsPerCustomer: 2,
    }
    dbMocks.upsertSetting.mockResolvedValue({ key: 'booking_rules', value })

    const res = await settingsRoute.PUT(jsonReq(URL, 'PUT', { section: 'bookingRules', value }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({ section: 'bookingRules', value })
    expect(dbMocks.upsertSetting).toHaveBeenCalledWith('booking_rules', value, 'u_mgr')
  })

  it('rejects an unknown section with 400', async () => {
    const res = await settingsRoute.PUT(jsonReq(URL, 'PUT', { section: 'nope', value: {} }))
    expect(res.status).toBe(400)
    expect(dbMocks.upsertSetting).not.toHaveBeenCalled()
  })

  it('rejects an out-of-range GST rate with 400', async () => {
    const res = await settingsRoute.PUT(
      jsonReq(URL, 'PUT', { section: 'gst', value: { ratePercent: 200, inclusive: true } }),
    )
    expect(res.status).toBe(400)
    expect(dbMocks.upsertSetting).not.toHaveBeenCalled()
  })

  it('rejects a malformed business-hours time with 400', async () => {
    const value = {
      ...DEFAULT_BUSINESS_HOURS,
      mon: { open: '25:00', close: '21:00', closed: false },
    }
    const res = await settingsRoute.PUT(jsonReq(URL, 'PUT', { section: 'businessHours', value }))
    expect(res.status).toBe(400)
    expect(dbMocks.upsertSetting).not.toHaveBeenCalled()
  })

  it('rejects a business-hours day where close ≤ open with 400', async () => {
    const value = {
      ...DEFAULT_BUSINESS_HOURS,
      tue: { open: '21:00', close: '10:00', closed: false },
    }
    const res = await settingsRoute.PUT(jsonReq(URL, 'PUT', { section: 'businessHours', value }))
    expect(res.status).toBe(400)
    expect(dbMocks.upsertSetting).not.toHaveBeenCalled()
  })

  it('→ 403 for a non-manager', async () => {
    sessionMocks.requireRole.mockRejectedValue(forbidden())
    const res = await settingsRoute.PUT(jsonReq(URL, 'PUT', { section: 'gst', value: DEFAULT_GST }))
    expect(res.status).toBe(403)
    expect(dbMocks.upsertSetting).not.toHaveBeenCalled()
  })

  it('→ 401 when unauthenticated', async () => {
    sessionMocks.requireRole.mockRejectedValue(unauthenticated())
    const res = await settingsRoute.PUT(jsonReq(URL, 'PUT', { section: 'gst', value: DEFAULT_GST }))
    expect(res.status).toBe(401)
    expect(dbMocks.upsertSetting).not.toHaveBeenCalled()
  })
})
