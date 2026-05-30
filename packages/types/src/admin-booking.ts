import { z } from 'zod'

// Approve a pending booking: assign one staff member to every service, then
// transition pending → confirmed.
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
