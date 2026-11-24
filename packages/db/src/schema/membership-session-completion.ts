import { sql } from 'drizzle-orm'
import { check, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { booking } from './booking'

/** Replay metadata written in the same transaction as a keyed session completion. */
export const membershipSessionCompletion = pgTable(
  'membership_session_completion',
  {
    bookingId: text('booking_id')
      .primaryKey()
      .references(() => booking.id, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    idempotencyKey: uuid('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    remainingMinutes: integer('remaining_minutes').notNull(),
  },
  (table) => [
    unique('membership_session_completion_actor_key').on(table.actorId, table.idempotencyKey),
    check('membership_session_completion_minutes_check', sql`${table.remainingMinutes} >= 0`),
  ],
)
