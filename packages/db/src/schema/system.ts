import { date, index, integer, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { auditActionEnum } from './enums'
import { user } from './auth'
import { branch } from './branch'

export const dailySalesSummary = pgTable('daily_sales_summary', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  date: date('date', { mode: 'date' }).notNull(),
  branchId: text('branch_id').notNull().references(() => branch.id, { onDelete: 'restrict' }),
  totalBookings: integer('total_bookings').notNull().default(0),
  completedBookings: integer('completed_bookings').notNull().default(0),
  cancelledBookings: integer('cancelled_bookings').notNull().default(0),
  noShowBookings: integer('no_show_bookings').notNull().default(0),
  walkinBookings: integer('walkin_bookings').notNull().default(0),
  totalRevenuePaise: integer('total_revenue_paise').notNull().default(0),
  cashRevenuePaise: integer('cash_revenue_paise').notNull().default(0),
  upiRevenuePaise: integer('upi_revenue_paise').notNull().default(0),
  cardRevenuePaise: integer('card_revenue_paise').notNull().default(0),
  onlineRevenuePaise: integer('online_revenue_paise').notNull().default(0),
  discountGivenPaise: integer('discount_given_paise').notNull().default(0),
  gemsRedeemedCount: integer('gems_redeemed_count').notNull().default(0),
  newCustomers: integer('new_customers').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  unique('daily_sales_summary_date_branch_id_unique').on(table.date, table.branchId),
])

export const monthlyGstSummary = pgTable('monthly_gst_summary', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  month: text('month').notNull().unique(),
  taxableValuePaise: integer('taxable_value_paise').notNull().default(0),
  gstAmountPaise: integer('gst_amount_paise').notNull().default(0),
  invoiceCount: integer('invoice_count').notNull().default(0),
  sacCode: text('sac_code').notNull().default('999721'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  actorId: text('actor_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  action: auditActionEnum('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('audit_log_entity_type_entity_id_idx').on(table.entityType, table.entityId),
  index('audit_log_actor_id_created_at_idx').on(table.actorId, table.createdAt),
])

export const systemSetting = pgTable('system_setting', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  key: text('key').notNull().unique(),
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
})
