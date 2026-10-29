/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : membership (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas for SPA membership management —
 *                creation, session recording, and cancellation.
 *
 * Responsibilities :
 * - Validate membership creation (tier, hours, price in paise)
 * - Validate session recording (service lines with durations)
 * - Validate cancellation with required reason
 *
 * Features / Functionality :
 * - createMembershipSchema — Silver/Gold/Platinum tier params
 * - recordSessionSchema — deduct minutes from remaining hours
 * - cancelMembershipSchema — mandatory reason
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod, ./branch
 *
 * Notes        :
 * - Money fields are integer paise (₹1 = 100 paise)
 * - hoursMinutes is total minutes (not hours)
 ************************************************************/
import { z } from 'zod'
import { renderedBranchIdSchema } from './branch'

// Sell a membership at the branch the form was rendered for (multi-branch R2.4):
// it becomes the selling branch and issues the purchase invoice.
export const createMembershipSchema = z.object({
  branchId: renderedBranchIdSchema,
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
// The session is performed at the branch the form was rendered for.
export const recordSessionSchema = z.object({
  branchId: renderedBranchIdSchema,
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
  // Client idempotency key (e.g. crypto.randomUUID()), one per session attempt.
  // A retry with the same key returns the session already recorded instead of
  // deducting the hours twice. Optional so a tab opened before this field
  // existed still submits; the server's balance guard applies either way.
  idempotencyKey: z
    .string()
    .trim()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
})
export type RecordSessionInput = z.infer<typeof recordSessionSchema>

// Cancelling stays with the selling branch (route inventory gap 5); the body
// names the branch the page was rendered for.
export const cancelMembershipSchema = z.object({
  branchId: renderedBranchIdSchema,
  reason: z.string().trim().min(1).max(500),
})
export type CancelMembershipInput = z.infer<typeof cancelMembershipSchema>
