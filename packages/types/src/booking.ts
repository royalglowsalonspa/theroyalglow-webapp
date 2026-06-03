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
 * - createBookingSchema — date, time, service IDs, optional lead link
 * - cancelBookingSchema — optional cancellation reason
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

export const createBookingSchema = z.object({
  branchId: z.string().min(1),
  serviceType: z.enum(['salon', 'spa']),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  serviceIds: z.array(z.string().min(1)).min(1),
  notes: z.string().max(500).optional(),
  leadId: z.string().optional(),
})
export type CreateBookingInput = z.infer<typeof createBookingSchema>

export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
})
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>
