/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoice
 * Scope        : Database Schema — Invoice
 *
 * Description  : Defines invoice and invoice_item tables for GST-compliant
 *                billing with payment tracking and PDF generation support.
 *
 * Responsibilities :
 * - Define invoice table with GST breakdown (subtotal, taxable, GST, total)
 * - Snapshot the issuer, tax point, financial year and number at issue
 *   (multi-branch R6.1, R6.2)
 * - Define invoice_item table with service name/price snapshots and, per
 *   line, the SAC code, rate, discount share, taxable value and tax
 * - Track payment status, method, and gems earned/redeemed
 * - Support three invoice types: service, membership_purchase, membership_session
 *
 * Features / Functionality :
 * - All monetary values stored in paise (integer, no floating point)
 * - Tax-inclusive prices; the rate comes from the branch's tax version
 * - Invoice number RS/2627/000123: branch prefix, IST financial year and the
 *   branch's counter, allocated in the issuing statement
 * - At most one invoice per booking
 * - Partial index on paid invoices for revenue reporting
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, drizzle-orm/pg-core, nanoid, ./auth, ./booking,
 *                ./branch, ./enums, ./service, ./tax
 *
 * Notes        : Membership purchase invoices have no booking (bookingId null).
 *                Gems are NOT earned on membership purchases or sessions.
 *                Invoices issued before the snapshots existed (tax_point_at
 *                null) keep their old numbers and header-only tax; every new
 *                invoice must carry the snapshot (0018 triggers), and its
 *                snapshot can't change afterwards.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { user } from './auth'
import { booking } from './booking'
import { branch } from './branch'
import {
  discountTypeEnum,
  invoiceTypeEnum,
  paymentMethodEnum,
  paymentStatusEnum,
  taxReviewStatusEnum,
} from './enums'
import { offer } from './offer'
import { service } from './service'
import { branchTaxVersion } from './tax'

export const invoice = pgTable(
  'invoice',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    invoiceNumber: text('invoice_number').notNull().unique(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branch.id, { onDelete: 'restrict' }),
    // Nullable: a membership_purchase invoice has no underlying booking. Service
    // and membership_session invoices always set this to their booking id.
    bookingId: text('booking_id').references(() => booking.id, { onDelete: 'restrict' }),
    customerId: text('customer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    subtotalPaise: integer('subtotal_paise').notNull(),
    discountAmountPaise: integer('discount_amount_paise').notNull().default(0),
    taxableValuePaise: integer('taxable_value_paise').notNull().default(0),
    gstAmountPaise: integer('gst_amount_paise').notNull().default(0),
    // The intra-state split of gst_amount_paise, the sums of the lines'.
    cgstPaise: integer('cgst_paise'),
    sgstPaise: integer('sgst_paise'),
    totalAmountPaise: integer('total_amount_paise').notNull(),
    invoiceType: invoiceTypeEnum('invoice_type').notNull().default('service'),
    paymentMethod: paymentMethodEnum('payment_method').notNull().default('cash'),
    paymentStatus: paymentStatusEnum('payment_status').notNull().default('pending'),
    paymentReference: text('payment_reference'),
    gemsEarned: integer('gems_earned').notNull().default(0),
    gemsRedeemed: integer('gems_redeemed').notNull().default(0),
    gemsRedeemedServiceId: text('gems_redeemed_service_id').references(() => service.id, {
      onDelete: 'restrict',
    }),
    // Issue facts (R6.1, R6.2). The tax point picks the rates; for counter
    // sales it is the moment of issue. The financial year and sequence make
    // the number; the issuer is the branch as it was then.
    taxPointAt: timestamp('tax_point_at', { withTimezone: true, mode: 'date' }),
    financialYear: text('financial_year'),
    sequenceNumber: integer('sequence_number'),
    taxReviewStatus: taxReviewStatusEnum('tax_review_status'),
    issuerName: text('issuer_name'),
    issuerLegalName: text('issuer_legal_name'),
    issuerGstin: text('issuer_gstin'),
    issuerAddress: text('issuer_address'),
    issuerState: text('issuer_state'),
    // The offer applied at checkout and its rule as it was then (offers.md,
    // R6.1): a later CMS edit never changes a past invoice. The value is the
    // percentage, or paise for a flat or combo price. All four or none.
    offerId: text('offer_id').references(() => offer.id, { onDelete: 'restrict' }),
    offerNameSnapshot: text('offer_name_snapshot'),
    offerTypeSnapshot: discountTypeEnum('offer_type_snapshot'),
    offerValueSnapshot: integer('offer_value_snapshot'),
    pdfUrl: text('pdf_url'),
    notes: text('notes'),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('invoice_customer_id_idx').on(table.customerId),
    index('invoice_branch_id_idx').on(table.branchId),
    index('invoice_paid_at_idx').on(table.paidAt).where(sql`payment_status = 'paid'`),
    // A booking is billed once: a retried completion can't issue a second invoice.
    uniqueIndex('invoice_booking_id_uidx').on(table.bookingId).where(sql`booking_id IS NOT NULL`),
    uniqueIndex('invoice_branch_sequence_uidx')
      .on(table.branchId, table.financialYear, table.sequenceNumber)
      .where(sql`sequence_number IS NOT NULL`),
    index('invoice_offer_id_idx').on(table.offerId).where(sql`offer_id IS NOT NULL`),
    // The applied offer and its rule snapshot come together, or not at all.
    check(
      'invoice_offer_snapshot_check',
      sql`(${table.offerId} IS NULL) = (${table.offerNameSnapshot} IS NULL)
        AND (${table.offerId} IS NULL) = (${table.offerTypeSnapshot} IS NULL)
        AND (${table.offerId} IS NULL) = (${table.offerValueSnapshot} IS NULL)
        AND coalesce(${table.offerValueSnapshot}, 1) > 0`,
    ),
    // A snapshotted invoice carries every issue fact, and its amounts add up.
    check(
      'invoice_snapshot_check',
      sql`${table.taxPointAt} IS NULL OR (
        ${table.financialYear} ~ '^[0-9]{4}$'
        AND ${table.sequenceNumber} > 0
        AND ${table.taxReviewStatus} IS NOT NULL
        AND ${table.issuerName} IS NOT NULL
        AND ${table.issuerAddress} IS NOT NULL
        AND ${table.cgstPaise} >= 0
        AND ${table.sgstPaise} >= 0
        AND ${table.cgstPaise} + ${table.sgstPaise} = ${table.gstAmountPaise}
        AND ${table.taxableValuePaise} + ${table.gstAmountPaise} = ${table.totalAmountPaise}
        AND char_length(${table.invoiceNumber}) <= 16
      )`,
    ),
  ],
)

export const invoiceItem = pgTable(
  'invoice_item',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoice.id, { onDelete: 'cascade' }),
    // Nullable: a membership_purchase line item is not tied to a catalogue service
    // or a staff member. Service and membership_session items always set both.
    serviceId: text('service_id').references(() => service.id, { onDelete: 'restrict' }),
    serviceNameSnapshot: text('service_name_snapshot').notNull(),
    staffNameSnapshot: text('staff_name_snapshot'),
    quantity: integer('quantity').notNull().default(1),
    unitPricePaise: integer('unit_price_paise').notNull(),
    // The line's tax-inclusive amount before its discount share.
    totalPricePaise: integer('total_price_paise').notNull(),
    // The line's tax facts (R6.1): its SAC code, the version and rate used,
    // its share of the invoice discount, and the taxable value and tax on
    // total − discount. Null on items issued before the snapshots existed.
    sacCode: text('sac_code'),
    taxVersionId: text('tax_version_id').references(() => branchTaxVersion.id, {
      onDelete: 'restrict',
    }),
    rateBps: integer('rate_bps'),
    discountPaise: integer('discount_paise'),
    taxableValuePaise: integer('taxable_value_paise'),
    taxPaise: integer('tax_paise'),
    cgstPaise: integer('cgst_paise'),
    sgstPaise: integer('sgst_paise'),
    displayOrder: integer('display_order').notNull().default(0),
  },
  (table) => [
    index('invoice_item_invoice_id_idx').on(table.invoiceId),
    index('invoice_item_tax_version_id_idx').on(table.taxVersionId),
    check(
      'invoice_item_tax_check',
      sql`${table.taxVersionId} IS NULL OR (
        ${table.sacCode} ~ '^[0-9]{6}$'
        AND ${table.rateBps} BETWEEN 0 AND 2800
        AND ${table.discountPaise} BETWEEN 0 AND ${table.totalPricePaise}
        AND ${table.taxableValuePaise} >= 0
        AND ${table.taxPaise} >= 0
        AND ${table.taxableValuePaise} + ${table.taxPaise} = ${table.totalPricePaise} - ${table.discountPaise}
        AND ${table.cgstPaise} >= 0
        AND ${table.sgstPaise} >= 0
        AND ${table.cgstPaise} + ${table.sgstPaise} = ${table.taxPaise}
      )`,
    ),
  ],
)
