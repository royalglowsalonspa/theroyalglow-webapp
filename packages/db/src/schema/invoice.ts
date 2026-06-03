/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
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
 * - Define invoice_item table with service name/price snapshots
 * - Track payment status, method, and gems earned/redeemed
 * - Support three invoice types: service, membership_purchase, membership_session
 *
 * Features / Functionality :
 * - All monetary values stored in paise (integer, no floating point)
 * - GST 18% inclusive pricing with back-calculation fields
 * - Invoice number format: INV-{branch}-{FY}-{random}
 * - Partial index on paid invoices for revenue reporting
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, drizzle-orm/pg-core, nanoid, ./auth, ./booking,
 *                ./branch, ./enums, ./service
 *
 * Notes        : Membership purchase invoices have no booking (bookingId null).
 *                Gems are NOT earned on membership purchases or sessions.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { user } from './auth'
import { booking } from './booking'
import { branch } from './branch'
import { invoiceTypeEnum, paymentMethodEnum, paymentStatusEnum } from './enums'
import { service } from './service'

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
  ],
)

export const invoiceItem = pgTable('invoice_item', {
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
  totalPricePaise: integer('total_price_paise').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
})
