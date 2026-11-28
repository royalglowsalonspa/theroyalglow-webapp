/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoices
 * Scope        : Data Access — Billing / Invoices (admin ledger)
 *
 * Description  : Invoice queries backing the Billing module, per issuing
 *                branch: a paginated/searchable/filterable invoice ledger and a
 *                single invoice with its line items and customer identity.
 *
 * Responsibilities :
 * - List a branch's invoices (newest first) with search + status/type
 *   filters + paging
 * - Fetch one of its invoices with its items for the detail view
 *
 * Features / Functionality :
 * - Search across invoice number, customer name, and email (ilike)
 * - Filter by payment status and invoice type
 * - Separate count query for accurate pagination metadata
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, @rgss/types, ../index, ../schema/auth,
 *                ../schema/invoice
 *
 * Notes        : All money is paise (integer). Read-only — invoices are created
 *                by the booking-completion flow, not here.
 ************************************************************/

import { type InvoiceListQuery, splitCheckoutTendersSchema } from '@rgss/types'
import { and, asc, desc, eq, ilike, ne, or, sql } from 'drizzle-orm'
import { db } from '../index'
import { user } from '../schema/auth'
import { booking } from '../schema/booking'
import { branch } from '../schema/branch'
import { invoice, invoiceIssueOutbox, invoiceItem } from '../schema/invoice'
import { spaMembership } from '../schema/membership'
import { membershipHold } from '../schema/membership-hold'
import { customerProfile } from '../schema/profile'

// One branch's paginated, searchable, filterable invoice ledger: the invoices it
// issued (multi-branch R2.3). Returns rows joined to the customer's identity
// plus a total count for pagination.
export async function getInvoices(branchId: string, query: InvoiceListQuery) {
  const conditions = [eq(invoice.branchId, branchId)]
  if (query.status) {
    conditions.push(eq(invoice.paymentStatus, query.status))
  }
  if (query.type) {
    conditions.push(eq(invoice.invoiceType, query.type))
  }
  if (query.q) {
    const pattern = `%${query.q}%`
    const search = or(
      ilike(invoice.invoiceNumber, pattern),
      ilike(user.name, pattern),
      ilike(user.email, pattern),
    )
    if (search) {
      conditions.push(search)
    }
  }
  const where = and(...conditions)
  const offset = (query.page - 1) * query.pageSize

  const rows = await db
    .select({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName: user.name,
      customerEmail: user.email,
      totalAmountPaise: invoice.totalAmountPaise,
      invoiceType: invoice.invoiceType,
      paymentStatus: invoice.paymentStatus,
      paymentMethod: invoice.paymentMethod,
      createdAt: invoice.createdAt,
      paidAt: invoice.paidAt,
    })
    .from(invoice)
    .innerJoin(user, eq(invoice.customerId, user.id))
    .where(where)
    .orderBy(desc(invoice.createdAt))
    .limit(query.pageSize)
    .offset(offset)

  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invoice)
    .innerJoin(user, eq(invoice.customerId, user.id))
    .where(where)

  return { rows, totalCount: countResult[0]?.count ?? 0 }
}

// A single invoice issued by the branch, with its line items + customer
// identity, or null when the branch issued no such invoice.
export async function getInvoiceById(id: string, branchId: string) {
  const rows = await db
    .select({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName: user.name,
      customerEmail: user.email,
      bookingId: invoice.bookingId,
      subtotalPaise: invoice.subtotalPaise,
      discountAmountPaise: invoice.discountAmountPaise,
      taxableValuePaise: invoice.taxableValuePaise,
      gstAmountPaise: invoice.gstAmountPaise,
      cgstPaise: invoice.cgstPaise,
      sgstPaise: invoice.sgstPaise,
      totalAmountPaise: invoice.totalAmountPaise,
      invoiceType: invoice.invoiceType,
      paymentMethod: invoice.paymentMethod,
      paymentTenders: sql<unknown>`${invoiceIssueOutbox.snapshot} #> '{invoice,paymentTenders}'`,
      paymentStatus: invoice.paymentStatus,
      paymentReference: invoice.paymentReference,
      gemsEarned: invoice.gemsEarned,
      gemsRedeemed: invoice.gemsRedeemed,
      pdfUrl: invoice.pdfUrl,
      notes: invoice.notes,
      paidAt: invoice.paidAt,
      createdAt: invoice.createdAt,
      // The issue facts (multi-branch R6.1); null on older invoices.
      taxPointAt: invoice.taxPointAt,
      taxReviewStatus: invoice.taxReviewStatus,
      issuerName: invoice.issuerName,
      issuerLegalName: invoice.issuerLegalName,
      issuerGstin: invoice.issuerGstin,
    })
    .from(invoice)
    .innerJoin(user, eq(invoice.customerId, user.id))
    .leftJoin(invoiceIssueOutbox, eq(invoiceIssueOutbox.invoiceId, invoice.id))
    .where(and(eq(invoice.id, id), eq(invoice.branchId, branchId)))
    .limit(1)

  const found = rows[0]
  if (!found) {
    return null
  }

  const items = await db
    .select({
      id: invoiceItem.id,
      serviceNameSnapshot: invoiceItem.serviceNameSnapshot,
      staffNameSnapshot: invoiceItem.staffNameSnapshot,
      quantity: invoiceItem.quantity,
      unitPricePaise: invoiceItem.unitPricePaise,
      totalPricePaise: invoiceItem.totalPricePaise,
      sacCode: invoiceItem.sacCode,
      rateBps: invoiceItem.rateBps,
      discountPaise: invoiceItem.discountPaise,
      taxPaise: invoiceItem.taxPaise,
    })
    .from(invoiceItem)
    .where(eq(invoiceItem.invoiceId, id))
    .orderBy(asc(invoiceItem.displayOrder))

  return {
    ...found,
    items,
    paymentTenders: splitCheckoutTendersSchema.nullish().parse(found.paymentTenders) ?? null,
  }
}

/** Find the consumed membership session behind an eligible branch invoice. */
export async function getMembershipCorrectionTarget(invoiceId: string, branchId: string) {
  const [target] = await db
    .select({ bookingId: booking.id, membershipId: spaMembership.id })
    .from(invoice)
    .innerJoin(
      booking,
      and(eq(booking.id, invoice.bookingId), eq(booking.branchId, invoice.branchId)),
    )
    .innerJoin(spaMembership, eq(spaMembership.id, booking.spaMembershipId))
    .innerJoin(
      membershipHold,
      and(
        eq(membershipHold.bookingId, booking.id),
        eq(membershipHold.branchId, invoice.branchId),
        eq(membershipHold.spaMembershipId, spaMembership.id),
      ),
    )
    .where(
      and(
        eq(invoice.id, invoiceId),
        eq(invoice.branchId, branchId),
        eq(invoice.invoiceType, 'membership_session'),
        eq(invoice.totalAmountPaise, 0),
        eq(booking.status, 'completed'),
        eq(membershipHold.state, 'consumed'),
        ne(spaMembership.status, 'cancelled'),
      ),
    )
    .limit(1)
  return target ?? null
}

// Everything the invoice-pdf job needs to (a) build the InvoicePdfPayload sent
// to the render service and (b) compose the invoice email: the invoice as
// issued (number, tax point, issuer snapshot, amounts, review status), each
// line with its tax facts, the customer and the booking number. Returns null
// when the invoice does not exist (the job then no-ops without a retry loop).
//
// The issuer comes from the invoice's own snapshot (multi-branch R6.1), so a
// re-render after the branch changes reproduces the original (TX-05). An
// invoice issued before the snapshots existed has none; the job then falls
// back to the branch row, as it always did for those.
export async function getInvoiceForPdf(invoiceId: string) {
  const rows = await db
    .select({
      invoice,
      // Customer identity
      customerName: user.name,
      customerEmail: user.email,
      customerPhone: customerProfile.phone,
      // The branch row, for invoices issued before the issuer snapshot
      branchName: branch.name,
      branchAddressLine1: branch.addressLine1,
      branchAddressLine2: branch.addressLine2,
      branchCity: branch.city,
      branchState: branch.state,
      branchPincode: branch.pincode,
      branchPhone: branch.phone,
      branchEmail: branch.email,
      // Booking number (invoice may have no booking — membership purchase)
      bookingNumber: booking.bookingNumber,
      paymentTenders: sql<unknown>`${invoiceIssueOutbox.snapshot} #> '{invoice,paymentTenders}'`,
      workerOwnsEmail: sql<boolean>`coalesce(${invoiceIssueOutbox.snapshot} ? 'automaticDeliverySource', false)`,
    })
    .from(invoice)
    .innerJoin(user, eq(invoice.customerId, user.id))
    .innerJoin(branch, eq(invoice.branchId, branch.id))
    .leftJoin(customerProfile, eq(customerProfile.userId, invoice.customerId))
    .leftJoin(booking, eq(invoice.bookingId, booking.id))
    .leftJoin(invoiceIssueOutbox, eq(invoiceIssueOutbox.invoiceId, invoice.id))
    .where(eq(invoice.id, invoiceId))
    .limit(1)

  const found = rows[0]
  if (!found) {
    return null
  }

  const items = await db
    .select({
      serviceId: invoiceItem.serviceId,
      serviceNameSnapshot: invoiceItem.serviceNameSnapshot,
      staffNameSnapshot: invoiceItem.staffNameSnapshot,
      quantity: invoiceItem.quantity,
      unitPricePaise: invoiceItem.unitPricePaise,
      totalPricePaise: invoiceItem.totalPricePaise,
      sacCode: invoiceItem.sacCode,
      rateBps: invoiceItem.rateBps,
      discountPaise: invoiceItem.discountPaise,
      taxableValuePaise: invoiceItem.taxableValuePaise,
      taxPaise: invoiceItem.taxPaise,
      displayOrder: invoiceItem.displayOrder,
    })
    .from(invoiceItem)
    .where(eq(invoiceItem.invoiceId, invoiceId))
    .orderBy(asc(invoiceItem.displayOrder))

  const inv = found.invoice
  return {
    invoice: inv,
    items,
    branch: {
      name: found.branchName,
      addressLine1: found.branchAddressLine1,
      addressLine2: found.branchAddressLine2,
      city: found.branchCity,
      state: found.branchState,
      pincode: found.branchPincode,
      phone: found.branchPhone,
      email: found.branchEmail,
    },
    customer: {
      name: found.customerName,
      email: found.customerEmail,
      phone: found.customerPhone,
    },
    bookingNumber: found.bookingNumber,
    workerOwnsEmail: found.workerOwnsEmail,
    paymentTenders: splitCheckoutTendersSchema.nullish().parse(found.paymentTenders) ?? null,
  }
}

// Persist the rendered PDF's stored URL onto the invoice row. The pdf_url column
// already exists; this is a single-row update keyed by invoice id.
export async function setInvoicePdfUrl(invoiceId: string, pdfUrl: string) {
  await db.update(invoice).set({ pdfUrl }).where(eq(invoice.id, invoiceId))
}
