/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET /api/logs
 * Scope        : API — Admin Audit Log viewer
 *
 * Description  : Paginated, filterable audit log for the Developer-only Logs
 *                screen. Returns entries joined with actor identity.
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : Developer+ (level 5). Read-only.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getAuditLogs } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { auditLogQuerySchema } from '@rgss/types'

export const GET = withErrorHandler(async (req: Request) => {
  await requireRole('developer')

  const params = Object.fromEntries(new URL(req.url).searchParams)
  const parsed = auditLogQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw badRequest('Invalid query parameters', parsed.error.flatten().fieldErrors)
  }

  const query = parsed.data
  const { rows, totalCount } = await getAuditLogs(query)
  const totalPages = Math.max(1, Math.ceil(totalCount / query.pageSize))

  return apiSuccess({ logs: rows }, { page: query.page, totalPages, totalCount })
})
