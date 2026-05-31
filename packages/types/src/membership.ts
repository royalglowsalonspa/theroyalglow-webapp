import { z } from 'zod'

// Create a SPA membership. Hours/price/validity are prefilled from the tier in
// the UI but remain overridable by the admin. Money is integer paise.
export const createMembershipSchema = z.object({
  customerId: z.string().min(1),
  tierId: z.string().min(1),
  hoursMinutes: z.number().int().positive(),
  pricePaise: z.number().int().nonnegative(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validityDays: z.number().int().positive(),
  paymentMethod: z.enum(['cash', 'upi', 'card']),
  notes: z.string().max(500).optional(),
})
export type CreateMembershipInput = z.infer<typeof createMembershipSchema>

// Record a session against a membership. Each service line deducts its duration
// from the membership's remaining minutes. bookingDate defaults to today (IST).
export const recordSessionSchema = z.object({
  services: z
    .array(
      z.object({
        serviceId: z.string().min(1),
        staffId: z.string().optional(),
        durationMinutes: z.number().int().positive(),
      }),
    )
    .min(1),
  bookingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})
export type RecordSessionInput = z.infer<typeof recordSessionSchema>

export const cancelMembershipSchema = z.object({
  reason: z.string().trim().min(1).max(500),
})
export type CancelMembershipInput = z.infer<typeof cancelMembershipSchema>
