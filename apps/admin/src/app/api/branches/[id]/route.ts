/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 29-10-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : PATCH|DELETE /api/branches/[id]
 * Scope        : API — Branch management (multi-branch R1.1, R1.10)
 *
 * Description  : PATCH updates a branch's details or operational status;
 *                DELETE removes an empty shut-down branch. Developer only.
 *
 * Responsibilities :
 * - Update details and status (PATCH); 404 for a missing branch
 * - Shut a branch down only once nothing is open there (409 with the list)
 * - Delete only a shut-down branch with no records; its Owner, if they own
 *   no other branch, becomes a Customer in the same transaction (DELETE)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/audit, @/lib/api/branch-context,
 *                @/lib/api/error-handler, @/lib/realtime/revocation,
 *                @rgss/business, @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        : `code`/`number` are immutable, and the Owner changes only
 *                through the Owner handover in Users & Roles. The database
 *                refuses a shutdown with anything open and new activity at a
 *                shut-down branch (migration 0011); these routes explain it.
 ************************************************************/

import { shutdownBlockedMessage, shutdownBlockerLines } from '@rgss/business'
import {
  deleteShutDownBranch,
  getBranchById,
  getBranchShutdownBlockers,
  shutDownBranch,
  updateBranch,
} from '@rgss/db/queries'
import { AppError, badRequest, conflict, ERROR_CODES, notFound } from '@rgss/errors'
import { branchUpdateRequestSchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { requireCurrentRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { revokeLiveUpdates } from '@/lib/realtime/revocation'

type RouteContext = { params: Promise<{ id: string }> }

function branchChanged(branchName: string) {
  return conflict(
    ERROR_CODES.CONFLICT,
    `${branchName} changed while you were editing it. Reload and try again.`,
  )
}

/** 409 listing what must be resolved before the branch can shut down. */
async function shutdownBlocked(branchId: string, branchName: string): Promise<AppError> {
  const blockers = await getBranchShutdownBlockers(branchId)
  const lines = blockers ? shutdownBlockerLines(blockers) : []
  return new AppError({
    code: ERROR_CODES.BRANCH_SHUTDOWN_BLOCKED,
    message:
      lines.length > 0
        ? shutdownBlockedMessage(branchName, lines)
        : `${branchName} changed while you were shutting it down. Check it and try again.`,
    statusCode: 409,
    details: { blockers, lines },
  })
}

export const PATCH = withErrorHandler(async (req: Request, ctx: RouteContext) => {
  const { session } = await requireCurrentRole('developer')
  const { id } = await ctx.params

  const body = await req.json().catch(() => null)
  const parsed = branchUpdateRequestSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }

  const existing = await getBranchById(id)
  if (!existing) {
    throw notFound('Branch not found.')
  }

  const { expectedStatus, ...patch } = parsed.data
  if (
    (expectedStatus !== undefined && expectedStatus !== existing.status) ||
    (expectedStatus === undefined && patch.status !== undefined && patch.status !== existing.status)
  ) {
    throw branchChanged(existing.name)
  }

  // Shutting down: everything open there must be resolved first (R1.10).
  if (patch.status === 'shutdown' && existing.status !== 'shutdown') {
    const { status: _shutdown, ...rest } = patch
    const result = await shutDownBranch(id, rest, existing.status)
    if (!result.ok) {
      if (result.reason === 'not_found') {
        throw notFound('Branch not found.')
      }
      if (result.reason === 'changed') throw branchChanged(existing.name)
      throw await shutdownBlocked(id, existing.name)
    }
    await audit(req, session, {
      action: 'status_change',
      entityType: 'branch',
      entityId: id,
      branchId: id,
      oldValues: existing,
      newValues: patch,
    })
    return apiSuccess({ branch: result.branch })
  }

  const updated =
    patch.status === undefined
      ? await updateBranch(id, patch)
      : await updateBranch(id, patch, existing.status)
  if (!updated) {
    if (patch.status !== undefined) throw branchChanged(existing.name)
    throw notFound('Branch not found.')
  }
  await audit(req, session, {
    action: 'update',
    entityType: 'branch',
    entityId: id,
    branchId: id,
    oldValues: existing,
    newValues: patch,
  })
  return apiSuccess({ branch: updated })
})

// DELETE /api/branches/[id] — remove a shut-down branch that has no records.
export const DELETE = withErrorHandler(async (req: Request, ctx: RouteContext) => {
  const { session } = await requireCurrentRole('developer')
  const { id } = await ctx.params

  const existing = await getBranchById(id)
  if (!existing) {
    throw notFound('Branch not found.')
  }

  const result = await deleteShutDownBranch(id)
  if (!result.ok) {
    switch (result.reason) {
      case 'not_found':
        throw notFound('Branch not found.')
      case 'not_shut_down':
        throw new AppError({
          code: ERROR_CODES.BRANCH_NOT_EMPTY,
          message: `Shut ${existing.name} down before deleting it.`,
          statusCode: 409,
        })
      case 'not_empty':
        throw new AppError({
          code: ERROR_CODES.BRANCH_NOT_EMPTY,
          message: `${existing.name} has bookings, invoices or other records, so it stays as a shut-down branch.`,
          statusCode: 409,
        })
      case 'changed':
        throw new AppError({
          code: ERROR_CODES.CONFLICT,
          message: `${existing.name} changed while you were deleting it. Reload and try again.`,
          statusCode: 409,
        })
    }
  }

  // Their admin access ended with the branch; cut off live updates now.
  const liveUpdates = result.demotedOwnerId
    ? await revokeLiveUpdates([result.demotedOwnerId])
    : 'none'

  await audit(req, session, {
    action: 'delete',
    entityType: 'branch',
    entityId: id,
    branchId: id,
    oldValues: existing,
    newValues: result.demotedOwnerId ? { ownerReturnedToCustomer: result.demotedOwnerId } : null,
  })
  return apiSuccess({ deleted: true, ownerReturnedToCustomer: result.demotedOwnerId, liveUpdates })
})
