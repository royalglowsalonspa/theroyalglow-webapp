import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { invoiceTypeEnum, paymentMethodEnum, paymentStatusEnum } from './enums'
import { user } from './auth'
import { branch } from './branch'
import { booking } from './booking'
import { service } from './service'

export const invoice = pgTable('invoice', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  invoiceNumber: text('invoice_number').notNull().unique(),
  branchId: text('branch_id').notNull().references(() => branch.id, { onDelete: 'restrict' }),
  bookingId: text('booking_id').notNull().references(() => booking.id, { onDelete: 'restrict' }),
  customerId: text('customer_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
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
  gemsRedeemedServiceId: text('gems_redeemed_service_id').references(() => service.id, { onDelete: 'restrict' }),
  pdfUrl: text('pdf_url'),
  notes: text('notes'),
  paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index('invoice_customer_id_idx').on(table.customerId),
  index('invoice_branch_id_idx').on(table.branchId),
  index('invoice_paid_at_idx').on(table.paidAt).where(sql`payment_status = 'paid'`),
])

export const invoiceItem = pgTable('invoice_item', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  invoiceId: text('invoice_id').notNull().references(() => invoice.id, { onDelete: 'cascade' }),
  serviceId: text('service_id').notNull().references(() => service.id, { onDelete: 'restrict' }),
  serviceNameSnapshot: text('service_name_snapshot').notNull(),
  staffNameSnapshot: text('staff_name_snapshot').notNull(),
  quantity: integer('quantity').notNull().default(1),
  unitPricePaise: integer('unit_price_paise').notNull(),
  totalPricePaise: integer('total_price_paise').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
})
