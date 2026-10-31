/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 28-06-2026 & Updated - 28-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoice-pdf (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : The wire contract between the caller (apps/web, apps/admin, or
 *                a scheduled job) and the standalone invoicing PDF service.
 *                It is a FULLY-COMPUTED, self-contained render
 *                payload: every monetary value is final integer paise computed
 *                upstream by @rgss/business. The PDF service ONLY renders these
 *                values — it never recomputes tax, discounts, or totals.
 *
 * Responsibilities :
 * - Define the Zod schema + type for the invoice render request body
 * - Encode the India GST invoice fields (GSTIN, SAC, CGST/SGST split, etc.)
 *
 * Features / Functionality :
 * - invoicePdfPayloadSchema — validated at the service boundary (trust nothing)
 * - Money is integer paise; the service formats via @rgss/business helpers
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        :
 * - templateVersion lets a future re-render reproduce the exact layout that
 *   produced a stored invoice (audit/repro).
 * - All *Paise fields are non-negative integers (invoices are never negative).
 ************************************************************/
import { z } from 'zod'

const paise = z.number().int().nonnegative()

// Seller (the branch as issued) block printed in the invoice header.
const invoiceSellerSchema = z.object({
  name: z.string().min(1),
  // The registered legal name, when it differs from the trading name.
  legalName: z.string().min(1).nullish(),
  addressLines: z.array(z.string().min(1)).min(1).max(5),
  gstin: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional(),
  // One SAC code for the whole invoice, for invoices issued before lines
  // carried their own (template v1). Newer invoices print it per line.
  sacCode: z.string().min(1).optional(),
})

// The customer the invoice is billed to.
const invoiceCustomerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullish(),
  phone: z.string().min(1).nullish(),
})

// A single billed line. `gemsCovered` marks the service paid for with gems —
// its `totalPricePaise` is 0 but the line is still printed for the record.
const invoiceLineSchema = z.object({
  name: z.string().min(1),
  staffName: z.string().min(1).nullish(),
  quantity: z.number().int().positive(),
  unitPricePaise: paise,
  totalPricePaise: paise,
  gemsCovered: z.boolean().default(false),
  // The line's stored tax facts (multi-branch R6.1); absent on invoices
  // issued before lines carried them.
  sacCode: z
    .string()
    .regex(/^\d{6}$/)
    .nullish(),
  rateBps: z.number().int().min(0).max(2800).nullish(),
  discountPaise: paise.nullish(),
  taxableValuePaise: paise.nullish(),
  taxPaise: paise.nullish(),
})

// Final, pre-computed monetary totals (all integer paise). taxableValue + gst
// must reconstruct total exactly (the service does not verify — it trusts the
// upstream @rgss/business computation that produced them).
const invoiceTotalsSchema = z.object({
  subtotalPaise: paise,
  discountPaise: paise,
  taxableValuePaise: paise,
  cgstPaise: paise,
  sgstPaise: paise,
  gstPaise: paise,
  totalPaise: paise,
})

export const invoicePdfPayloadSchema = z.object({
  // Layout version that rendered this invoice (reproducibility/audit).
  templateVersion: z.string().min(1).default('v1'),

  invoiceNumber: z.string().min(1),
  // ISO-8601 instant of issue (the tax point); formatted DD/MM/YYYY in IST.
  issuedAt: z.string().datetime(),
  paymentMethod: z.enum(['cash', 'upi', 'card', 'online']),
  bookingNumber: z.string().min(1).nullish(),
  // Issued with provisional (unreviewed) rates: printed as a test invoice
  // (multi-branch TX-10). Absent on invoices issued before the review status.
  taxReviewStatus: z.enum(['provisional', 'reviewed']).nullish(),
  // What the invoice is for: a membership session prints as a ₹0 usage
  // record, not as a tax-exempt supply (TX-07).
  invoiceType: z.enum(['service', 'membership_purchase', 'membership_session']).optional(),

  seller: invoiceSellerSchema,
  customer: invoiceCustomerSchema,
  items: z.array(invoiceLineSchema).min(1),
  totals: invoiceTotalsSchema,

  // Loyalty summary printed as a note (never affects the money math).
  gemsEarned: z.number().int().nonnegative().default(0),
  gemsRedeemed: z.number().int().nonnegative().default(0),

  notes: z.string().max(500).nullish(),
})

export type InvoicePdfPayload = z.infer<typeof invoicePdfPayloadSchema>

// The service's success response: where the rendered PDF was stored and its
// bytes (base64) so the caller can attach it to the invoice email without a
// second fetch. `pdfBase64` is optional so the caller can also choose to fetch
// from `pdfUrl` instead of receiving the bytes inline.
export const invoicePdfResultSchema = z.object({
  invoiceNumber: z.string().min(1),
  pdfUrl: z.string().url(),
  pdfBase64: z.string().min(1).optional(),
  // True when an existing stored PDF was returned (idempotent replay), false
  // when freshly rendered this call.
  reused: z.boolean().default(false),
})

export type InvoicePdfResult = z.infer<typeof invoicePdfResultSchema>
