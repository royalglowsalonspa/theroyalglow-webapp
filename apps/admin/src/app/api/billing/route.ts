/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/billing
 * Scope        : API — Admin Billing
 *
 * Description  : Paginated, searchable, filterable invoice ledger for the admin
 *                Billing module. Receptionist+ access.
 *
 * Responsibilities :
 * - Validate query params (search, status, type, pagination)
 * - Return the invoice list with pagination metadata
 *
 * Features / Functionality :
 * - Search by invoice number / customer name / email
 * - Filter by payment status and invoice type
 * - Standard envelope with `meta` (page, totalPages, totalCount)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : Requires min role: receptionist. Read-only ledger.
 ************************************************************/

import { getInvoices } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { invoiceListQuerySchema } from '@rgss/types'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'

// GET /api/billing — searchable, filterable, paginated invoice ledger.
export const GET = withErrorHandler(async (req: Request) => {
  await requireRole('receptionist')

  const params = Object.fromEntries(new URL(req.url).searchParams)
  const parsed = invoiceListQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw badRequest('Invalid query parameters', parsed.error.flatten().fieldErrors)
  }

  const query = parsed.data
  const { rows, totalCount } = await getInvoices(query)
  const totalPages = Math.max(1, Math.ceil(totalCount / query.pageSize))

  return apiSuccess({ invoices: rows }, { page: query.page, totalPages, totalCount })
})
