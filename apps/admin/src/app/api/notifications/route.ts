/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET|PATCH /api/notifications
 * Scope        : API — Admin Notifications
 *
 * Description  : Notification feed and mark-read operations for the
 *                authenticated admin user. Mirrors the customer route at
 *                apps/web/api/notifications so the shared NotificationBell
 *                consumes an identical envelope; gated with the admin session
 *                helper (requireRole 'staff', the lowest admin role) so the
 *                feed is scoped to admin-portal users only.
 *
 * Responsibilities :
 * - Return the caller's paginated notification feed (newest first)
 * - Provide the caller's unread notification count
 * - Mark specific or all of the caller's notifications as read
 *
 * Features / Functionality :
 * - Paginated notification list (default 20, max 100)
 * - Unread count in response data
 * - Bulk or selective mark-as-read via PATCH
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Strictly scoped to session.user.id; never exposes another user's rows.
 * - Empty/missing PATCH body marks ALL of the caller's unread as read.
 * - Uses the shared @rgss/db notifications query helpers (no duplicated SQL).
 ************************************************************/

import { getNotificationsForUser, getUnreadCount, markNotificationsRead } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { markReadSchema } from '@rgss/types'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

// Parse a positive integer query param, falling back to a default and clamping
// to a maximum where supplied. Invalid/missing values use the default.
function parsePositiveInt(value: string | null, fallback: number, max?: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback
  }
  return max ? Math.min(parsed, max) : parsed
}

// GET /api/notifications — the caller's own notification feed (newest first,
// paginated) plus the count of their unread notifications. Scoped to the
// authenticated admin user (session.user.id); never exposes another user's rows.
export const GET = withErrorHandler(async (req: Request) => {
  const session = await requireRole('staff')
  const userId = session.user.id

  const url = new URL(req.url)
  const page = parsePositiveInt(url.searchParams.get('page'), DEFAULT_PAGE)
  const pageSize = parsePositiveInt(
    url.searchParams.get('pageSize'),
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
  )
  const offset = (page - 1) * pageSize

  const [notifications, unreadCount] = await Promise.all([
    getNotificationsForUser(userId, pageSize, offset),
    getUnreadCount(userId),
  ])

  // No separate count query: if a full page came back there may be more, so
  // totalPages is at least page + 1; otherwise this is the last page.
  const hasMore = notifications.length === pageSize
  const totalPages = hasMore ? page + 1 : page

  return apiSuccess({ notifications, unreadCount }, { page, totalPages })
})

// PATCH /api/notifications — mark the caller's notifications read. With `ids`,
// marks those notifications; omit `ids` to mark all of the caller's unread
// notifications read. Scoped to session.user.id so one user can never mark
// another user's notifications.
export const PATCH = withErrorHandler(async (req: Request) => {
  const session = await requireRole('staff')

  // Body is optional: an empty/missing payload means "mark all read".
  const body = await req.json().catch(() => ({}))
  const parsed = markReadSchema.safeParse(body ?? {})
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }

  await markNotificationsRead(session.user.id, parsed.data.ids)

  return apiSuccess({ ok: true })
})
