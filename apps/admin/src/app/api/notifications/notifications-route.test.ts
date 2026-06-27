// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : notifications-route.test
 * Scope        : Unit test for the admin Notifications API route
 *
 * Description  : Happy-path coverage for GET /api/notifications (feed +
 *                unreadCount envelope the NotificationBell consumes) and
 *                PATCH /api/notifications (mark-all-read). Session + DB are
 *                mocked; no live session/DB. Mirrors the existing admin API
 *                test style (billing-routes.test.ts).
 *
 * Layer        : Testing
 *
 * Notes        : Node environment (server route handlers). Staff+ (requireRole).
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireSession: vi.fn(),
  getOptionalSession: vi.fn(),
}))

const dbMocks = vi.hoisted(() => ({
  getNotificationsForUser: vi.fn(),
  getUnreadCount: vi.fn(),
  markNotificationsRead: vi.fn(),
}))

vi.mock('@/lib/api/session', () => sessionMocks)
vi.mock('@rgss/db/queries', () => dbMocks)

import * as notificationsRoute from '@/app/api/notifications/route'

const AUTHORIZED = { user: { id: 'u_admin', role: 'receptionist' } }

beforeEach(() => {
  vi.clearAllMocks()
  sessionMocks.requireRole.mockResolvedValue(AUTHORIZED)
  sessionMocks.requireSession.mockResolvedValue(AUTHORIZED)
})

describe('GET /api/notifications', () => {
  it('returns the { notifications, unreadCount } envelope the bell consumes', async () => {
    dbMocks.getNotificationsForUser.mockResolvedValue([
      { id: 'n1', type: 'booking', title: 'Confirmed', body: 'OK', readAt: null, createdAt: 'x' },
    ])
    dbMocks.getUnreadCount.mockResolvedValue(1)

    const res = await notificationsRoute.GET(
      new Request('https://admin.theroyalglow.in/api/notifications'),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual({
      notifications: [
        { id: 'n1', type: 'booking', title: 'Confirmed', body: 'OK', readAt: null, createdAt: 'x' },
      ],
      unreadCount: 1,
    })
    expect(body.meta).toMatchObject({ page: 1, totalPages: 1 })
    // Scoped to the authenticated user; default pagination (pageSize 20, offset 0).
    expect(dbMocks.getNotificationsForUser).toHaveBeenCalledWith('u_admin', 20, 0)
    expect(dbMocks.getUnreadCount).toHaveBeenCalledWith('u_admin')
  })
})

describe('PATCH /api/notifications', () => {
  it('marks all of the caller’s notifications read on an empty body', async () => {
    dbMocks.markNotificationsRead.mockResolvedValue(undefined)

    const res = await notificationsRoute.PATCH(
      new Request('https://admin.theroyalglow.in/api/notifications', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, data: { ok: true } })
    // No `ids` → mark all (undefined forwarded to the query helper).
    expect(dbMocks.markNotificationsRead).toHaveBeenCalledWith('u_admin', undefined)
  })
})
