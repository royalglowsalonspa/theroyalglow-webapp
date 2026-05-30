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
