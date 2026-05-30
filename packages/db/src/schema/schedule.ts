import { boolean, index, integer, pgTable, text, time, timestamp, unique } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { leaveApprovalStatusEnum, leaveTypeEnum } from './enums'
import { staffProfile } from './profile'
import { user } from './auth'

export const staffSchedule = pgTable('staff_schedule', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  staffId: text('staff_id').notNull().references(() => staffProfile.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(),
  startTime: time('start_time'),
  endTime: time('end_time'),
  isWorking: boolean('is_working').notNull().default(true),
}, (table) => [
  unique('staff_schedule_staff_id_day_of_week_unique').on(table.staffId, table.dayOfWeek),
  index('staff_schedule_staff_id_day_of_week_idx').on(table.staffId, table.dayOfWeek),
])

export const staffTimeOff = pgTable('staff_time_off', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  staffId: text('staff_id').notNull().references(() => staffProfile.id, { onDelete: 'cascade' }),
  leaveType: leaveTypeEnum('leave_type').notNull().default('personal'),
  date: text('date').notNull(),
  reason: text('reason'),
  approvalStatus: leaveApprovalStatusEnum('approval_status').notNull().default('pending'),
  reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique('staff_time_off_staff_id_date_unique').on(table.staffId, table.date),
  index('staff_time_off_staff_id_date_idx').on(table.staffId, table.date),
])

export const businessHour = pgTable('business_hour', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  dayOfWeek: integer('day_of_week').notNull().unique(),
  openTime: time('open_time'),
  closeTime: time('close_time'),
  isOpen: boolean('is_open').notNull().default(true),
})

export const holiday = pgTable('holiday', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  date: text('date').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})
