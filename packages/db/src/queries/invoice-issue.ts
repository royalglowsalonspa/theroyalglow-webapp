/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoice-issue
 * Scope        : Data Access — issuing an invoice (multi-branch R6.1, R6.2)
 *
 * Description  : The statements that issue an invoice inside a caller's
 *                db.batch(): take the branch's next number for the financial
 *                year, insert the invoice with its number and issuer snapshot,
 *                and insert its lines with their tax facts.
 *
 * Responsibilities :
 * - issueInvoiceStatements(issue, lines) → the three statements, in order
 * - invoiceNumberOf(invoiceId): the number, for text written in the same batch
 * - isDuplicateBookingInvoice(error): a booking already billed
 *
 * Features / Functionality :
 * - The counter row is upserted first, which locks it until the transaction
 *   ends, so two issues at one branch can't take the same number. A failed
 *   batch rolls the counter back too: no number is used up.
 * - The number is the branch's prefix, the IST financial year and the
 *   sequence, at least 6 digits: RS/2627/000123.
 * - The issuer (name, legal name, GSTIN, address, state) is copied from the
 *   branch row in the same statement, so it is the branch as issued.
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../index, ../schema/invoice, ../schema/tax,
 *                ./driver-errors
 *
 * Notes        : The caller computes every amount and tax fact with
 *                @rgss/business (prepareInvoiceTax); the database checks they
 *                add up (0017 checks) and that each line uses the rate in
 *                force (0018 trigger).
 ************************************************************/

import { sql } from 'drizzle-orm'
import { db } from '../index'
import { invoice, invoiceItem } from '../schema/invoice'
import { invoiceSequence } from '../schema/tax'
import { isConstraintViolation, SQLSTATE } from './driver-errors'

type NewInvoice = typeof invoice.$inferInsert

/** The header of an invoice to issue: every amount is final. */
export type InvoiceIssue = {
  id: string
  branchId: string
  bookingId: string | null
  customerId: string
  invoiceType: NonNullable<NewInvoice['invoiceType']>
  paymentMethod: NonNullable<NewInvoice['paymentMethod']>
  /** Sum of the lines before the discount, tax-inclusive. */
  subtotalPaise: number
  discountAmountPaise: number
  taxableValuePaise: number
  gstAmountPaise: number
  cgstPaise: number
  sgstPaise: number
  totalAmountPaise: number
  gemsEarned: number
  gemsRedeemed?: number
  gemsRedeemedServiceId?: string | null
  taxPointAt: Date
  financialYear: string
  taxReviewStatus: 'provisional' | 'reviewed'
  notes?: string | null
  /**
   * The offer applied at checkout and its rule as it was then (offers.md):
   * `value` is the percentage, or paise for a flat or combo price.
   */
  offer?: {
    id: string
    name: string
    type: NonNullable<NewInvoice['offerTypeSnapshot']>
    value: number
  } | null
}

/** One issued line with its tax facts. */
export type InvoiceIssueLine = {
  serviceId: string | null
  serviceNameSnapshot: string
  staffNameSnapshot: string | null
  quantity: number
  unitPricePaise: number
  /** The line's tax-inclusive amount before its discount share. */
  totalPricePaise: number
  displayOrder: number
  sacCode: string
  taxVersionId: string
  rateBps: number
  discountPaise: number
  taxableValuePaise: number
  taxPaise: number
  cgstPaise: number
  sgstPaise: number
}

/**
 * The statements that issue the invoice, in the order they must run inside
 * one batch: the counter, the invoice (with `.returning()`), then its lines
 * (absent when there are none).
 */
export function issueInvoiceStatements(issue: InvoiceIssue, lines: readonly InvoiceIssueLine[]) {
  const { branchId, financialYear } = issue

  // Upserting the counter row locks it until the transaction ends.
  const counter = db
    .insert(invoiceSequence)
    .values({ branchId, financialYear, lastNumber: 1 })
    .onConflictDoUpdate({
      target: [invoiceSequence.branchId, invoiceSequence.financialYear],
      set: { lastNumber: sql`${invoiceSequence.lastNumber} + 1`, updatedAt: sql`now()` },
    })

  const sequenceNumber = sql<number>`(select s.last_number from invoice_sequence s
    where s.branch_id = ${branchId} and s.financial_year = ${financialYear})`
  const invoiceNumber = sql<string>`(select b.invoice_prefix || '/' || ${financialYear} || '/' ||
      lpad(s.last_number::text, greatest(6, length(s.last_number::text)), '0')
    from invoice_sequence s join branch b on b.id = s.branch_id
    where s.branch_id = ${branchId} and s.financial_year = ${financialYear})`
  const fromBranch = (column: string) =>
    sql<string>`(select ${sql.raw(column)} from branch where id = ${branchId})`

  const insertInvoice = db
    .insert(invoice)
    .values({
      id: issue.id,
      invoiceNumber,
      sequenceNumber,
      financialYear,
      branchId,
      bookingId: issue.bookingId,
      customerId: issue.customerId,
      subtotalPaise: issue.subtotalPaise,
      discountAmountPaise: issue.discountAmountPaise,
      taxableValuePaise: issue.taxableValuePaise,
      gstAmountPaise: issue.gstAmountPaise,
      cgstPaise: issue.cgstPaise,
      sgstPaise: issue.sgstPaise,
      totalAmountPaise: issue.totalAmountPaise,
      invoiceType: issue.invoiceType,
      paymentMethod: issue.paymentMethod,
      paymentStatus: 'paid',
      gemsEarned: issue.gemsEarned,
      gemsRedeemed: issue.gemsRedeemed ?? 0,
      gemsRedeemedServiceId: issue.gemsRedeemedServiceId ?? null,
      taxPointAt: issue.taxPointAt,
      taxReviewStatus: issue.taxReviewStatus,
      issuerName: fromBranch('name'),
      issuerLegalName: fromBranch('legal_name'),
      issuerGstin: fromBranch('gstin'),
      issuerAddress: sql<string>`(select concat_ws(E'\n', b.address_line1,
          nullif(btrim(b.address_line2), ''), b.city || ', ' || b.state || ' ' || b.pincode)
        from branch b where b.id = ${branchId})`,
      issuerState: fromBranch('state'),
      offerId: issue.offer?.id ?? null,
      offerNameSnapshot: issue.offer?.name ?? null,
      offerTypeSnapshot: issue.offer?.type ?? null,
      offerValueSnapshot: issue.offer?.value ?? null,
      notes: issue.notes ?? null,
      paidAt: issue.taxPointAt,
    })
    .returning()

  const insertLines =
    lines.length > 0
      ? db.insert(invoiceItem).values(lines.map((line) => ({ ...line, invoiceId: issue.id })))
      : null

  return { counter, insertInvoice, insertLines }
}

/** The number of an invoice issued earlier in the same batch, for log text. */
export function invoiceNumberOf(invoiceId: string) {
  return sql<string>`(select invoice_number from invoice where id = ${invoiceId})`
}

const BOOKING_INVOICE_UNIQUE = 'invoice_booking_id_uidx'

/** True when the batch failed because the booking already has an invoice. */
export function isDuplicateBookingInvoice(error: unknown): boolean {
  return isConstraintViolation(error, SQLSTATE.uniqueViolation, [BOOKING_INVOICE_UNIQUE])
}
