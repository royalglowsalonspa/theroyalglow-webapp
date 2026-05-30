import { boolean, date, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { genderEnum, staffDesignationEnum } from './enums'
import { user } from './auth'

export const customerProfile = pgTable('customer_profile', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
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
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index('customer_profile_user_id_idx').on(table.userId),
])

export const staffProfile = pgTable('staff_profile', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
  phone: text('phone'),
  designation: staffDesignationEnum('designation').notNull(),
  bio: text('bio'),
  specialization: text('specialization'),
  isActive: boolean('is_active').notNull().default(true),
  hireDate: date('hire_date', { mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index('staff_profile_user_id_idx').on(table.userId),
])
