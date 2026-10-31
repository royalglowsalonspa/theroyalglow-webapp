/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/billing/[id]
 * Scope        : API — Admin Billing
 *
 * Description  : Returns a single invoice with its line items and customer
 *                identity for the Billing detail view. Receptionist+ access.
 *
 * Responsibilities :
 * - Fetch one invoice + items by id
 * - Return 404 when the invoice does not exist
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors
 *
 * Notes        : Requires min role: receptionist. Read-only.
 ************************************************************/

import { getInvoiceById } from '@rgss/db/queries'
import { notFound } from '@rgss/errors'
import { requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

// GET /api/billing/[id] — one of the active branch's invoices with line items.
// An invoice issued by another branch is not found (R2.3).
export const GET = withErrorHandler(
  async (_req: Request, route: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('receptionist')
    const { id } = await route.params

    const invoice = await getInvoiceById(id, ctx.branch.id)
    if (!invoice) {
      throw notFound('Invoice not found.')
    }

    return apiSuccess({ invoice })
  },
)
