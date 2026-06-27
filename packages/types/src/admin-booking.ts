/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : admin-booking (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas for admin-side booking actions —
 *                approve, reject, assign staff, and complete.
 *
 * Responsibilities :
 * - Validate booking approval with staff assignment
 * - Validate rejection with customer-facing reason
 * - Validate staff reassignment
 * - Validate completion with payment method
 *
 * Features / Functionality :
 * - adminBookingListQuerySchema — optional status/date/service-type filters
 * - adminBookingActionSchema — discriminated union (approve/reject/assign)
 * - completeBookingSchema — payment method for invoice generation
 * - adminCreateWalkinSchema — receptionist-created walk-in booking input
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        :
 * - Completion triggers invoice generation + gems award
 * - A walk-in is created directly as 'confirmed' (skips pending) and must link
 *   an EXISTING customer because booking.customer_id is a NOT NULL FK to user.
 ************************************************************/
import { z } from 'zod'
import { bookingStatusSchema } from './booking'

// Query params for GET /api/bookings (admin). All filters are optional; when
// omitted the listing returns every booking. `status` reuses the booking
// lifecycle enum, `serviceType` is salon|spa, and `date` is a YYYY-MM-DD
// calendar date. Validated here so the route stays a thin orchestrator.
export const adminBookingListQuerySchema = z.object({
  status: bookingStatusSchema.optional(),
  serviceType: z.enum(['salon', 'spa']).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
})
export type AdminBookingListQuery = z.infer<typeof adminBookingListQuerySchema>

export const approveBookingSchema = z.object({
  action: z.literal('approve'),
  staffId: z.string().min(1),
})
export type ApproveBookingInput = z.infer<typeof approveBookingSchema>

// Reject a pending booking with a customer-facing reason.
export const rejectBookingSchema = z.object({
  action: z.literal('reject'),
  rejectionReason: z.string().min(1).max(500),
})
export type RejectBookingInput = z.infer<typeof rejectBookingSchema>

// (Re)assign staff to all services on a booking, regardless of status.
export const assignBookingSchema = z.object({
  action: z.literal('assign'),
  staffId: z.string().min(1),
})
export type AssignBookingInput = z.infer<typeof assignBookingSchema>

export const adminBookingActionSchema = z.discriminatedUnion('action', [
  approveBookingSchema,
  rejectBookingSchema,
  assignBookingSchema,
])
export type AdminBookingActionInput = z.infer<typeof adminBookingActionSchema>

// Complete a booking at the counter: payment is collected in person and the
// method recorded before the invoice is generated.
export const completeBookingSchema = z.object({
  paymentMethod: z.enum(['cash', 'upi', 'card']),
})
export type CompleteBookingInput = z.infer<typeof completeBookingSchema>

// Admin walk-in booking creation (receptionist+). A walk-in is a customer who
// arrives in person, so the receptionist records the booking on their behalf
// and it is created directly as 'confirmed' — it skips the 'pending' approval
// queue (features/database steering).
//
// `customerId` is REQUIRED and must reference an existing customer (user) row:
// the `booking.customer_id` column is a NOT NULL foreign key to `user`, so a
// walk-in cannot be persisted without first linking an existing customer
// account. (Capturing a raw walk-in name/phone with no account would require a
// schema change, which is intentionally out of scope here — see the route.)
//
// The shared field shapes (serviceType, bookingDate, startTime, serviceIds,
// notes) mirror the customer-facing createBookingSchema so both surfaces stay
// in lock-step; `isWalkin`/`status` are NOT accepted from the client — the
// admin route forces them server-side.
export const adminCreateWalkinSchema = z.object({
  branchId: z.string().min(1, 'A branch is required.'),
  customerId: z.string().min(1, 'An existing customer is required.'),
  serviceType: z.enum(['salon', 'spa']),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
  serviceIds: z.array(z.string().min(1)).min(1, 'Select at least one service.'),
  notes: z.string().max(500).optional(),
})
export type AdminCreateWalkinInput = z.infer<typeof adminCreateWalkinSchema>
