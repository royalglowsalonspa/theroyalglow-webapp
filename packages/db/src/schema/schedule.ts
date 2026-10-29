/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : schedule
 * Scope        : Database Schema — Schedule
 *
 * Description  : Defines staff scheduling tables including weekly schedules,
 *                time-off/leave requests, business hours, and holidays.
 *
 * Responsibilities :
 * - Define staff_schedule for recurring weekly availability
 * - Define staff_time_off for leave requests with approval workflow
 * - Define business_hour for salon operating hours per day of week
 * - Define holiday table for branch-wide closure dates
 *
 * Features / Functionality :
 * - Unique constraint on (staff, day_of_week) for schedule
 * - Leave approval workflow: pending → approved/rejected
 * - Leave types: sick, casual, personal, other
 * - Unique constraint on (staff, date) preventing duplicate leave requests
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm/pg-core, nanoid, ./auth, ./enums, ./profile
 *
 * Notes        : Business hours and holidays are shared across all staff.
 *                Staff schedules are per-staff-member weekly patterns.
 ************************************************************/

import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { user } from './auth'
import { branch } from './branch'
import { leaveApprovalStatusEnum, leaveTypeEnum } from './enums'
import { staffProfile } from './profile'

export const staffSchedule = pgTable(
  'staff_schedule',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    staffId: text('staff_id')
      .notNull()
      .references(() => staffProfile.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(),
    startTime: time('start_time'),
    endTime: time('end_time'),
    isWorking: boolean('is_working').notNull().default(true),
    // The branch this person works at on this weekday. One row per weekday, so
    // a Manager shared between branches is at one branch per day.
    branchId: text('branch_id').references(() => branch.id, { onDelete: 'restrict' }),
  },
  (table) => [
    unique('staff_schedule_staff_id_day_of_week_unique').on(table.staffId, table.dayOfWeek),
    index('staff_schedule_staff_id_day_of_week_idx').on(table.staffId, table.dayOfWeek),
    index('staff_schedule_branch_id_day_of_week_idx').on(table.branchId, table.dayOfWeek),
  ],
)

export const staffTimeOff = pgTable(
  'staff_time_off',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    staffId: text('staff_id')
      .notNull()
      .references(() => staffProfile.id, { onDelete: 'cascade' }),
    leaveType: leaveTypeEnum('leave_type').notNull().default('personal'),
    date: text('date').notNull(),
    reason: text('reason'),
    approvalStatus: leaveApprovalStatusEnum('approval_status').notNull().default('pending'),
    reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('staff_time_off_staff_id_date_unique').on(table.staffId, table.date),
    index('staff_time_off_staff_id_date_idx').on(table.staffId, table.date),
  ],
)

export const businessHour = pgTable('business_hour', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  dayOfWeek: integer('day_of_week').notNull().unique(),
  openTime: time('open_time'),
  closeTime: time('close_time'),
  isOpen: boolean('is_open').notNull().default(true),
})

// A day a branch is closed: a holiday or a one-off closure (multi-branch R1.8).
// `branchId` null closes every branch; only the Developer adds those. Each date
// is closed at most once per branch and once for every branch. A branch's
// closures go with it if an empty branch is ever deleted.
export const holiday = pgTable(
  'holiday',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    branchId: text('branch_id').references(() => branch.id, { onDelete: 'cascade' }),
    // An IST calendar date, 'YYYY-MM-DD'.
    date: text('date').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('holiday_branch_date_uidx')
      .on(table.branchId, table.date)
      .where(sql`branch_id IS NOT NULL`),
    uniqueIndex('holiday_all_branches_date_uidx').on(table.date).where(sql`branch_id IS NULL`),
  ],
)
