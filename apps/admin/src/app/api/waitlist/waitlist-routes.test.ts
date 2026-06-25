// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : waitlist-routes.test
 * Scope        : Unit tests for the admin Waitlist API routes
 *
 * Description  : Verifies GET /api/waitlist (list + pagination meta + status
 *                filter) and PATCH /api/waitlist/[id] (valid transition,
 *                illegal transition rejected, 404 missing), plus the RBAC guard
 *                (401 unauthenticated / 403 forbidden) and the response
 *                envelope. Session + DB are mocked; no live session/DB.
 *
 * Layer        : Testing
 *
 * Notes        : Node environment (server route handlers). Receptionist+.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireSession: vi.fn(),
  getOptionalSession: vi.fn(),
}))

const dbMocks = vi.hoisted(() => ({
  getWaitlist: vi.fn(),
  getWaitlistEntryById: vi.fn(),
  updateWaitlistStatus: vi.fn(),
}))

vi.mock('@/lib/api/session', () => sessionMocks)
vi.mock('@rgss/db/queries', () => dbMocks)

import * as waitlistIdRoute from '@/app/api/waitlist/[id]/route'
import * as waitlistRoute from '@/app/api/waitlist/route'

const AUTHORIZED = { user: { id: 'u_admin', role: 'receptionist' } }

const unauthenticated = () =>
  new AppError({
    code: ERROR_CODES.UNAUTHENTICATED,
    message: 'You must be signed in.',
    statusCode: 401,
  })

const forbidden = () =>
  new AppError({
    code: ERROR_CODES.FORBIDDEN,
    message: 'You do not have permission to perform this action.',
    statusCode: 403,
  })

const patch = (id: string, body: unknown) =>
  waitlistIdRoute.PATCH(
    new Request(`https://admin.theroyalglow.in/api/waitlist/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )

beforeEach(() => {
  vi.clearAllMocks()
  sessionMocks.requireRole.mockResolvedValue(AUTHORIZED)
  sessionMocks.requireSession.mockResolvedValue(AUTHORIZED)
})

describe('GET /api/waitlist', () => {
  it('returns waitlist entries with pagination meta', async () => {
    dbMocks.getWaitlist.mockResolvedValue({
      rows: [{ id: 'w1', status: 'waiting', customerName: 'Asha' }],
      totalCount: 1,
    })

    const res = await waitlistRoute.GET(new Request('https://admin.theroyalglow.in/api/waitlist'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual({ entries: [{ id: 'w1', status: 'waiting', customerName: 'Asha' }] })
    expect(body.meta).toMatchObject({ page: 1, totalPages: 1, totalCount: 1 })
  })

  it('forwards the status + pagination filters to the query', async () => {
    dbMocks.getWaitlist.mockResolvedValue({ rows: [], totalCount: 0 })

    await waitlistRoute.GET(
      new Request('https://admin.theroyalglow.in/api/waitlist?status=notified&page=2&pageSize=10'),
    )

    expect(dbMocks.getWaitlist).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'notified', page: 2, pageSize: 10 }),
    )
  })

  it('rejects an invalid status with the 400 envelope', async () => {
    const res = await waitlistRoute.GET(
      new Request('https://admin.theroyalglow.in/api/waitlist?status=banana'),
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 })
    expect(dbMocks.getWaitlist).not.toHaveBeenCalled()
  })

  it('→ 401 when unauthenticated', async () => {
    sessionMocks.requireRole.mockRejectedValue(unauthenticated())
    const res = await waitlistRoute.GET(new Request('https://admin.theroyalglow.in/api/waitlist'))
    expect(res.status).toBe(401)
    expect(dbMocks.getWaitlist).not.toHaveBeenCalled()
  })

  it('→ 403 when role is insufficient', async () => {
    sessionMocks.requireRole.mockRejectedValue(forbidden())
    const res = await waitlistRoute.GET(new Request('https://admin.theroyalglow.in/api/waitlist'))
    expect(res.status).toBe(403)
  })

  it('exports GET only', () => {
    expect(typeof waitlistRoute.GET).toBe('function')
    expect((waitlistRoute as Record<string, unknown>).POST).toBeUndefined()
  })
})

describe('PATCH /api/waitlist/[id]', () => {
  it('applies a valid transition (waiting → notified)', async () => {
    dbMocks.getWaitlistEntryById.mockResolvedValue({ id: 'w1', status: 'waiting' })
    dbMocks.updateWaitlistStatus.mockResolvedValue({ id: 'w1', status: 'notified' })

    const res = await patch('w1', { status: 'notified' })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, data: { entry: { id: 'w1', status: 'notified' } } })
    expect(dbMocks.updateWaitlistStatus).toHaveBeenCalledWith('w1', 'notified')
  })

  it('rejects an illegal transition (waiting → booked) with the 409 envelope', async () => {
    dbMocks.getWaitlistEntryById.mockResolvedValue({ id: 'w1', status: 'waiting' })

    const res = await patch('w1', { status: 'booked' })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toMatchObject({ code: ERROR_CODES.CONFLICT, statusCode: 409 })
    expect(dbMocks.updateWaitlistStatus).not.toHaveBeenCalled()
  })

  it('returns the 404 envelope when the entry is missing', async () => {
    dbMocks.getWaitlistEntryById.mockResolvedValue(null)

    const res = await patch('missing', { status: 'notified' })
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toMatchObject({ code: ERROR_CODES.NOT_FOUND, statusCode: 404 })
    expect(dbMocks.updateWaitlistStatus).not.toHaveBeenCalled()
  })

  it('rejects an invalid status payload with the 400 envelope', async () => {
    const res = await patch('w1', { status: 'banana' })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 })
    expect(dbMocks.getWaitlistEntryById).not.toHaveBeenCalled()
  })

  it('→ 403 when role is insufficient', async () => {
    sessionMocks.requireRole.mockRejectedValue(forbidden())
    const res = await patch('w1', { status: 'notified' })
    expect(res.status).toBe(403)
    expect(dbMocks.getWaitlistEntryById).not.toHaveBeenCalled()
  })
})
