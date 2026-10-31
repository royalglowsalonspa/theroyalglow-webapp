/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 30-10-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : branch-setting
 * Scope        : Database Schema — branch booking settings
 *
 * Description  : Each branch's weekly business hours and booking rules, as
 *                numbered revisions (multi-branch R1.1, R6.3). Every save adds
 *                the next revision with the whole settings document; nothing
 *                is edited in place, so the settings any booking decision used
 *                can always be read back.
 *
 * Responsibilities :
 * - branch_setting: one row per branch and revision, with both sections, who
 *   saved it and which section the save changed
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, drizzle-orm/pg-core, nanoid, ./auth, ./branch,
 *                ./enums
 *
 * Notes        :
 * - The current settings are the branch's highest revision. Revision numbers
 *   start at 1 and have no gaps; a stale save collides on the unique key.
 * - Rows can't change, and go only with their branch (0020 trigger). A branch
 *   created later starts from the primary branch's current settings.
 * - The JSON shape is validated by the application (@rgss/types) on save and
 *   on read; an unreadable row is an error, never replaced with defaults.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { check, integer, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { user } from './auth'
import { branch } from './branch'
import { branchSettingSectionEnum } from './enums'

export const branchSetting = pgTable(
  'branch_setting',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    branchId: text('branch_id')
      .notNull()
      .references(() => branch.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    // Both sections, whole: the branch's settings at this revision.
    businessHours: jsonb('business_hours').notNull(),
    bookingRules: jsonb('booking_rules').notNull(),
    // The section this save changed; null for a revision copied in whole (the
    // migration backfill, or a new branch starting from the primary's).
    changedSection: branchSettingSectionEnum('changed_section'),
    // Null for copied revisions.
    createdBy: text('created_by').references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    // Also the index for reading a branch's latest revision (backward scan).
    unique('branch_setting_branch_revision_unique').on(table.branchId, table.revision),
    check('branch_setting_revision_check', sql`${table.revision} > 0`),
    check(
      'branch_setting_document_check',
      sql`jsonb_typeof(${table.businessHours}) = 'object' AND jsonb_typeof(${table.bookingRules}) = 'object'`,
    ),
  ],
)
