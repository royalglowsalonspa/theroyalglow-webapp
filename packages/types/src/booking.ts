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
 * - availabilityQuerySchema — date + optional branchId query params
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
// `branchId` is optional: without it the server uses the default bookable
// branch (the `defaultBranchId` GET /api/branches reports). Requiring it broke
// every booking: the dialog never sent it, so the API answered 400 "Invalid
// availability query". The dialog now sends it, and a client that does not
// still gets the default branch's slots. An explicitly empty value is invalid.
export const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  branchId: z.string().min(1, 'branchId must not be empty').optional(),
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
  // Deliberately NO `isWalkin`. A booking the customer makes themselves is never
  // a walk-in: walk-ins are created only by staff through the admin portal's
  // "New walk-in" flow (adminCreateWalkinSchema), which forces the flag
  // server-side. z.object() strips unknown keys, so a client that still sends
  // `isWalkin: true` gets an ordinary pending booking instead of confirming
  // itself past the approval queue.
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
