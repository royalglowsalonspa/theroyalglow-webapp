/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : POST /api/settlements/entries/[id]/reverse
 * Scope        : API — cross-branch settlement (multi-branch R10, MS-24)
 *
 * Description  : The Developer corrects a settlement entry by recording its
 *                reversal, with the reason. The reversal lands in the month
 *                open now; a closed statement never changes.
 *
 * Responsibilities :
 * - POST { note } → { entryId, month }
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/audit, @/lib/api/branch-context,
 *                @/lib/api/error-handler, @rgss/db/queries, @rgss/errors,
 *                @rgss/types
 *
 * Notes        : Developer only (requireCurrentRole). An entry is reversed at
 *                most once; a reversal and an internal entry can't be.
 ************************************************************/

import { reverseSettlementEntry } from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, notFound } from '@rgss/errors'
import { settlementReversalSchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { requireCurrentRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const POST = withErrorHandler(
  async (req: Request, route: { params: Promise<{ id: string }> }) => {
    const { session } = await requireCurrentRole('developer')
    const { id } = await route.params

    const body = await req.json().catch(() => null)
    const parsed = settlementReversalSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }

    const result = await reverseSettlementEntry({
      entryId: id,
      note: parsed.data.note,
      actorId: session.user.id,
    })
    if (!result.ok) {
      switch (result.reason) {
        case 'not_found':
          throw notFound('Entry not found.')
        case 'already_reversed':
          throw conflict(ERROR_CODES.CONFLICT, 'This entry has already been reversed.')
        case 'is_reversal':
          throw badRequest("A reversing entry can't itself be reversed.")
        case 'internal':
          throw badRequest(
            'An entry within one branch settles nothing, so there is nothing to reverse.',
          )
      }
    }

    await audit(req, session, {
      action: 'create',
      entityType: 'settlement_entry',
      entityId: result.entryId,
      newValues: { reverses: id, note: parsed.data.note, month: result.month },
    })
    return apiSuccess({ entryId: result.entryId, month: result.month })
  },
)
