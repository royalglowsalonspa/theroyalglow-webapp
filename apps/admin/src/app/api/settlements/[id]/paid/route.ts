/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : POST /api/settlements/[id]/paid
 * Scope        : API — cross-branch settlement (multi-branch R10, MS-25)
 *
 * Description  : Records that a statement's net was paid outside the system
 *                (bank transfer or UPI): the date, the payment reference and,
 *                when one Owner owns both branches, that it was an internal
 *                transfer. Recorded once and audited.
 *
 * Responsibilities :
 * - POST { paidOn, reference, internalTransfer } → { statement }
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/audit, @/lib/api/settlement-access,
 *                @/lib/api/error-handler, @rgss/business, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : Only the paying branch's Owner or the Developer (403 for the
 *                receiving branch's Owner); 404 for anyone who can't see the
 *                statement; 409 when it is already paid or nothing is owed.
 ************************************************************/

import { canMarkSettlementPaid, istToday } from '@rgss/business'
import { getSettlementStatement, markSettlementPaid } from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, forbidden, notFound } from '@rgss/errors'
import { settlementPaidSchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSettlementViewer, statementView } from '@/lib/api/settlement-access'

function alreadyPaid() {
  return conflict(ERROR_CODES.SETTLEMENT_ALREADY_PAID, 'This statement is already marked paid.')
}

function nothingOwed() {
  return conflict(
    ERROR_CODES.CONFLICT,
    'Nothing is owed on this statement, so there is nothing to pay.',
  )
}

export const POST = withErrorHandler(
  async (req: Request, route: { params: Promise<{ id: string }> }) => {
    const { session, viewer, scope } = await requireSettlementViewer()
    const { id } = await route.params

    const body = await req.json().catch(() => null)
    const parsed = settlementPaidSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }
    const { paidOn, reference, internalTransfer } = parsed.data
    if (paidOn > istToday(new Date())) {
      throw badRequest("The payment date can't be in the future.", {
        paidOn: ['Pick today or an earlier date.'],
      })
    }

    const record = await getSettlementStatement(id, scope)
    if (!record) {
      throw notFound('Statement not found.')
    }
    if (record.paid) {
      throw alreadyPaid()
    }
    if (record.net.amountPaise <= 0) {
      throw nothingOwed()
    }
    if (!canMarkSettlementPaid(viewer, record)) {
      throw forbidden(
        `Only ${record.net.payingBranch?.name ?? 'the paying branch'}'s Owner or the Developer can mark this statement paid.`,
      )
    }
    if (internalTransfer && !record.sameOwner) {
      throw badRequest('An internal transfer is only between two branches of the same Owner.', {
        internalTransfer: ['These branches have different Owners.'],
      })
    }

    const result = await markSettlementPaid({
      id,
      paidOn,
      reference,
      internalTransfer,
      actorId: session.user.id,
    })
    if (!result.ok) {
      switch (result.reason) {
        case 'not_found':
          throw notFound('Statement not found.')
        case 'already_paid':
          throw alreadyPaid()
        case 'nothing_owed':
          throw nothingOwed()
        case 'not_same_owner':
          throw badRequest('An internal transfer is only between two branches of the same Owner.')
      }
    }

    await audit(req, session, {
      action: 'update',
      entityType: 'branch_settlement',
      entityId: id,
      newValues: { paidOn, reference, internalTransfer, amountPaise: record.net.amountPaise },
    })

    const updated = await getSettlementStatement(id, scope)
    if (!updated) {
      throw notFound('Statement not found.')
    }
    return apiSuccess({ statement: statementView(updated, viewer) })
  },
)
