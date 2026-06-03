/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : booking
 * Scope        : Database Schema — Booking
 *
 * Description  : Defines the booking domain tables including the main booking
 *                table, booking-service junction, status log, and waitlist.
 *
 * Responsibilities :
 * - Define booking table with full lifecycle status tracking
 * - Define booking_service junction with price/name snapshots
 * - Define booking_status_log for audit trail of status transitions
 * - Define waitlist table for preferred slot notifications
 *
 * Features / Functionality :
 * - Booking number format: BK-{branch}-{YYMM}-{H|S}-{random}
 * - Partial indexes on active booking statuses for query performance
 * - Composite indexes for common admin query patterns
 * - Snapshot pricing frozen at booking time (price_at_booking_paise)
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, drizzle-orm/pg-core, nanoid, ./auth, ./branch,
 *                ./enums, ./membership, ./offer, ./profile, ./service
 *
 * Notes        : A booking is always one service_type (salon OR spa, never mixed).
 *                Walk-ins skip 'pending' and go directly to 'confirmed'.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { boolean, date, index, integer, pgTable, text, time, timestamp } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { user } from './auth'
import { branch } from './branch'
import { bookingStatusEnum, serviceTypeEnum, waitlistStatusEnum } from './enums'
import { spaMembership } from './membership'
import { offer } from './offer'
import { staffProfile } from './profile'
import { service } from './service'

export const booking = pgTable(
  'booking',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    bookingNumber: text('booking_number').notNull().unique(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branch.id, { onDelete: 'restrict' }),
    customerId: text('customer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    status: bookingStatusEnum('status').notNull().default('pending'),
    serviceType: serviceTypeEnum('service_type').notNull(),
    bookingDate: date('booking_date', { mode: 'date' }).notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    totalAmountPaise: integer('total_amount_paise').notNull().default(0),
    totalDurationMinutes: integer('total_duration_minutes').notNull().default(0),
    notes: text('notes'),
    isWalkin: boolean('is_walkin').notNull().default(false),
    isMembershipSession: boolean('is_membership_session').notNull().default(false),
    offerId: text('offer_id').references(() => offer.id, { onDelete: 'set null' }),
    spaMembershipId: text('spa_membership_id').references(() => spaMembership.id, {
      onDelete: 'restrict',
    }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    cancellationReason: text('cancellation_reason'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    rejectionReason: text('rejection_reason'),
    rejectedAt: timestamp('rejected_at', { withTimezone: true, mode: 'date' }),
    rescheduleCount: integer('reschedule_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('booking_booking_date_idx').on(table.bookingDate),
    index('booking_customer_id_idx').on(table.customerId),
    index('booking_branch_id_booking_date_idx').on(table.branchId, table.bookingDate),
    index('booking_service_type_booking_date_idx').on(table.serviceType, table.bookingDate),
    index('booking_status_idx')
      .on(table.status)
      .where(sql`status NOT IN ('completed', 'cancelled', 'no_show')`),
    index('booking_offer_id_idx').on(table.offerId).where(sql`offer_id IS NOT NULL`),
    index('booking_spa_membership_id_idx')
      .on(table.spaMembershipId)
      .where(sql`spa_membership_id IS NOT NULL`),
  ],
)

export const bookingService = pgTable(
  'booking_service',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    bookingId: text('booking_id')
      .notNull()
      .references(() => booking.id, { onDelete: 'cascade' }),
    serviceId: text('service_id')
      .notNull()
      .references(() => service.id, { onDelete: 'restrict' }),
    // Nullable: pending bookings have no staff assigned yet. The receptionist
    // assigns staff on approval. (Matches LLD ERD optional relation.)
    staffId: text('staff_id').references(() => staffProfile.id, { onDelete: 'set null' }),
    serviceNameSnapshot: text('service_name_snapshot').notNull(),
    priceAtBookingPaise: integer('price_at_booking_paise').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
  },
  (table) => [index('booking_service_staff_id_idx').on(table.staffId)],
)

export const bookingStatusLog = pgTable('booking_status_log', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  bookingId: text('booking_id')
    .notNull()
    .references(() => booking.id, { onDelete: 'cascade' }),
  fromStatus: bookingStatusEnum('from_status'),
  toStatus: bookingStatusEnum('to_status').notNull(),
  changedById: text('changed_by_id')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

export const waitlist = pgTable('waitlist', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  customerId: text('customer_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  serviceId: text('service_id')
    .notNull()
    .references(() => service.id, { onDelete: 'restrict' }),
  preferredStaffId: text('preferred_staff_id').references(() => staffProfile.id, {
    onDelete: 'set null',
  }),
  preferredDate: date('preferred_date', { mode: 'date' }).notNull(),
  preferredTimeStart: time('preferred_time_start'),
  preferredTimeEnd: time('preferred_time_end'),
  status: waitlistStatusEnum('status').notNull().default('waiting'),
  notifiedAt: timestamp('notified_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})
