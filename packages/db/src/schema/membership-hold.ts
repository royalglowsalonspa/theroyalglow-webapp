/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : membership-hold
 * Scope        : Database Schema — SPA membership minute holds (§4)
 *
 * Description  : The minutes a membership session booking holds from the
 *                moment it is confirmed (or recorded now), consumed when it
 *                completes and released when it doesn't happen
 *                (membership-scheduling.md, MS-01 to MS-06).
 *
 * Responsibilities :
 * - membership_hold: one row per membership session booking, with its
 *   membership, delivering branch, minutes and state
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, drizzle-orm/pg-core, ./booking, ./branch,
 *                ./enums, ./membership
 *
 * Notes        :
 * - The database derives holds from the booking (migration 0026 triggers):
 *   a membership session booking that is confirmed or in progress holds its
 *   minutes, completing consumes them, cancelling, rejecting or missing it
 *   releases them. Application code writes bookings, never holds.
 * - The membership's `reserved_minutes` and `used_hours_minutes` are the sums
 *   of its held and consumed holds, kept by triggers and checked at commit.
 * - Who made each change is on the booking's status log.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { booking } from './booking'
import { branch } from './branch'
import { membershipHoldStateEnum } from './enums'
import { spaMembership } from './membership'

export const membershipHold = pgTable(
  'membership_hold',
  {
    id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
    spaMembershipId: text('spa_membership_id')
      .notNull()
      .references(() => spaMembership.id, { onDelete: 'restrict' }),
    // One hold per session booking: a retried confirmation holds nothing twice.
    bookingId: text('booking_id')
      .notNull()
      .unique('membership_hold_booking_unique')
      .references(() => booking.id, { onDelete: 'restrict' }),
    // The branch delivering the session.
    branchId: text('branch_id')
      .notNull()
      .references(() => branch.id, { onDelete: 'restrict' }),
    // The booking's service minutes; may change only while held and the
    // session hasn't started (its services changed).
    minutes: integer('minutes').notNull(),
    state: membershipHoldStateEnum('state').notNull().default('held'),
    heldAt: timestamp('held_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'date' }),
    releasedAt: timestamp('released_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('membership_hold_membership_held_idx')
      .on(table.spaMembershipId)
      .where(sql`state = 'held'`),
    check('membership_hold_minutes_check', sql`${table.minutes} > 0`),
    check(
      'membership_hold_state_check',
      sql`CASE ${table.state}
        WHEN 'held' THEN ${table.consumedAt} IS NULL AND ${table.releasedAt} IS NULL
        WHEN 'consumed' THEN ${table.consumedAt} IS NOT NULL AND ${table.releasedAt} IS NULL
        WHEN 'released' THEN ${table.releasedAt} IS NOT NULL AND ${table.consumedAt} IS NULL
        ELSE false
      END`,
    ),
  ],
)
