/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoice (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas + types for the admin Billing module — the
 *                searchable, paginated invoice ledger and its filters.
 *
 * Responsibilities :
 * - Define payment-status / invoice-type literal unions (mirror DB enums)
 * - Validate the invoice list query (search + status/type filters + paging)
 *
 * Features / Functionality :
 * - invoiceListQuerySchema — q, status, type, page, pageSize (coerced)
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        : Money is paise (integer) everywhere; formatting happens in the
 *                presentation layer via formatINR.
 ************************************************************/
import { z } from 'zod'

// Mirror packages/db/src/schema/enums.ts exactly.
export const PAYMENT_STATUSES = ['pending', 'paid', 'refunded'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const PAYMENT_METHODS = ['cash', 'upi', 'card', 'online'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const INVOICE_TYPES = ['service', 'membership_purchase', 'membership_session'] as const
export type InvoiceType = (typeof INVOICE_TYPES)[number]

// Searchable, paginated invoice ledger. `q` matches invoice number, customer
// name, or email. Numbers are coerced (they arrive as query strings).
export const invoiceListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  type: z.enum(INVOICE_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>
