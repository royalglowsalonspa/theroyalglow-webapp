/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : booking (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas for customer-facing booking operations
 *                (create and cancel).
 *
 * Responsibilities :
 * - Validate booking creation input (branch, date, services)
 * - Validate cancellation reason
 *
 * Features / Functionality :
 * - availabilityQuerySchema — date + branchId query params
 * - createBookingSchema — date, time, service IDs, optional lead link
 * - cancelBookingSchema — optional cancellation reason
 * - rescheduleBookingSchema — new date + start time
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        :
 * - serviceType enforces salon OR spa per booking (never mixed)
 ************************************************************/
import { z } from 'zod'

// Booking lifecycle statuses — mirrors bookingStatusEnum in @rgss/db. Used to
// validate the optional `?status` filter on the customer booking list.
export const bookingStatusValues = [
  'pending',
  'confirmed',
  'rejected',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled',
] as const
export const bookingStatusSchema = z.enum(bookingStatusValues)
export type BookingStatusFilter = z.infer<typeof bookingStatusSchema>

// Query params for GET /api/availability?date=&branchId=. The date format is
// validated here; the past-date rejection is enforced by the business layer.
export const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  branchId: z.string().min(1, 'branchId is required'),
})
export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>

export const createBookingSchema = z.object({
  branchId: z.string().min(1),
  serviceType: z.enum(['salon', 'spa']),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  serviceIds: z.array(z.string().min(1)).min(1),
  notes: z.string().max(500).optional(),
  leadId: z.string().optional(),
  // Walk-in bookings skip the pending queue and are created directly as
  // confirmed (Requirement 5.9). Defaults to a normal customer booking.
  isWalkin: z.boolean().optional(),
})
export type CreateBookingInput = z.infer<typeof createBookingSchema>

export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
})
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>

export const rescheduleBookingSchema = z.object({
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
})
export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>
