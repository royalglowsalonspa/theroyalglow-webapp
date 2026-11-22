import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { booking } from './booking'
import { branch } from './branch'
import { invoice } from './invoice'
import { spaMembership } from './membership'

/** An append-only correction note for a completed membership session. */
export const membershipCorrection = pgTable(
  'membership_correction',
  {
    id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
    membershipId: text('membership_id').notNull().references(() => spaMembership.id, { onDelete: 'restrict' }),
    bookingId: text('booking_id').notNull().references(() => booking.id, { onDelete: 'restrict' }),
    originalInvoiceId: text('original_invoice_id').notNull().references(() => invoice.id, { onDelete: 'restrict' }),
    branchId: text('branch_id').notNull().references(() => branch.id, { onDelete: 'restrict' }),
    idempotencyKey: uuid('idempotency_key').notNull(),
    // Positive returns minutes to the balance. Negative consumes more minutes.
    availableMinutesDelta: integer('available_minutes_delta').notNull(),
    reason: text('reason').notNull(),
    evidenceReference: text('evidence_reference'),
    performedBy: text('performed_by').notNull().references(() => user.id, { onDelete: 'restrict' }),
    performedAt: timestamp('performed_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('membership_correction_branch_key').on(table.branchId, table.idempotencyKey),
    index('membership_correction_membership_idx').on(table.membershipId, table.branchId, table.performedAt),
    index('membership_correction_invoice_idx').on(table.originalInvoiceId, table.branchId, table.performedAt),
    index('membership_correction_booking_idx').on(table.bookingId),
    check('membership_correction_delta_check', sql`abs(${table.availableMinutesDelta}::bigint) BETWEEN 1 AND 480`),
    check('membership_correction_reason_check', sql`length(btrim(${table.reason})) BETWEEN 10 AND 500`),
    check('membership_correction_evidence_check', sql`length(${table.evidenceReference}) <= 500`),
  ],
)
