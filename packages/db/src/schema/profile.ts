/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : profile
 * Scope        : Database Schema — Profile
 *
 * Description  : Defines customer and staff profile tables extending the base
 *                user table with domain-specific fields and KPIs.
 *
 * Responsibilities :
 * - Define customer_profile with visit stats, spend tracking, and preferences
 * - Define staff_profile with designation, specialization, and activity status
 * - Track no-show behavior and booking approval requirements
 * - Store marketing consent and notification preferences
 *
 * Features / Functionality :
 * - One profile per user (unique constraint on user_id)
 * - Customer KPIs: total visits, total spent, no-show count, LTV
 * - UTM acquisition source tracking for marketing attribution
 * - Consecutive completed bookings counter for no-show recovery
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm/pg-core, nanoid, ./auth, ./enums
 *
 * Notes        : customer_profile is created during onboarding flow.
 *                staff_profile is created by admin when adding staff.
 ************************************************************/

import { boolean, date, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { user } from './auth'
import { genderEnum, staffDesignationEnum } from './enums'

export const customerProfile = pgTable(
  'customer_profile',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    phone: text('phone'),
    gender: genderEnum('gender'),
    dateOfBirth: date('date_of_birth', { mode: 'date' }),
    marketingConsent: boolean('marketing_consent').notNull().default(false),
    marketingConsentAt: timestamp('marketing_consent_at', { withTimezone: true, mode: 'date' }),
    appointmentRemindersEnabled: boolean('appointment_reminders_enabled').notNull().default(true),
    membershipAlertsEnabled: boolean('membership_alerts_enabled').notNull().default(true),
    acquisitionSource: text('acquisition_source'),
    utmCampaign: text('utm_campaign'),
    utmMedium: text('utm_medium'),
    utmSource: text('utm_source'),
    firstVisitAt: timestamp('first_visit_at', { withTimezone: true, mode: 'date' }),
    lastVisitAt: timestamp('last_visit_at', { withTimezone: true, mode: 'date' }),
    totalVisits: integer('total_visits').notNull().default(0),
    totalSpentPaise: integer('total_spent_paise').notNull().default(0),
    noshowCount: integer('noshow_count').notNull().default(0),
    lateCancellationCount: integer('late_cancellation_count').notNull().default(0),
    consecutiveCompletedBookings: integer('consecutive_completed_bookings').notNull().default(0),
    bookingRequiresApproval: boolean('booking_requires_approval').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('customer_profile_user_id_idx').on(table.userId)],
)

export const staffProfile = pgTable(
  'staff_profile',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    phone: text('phone'),
    designation: staffDesignationEnum('designation').notNull(),
    bio: text('bio'),
    specialization: text('specialization'),
    isActive: boolean('is_active').notNull().default(true),
    hireDate: date('hire_date', { mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('staff_profile_user_id_idx').on(table.userId)],
)
