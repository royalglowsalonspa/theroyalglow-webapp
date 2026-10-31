/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : staff-occupancy
 * Scope        : Database Schema — staff occupancy (§4 slice 2)
 *
 * Description  : Who is booked when, and who is working now, across every
 *                branch (membership-scheduling.md, MS-07, MS-08, MS-10).
 *
 * Responsibilities :
 * - staff_occupancy: the planned interval of each confirmed or in-progress
 *   booking that has its one assignee
 * - staff_work: the actual interval of each booking that started, open
 *   while it runs
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL (btree_gist)
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, drizzle-orm/pg-core, ./booking, ./branch,
 *                ./enums, ./profile
 *
 * Notes        :
 * - Projections the database keeps (migration 0028 triggers on booking and
 *   booking_service); application code never writes them, and a direct write
 *   is refused. A person is their staff profile, one per person, so a clash
 *   counts at every branch.
 * - Exclusion constraints (0028, btree_gist; Drizzle can't declare them):
 *   a SPA interval overlaps no other interval of the same person, SPA or
 *   salon; two salon intervals may overlap. Intervals are half-open, so
 *   back-to-back bookings don't overlap.
 * - `during` is read and written as Postgres range text, e.g.
 *   ["2026-10-31 04:30:00+00","2026-10-31 05:30:00+00").
 ************************************************************/

import { sql } from 'drizzle-orm'
import { check, customType, pgTable, text } from 'drizzle-orm/pg-core'
import { booking } from './booking'
import { branch } from './branch'
import { serviceTypeEnum } from './enums'
import { staffProfile } from './profile'

/** A Postgres `tstzrange`, as its text form. */
export const tstzrange = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tstzrange'
  },
})

// When each confirmed or in-progress booking keeps its assignee busy: its
// planned IST start to end. One row per booking with a single assignee.
export const staffOccupancy = pgTable(
  'staff_occupancy',
  {
    bookingId: text('booking_id')
      .primaryKey()
      .references(() => booking.id, { onDelete: 'cascade' }),
    // Removing a staff profile clears it from its booking lines (SET NULL),
    // which takes its rows away too.
    staffId: text('staff_id')
      .notNull()
      .references(() => staffProfile.id, { onDelete: 'cascade' }),
    branchId: text('branch_id')
      .notNull()
      .references(() => branch.id, { onDelete: 'restrict' }),
    kind: serviceTypeEnum('kind').notNull(),
    during: tstzrange('during').notNull(),
  },
  (table) => [
    check(
      'staff_occupancy_during_check',
      sql`NOT isempty(${table.during}) AND NOT lower_inf(${table.during})
        AND NOT upper_inf(${table.during}) AND lower_inc(${table.during})
        AND NOT upper_inc(${table.during})`,
    ),
  ],
)

// When each booking that started actually kept its assignee busy: from the
// start to completion, with no end while it runs. Completed rows stay for the
// record and for later clash checks.
export const staffWork = pgTable(
  'staff_work',
  {
    bookingId: text('booking_id')
      .primaryKey()
      .references(() => booking.id, { onDelete: 'cascade' }),
    staffId: text('staff_id')
      .notNull()
      .references(() => staffProfile.id, { onDelete: 'cascade' }),
    branchId: text('branch_id')
      .notNull()
      .references(() => branch.id, { onDelete: 'restrict' }),
    kind: serviceTypeEnum('kind').notNull(),
    during: tstzrange('during').notNull(),
  },
  (table) => [
    check(
      'staff_work_during_check',
      sql`NOT isempty(${table.during}) AND NOT lower_inf(${table.during})
        AND lower_inc(${table.during}) AND NOT upper_inc(${table.during})`,
    ),
  ],
)
