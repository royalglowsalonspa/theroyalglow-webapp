/************************************************************
 * Module Name  : GET|POST /api/closures
 * Scope        : API — Admin branch closures (multi-branch R1.8)
 *
 * Description  : The days the active branch is closed. GET lists its
 *                closures and those that close every branch; POST closes the
 *                branch (or, for the Developer, every branch) on a date or a
 *                range of dates.
 *
 * Responsibilities :
 * - List upcoming closures, marking which the viewer may remove (GET)
 * - Close one date or up to 31 days, never in the past (POST)
 * - Report dates already closed and the bookings left to move (POST)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/audit, @/lib/api/branch-context,
 *                @/lib/api/error-handler, @rgss/business, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Manager or above at the active branch; closing every branch is the
 *   Developer's alone.
 * - POST names the branch the form was rendered for (409 after a switch).
 * - Bookings already on a newly closed date are listed, never cancelled:
 *   reception moves or rejects them, and approving one on that date is refused.
 ************************************************************/

import { assertCanManageClosure, canManageClosure, closureDates, istToday } from '@rgss/business'
import {
  type ClosureRow,
  createClosures,
  getActiveBookingsOnDates,
  getBranchClosures,
} from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { type ClosureView, closureCreateSchema, closureListQuerySchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

function toView(row: ClosureRow, role: Parameters<typeof canManageClosure>[0]): ClosureView {
  const allBranches = row.branchId === null
  return {
    id: row.id,
    date: row.date,
    name: row.name,
    allBranches,
    canRemove: canManageClosure(role, allBranches),
  }
}

// GET /api/closures?from=YYYY-MM-DD&to=YYYY-MM-DD — the active branch's
// closures from `from` (default today, IST).
export const GET = withErrorHandler(async (req: Request) => {
  const ctx = await requireBranchRole('manager')

  const params = Object.fromEntries(new URL(req.url).searchParams)
  const parsed = closureListQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw badRequest('Invalid query parameters', parsed.error.flatten().fieldErrors)
  }

  const from = parsed.data.from ?? istToday()
  const rows = await getBranchClosures(ctx.branch.id, from, parsed.data.to)

  return apiSuccess({
    branchId: ctx.branch.id,
    canCloseAllBranches: canManageClosure(ctx.branch.role, true),
    closures: rows.map((row) => toView(row, ctx.branch.role)),
  })
})

// POST /api/closures — close the active branch (or every branch) on a date
// or an inclusive range.
export const POST = withErrorHandler(async (req: Request) => {
  const ctx = await requireBranchRole('manager')

  const body = await req.json().catch(() => null)
  const parsed = closureCreateSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }
  assertRenderedBranch(ctx, parsed.data.branchId)

  const allBranches = parsed.data.allBranches === true
  assertCanManageClosure(ctx.branch.role, allBranches)

  const dates = closureDates({
    date: parsed.data.date,
    ...(parsed.data.endDate ? { endDate: parsed.data.endDate } : {}),
    today: istToday(),
  })
  const scopeBranchId = allBranches ? null : ctx.branch.id
  const { created, alreadyClosed } = await createClosures({
    branchId: scopeBranchId,
    dates,
    name: parsed.data.name,
  })

  const affectedBookings = await getActiveBookingsOnDates(
    created.map((row) => row.date),
    scopeBranchId,
  )

  const [first] = created
  if (first) {
    await audit(req, ctx.session, {
      action: 'create',
      entityType: 'closure',
      entityId: first.id,
      branchId: scopeBranchId,
      newValues: {
        name: parsed.data.name,
        allBranches,
        dates: created.map((row) => row.date),
      },
    })
  }

  return apiSuccess(
    {
      closures: created.map((row) => toView(row, ctx.branch.role)),
      alreadyClosed,
      affectedBookings,
    },
    undefined,
    created.length > 0 ? 201 : 200,
  )
})
