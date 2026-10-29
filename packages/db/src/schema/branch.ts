/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : branch
 * Scope        : Database Schema — Branch
 *
 * Description  : Defines the branch table representing physical salon/spa
 *                locations with address, geo-coordinates, and operational status.
 *
 * Responsibilities :
 * - Define branch table with full address and contact details
 * - Store geo-coordinates for Google Maps integration
 * - Track branch operational status and lifecycle dates
 * - Support multi-branch expansion with unique codes and numbers
 *
 * Features / Functionality :
 * - Unique branch code (e.g., RS, MH) for booking number generation
 * - Branch status enum (operational, temporarily_closed, opens_soon, shutdown)
 * - Primary branch flag for default selection
 * - Display order for UI listing
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm/pg-core, nanoid, ./auth, ./enums
 *
 * Notes        : Currently two branches: Rayasandra (operational) and
 *                Marathahalli (opens_soon).
 ************************************************************/

import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { user } from './auth'
import { branchStatusEnum } from './enums'

export const branch = pgTable(
  'branch',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    number: integer('number').notNull().unique(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    addressLine1: text('address_line1').notNull(),
    addressLine2: text('address_line2'),
    city: text('city').notNull().default('Bengaluru'),
    state: text('state').notNull().default('Karnataka'),
    pincode: text('pincode').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    googleMapsUrl: text('google_maps_url'),
    googleMapsPlaceId: text('google_maps_place_id'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    status: branchStatusEnum('status').notNull().default('operational'),
    openingDate: date('opening_date', { mode: 'date' }),
    closingDate: date('closing_date', { mode: 'date' }),
    temporaryCloseReason: text('temporary_close_reason'),
    isPrimary: boolean('is_primary').notNull().default(false),
    displayOrder: integer('display_order').notNull().default(0),
    // The branch's Owner (required, R1.2) and optional Manager. Each reference
    // is role-qualified: the *_role column is fixed to that role and the
    // composite foreign key targets user (id, role), so it holds only while
    // the user's current role matches. Changing the role without updating the
    // branch fails; the keys are DEFERRABLE (set in migration SQL, which Drizzle
    // can't declare), so a handover can do both in one transaction. Deferred
    // triggers (0006) also require every Owner to own a branch and every
    // Manager to manage one. See .kiro/specs/multi-branch-support/design.md §1.
    ownerUserId: text('owner_user_id').notNull(),
    ownerRole: text('owner_role').notNull().default('owner'),
    managerUserId: text('manager_user_id'),
    managerRole: text('manager_role').notNull().default('manager'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check('branch_owner_role_check', sql`owner_role = 'owner'`),
    check('branch_manager_role_check', sql`manager_role = 'manager'`),
    check(
      'branch_owner_is_not_manager_check',
      sql`owner_user_id IS NULL OR manager_user_id IS NULL OR owner_user_id <> manager_user_id`,
    ),
    foreignKey({
      name: 'branch_owner_fk',
      columns: [table.ownerUserId, table.ownerRole],
      foreignColumns: [user.id, user.role],
    }),
    foreignKey({
      name: 'branch_manager_fk',
      columns: [table.managerUserId, table.managerRole],
      foreignColumns: [user.id, user.role],
    }),
    index('branch_owner_user_id_idx').on(table.ownerUserId),
    index('branch_manager_user_id_idx').on(table.managerUserId),
  ],
)
