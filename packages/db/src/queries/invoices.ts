/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoices
 * Scope        : Data Access — Billing / Invoices (admin ledger)
 *
 * Description  : Admin-wide invoice queries backing the Billing module: a
 *                paginated/searchable/filterable invoice ledger and a single
 *                invoice with its line items and customer identity.
 *
 * Responsibilities :
 * - List invoices (newest first) with search + status/type filters + paging
 * - Fetch one invoice with its items for the detail view
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

import type { InvoiceListQuery } from '@rgss/types'
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '../index'
import { user } from '../schema/auth'
import { invoice, invoiceItem } from '../schema/invoice'

// Paginated, searchable, filterable invoice ledger. Returns rows joined to the
// customer's identity plus a total count for pagination.
export async function getInvoices(query: InvoiceListQuery) {
  const conditions = []
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
  const where = conditions.length > 0 ? and(...conditions) : undefined
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

// A single invoice with its line items + customer identity, or null if missing.
export async function getInvoiceById(id: string) {
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
      totalAmountPaise: invoice.totalAmountPaise,
      invoiceType: invoice.invoiceType,
      paymentMethod: invoice.paymentMethod,
      paymentStatus: invoice.paymentStatus,
      paymentReference: invoice.paymentReference,
      gemsEarned: invoice.gemsEarned,
      gemsRedeemed: invoice.gemsRedeemed,
      pdfUrl: invoice.pdfUrl,
      notes: invoice.notes,
      paidAt: invoice.paidAt,
      createdAt: invoice.createdAt,
    })
    .from(invoice)
    .innerJoin(user, eq(invoice.customerId, user.id))
    .where(eq(invoice.id, id))
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
    })
    .from(invoiceItem)
    .where(eq(invoiceItem.invoiceId, id))
    .orderBy(asc(invoiceItem.displayOrder))

  return { ...found, items }
}
