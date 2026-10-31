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
 * - createMembershipSchema — a sale: whole hours, agreed price, expiry date
 * - membershipTierCreateSchema / membershipTierUpdateSchema — tier templates
 * - MEMBERSHIP_SALE_LIMITS, DEFAULT_MEMBERSHIP_SAC_CODE (codes in ./tax)
 * - recordSessionSchema — deduct minutes from remaining hours
 * - cancelMembershipSchema — mandatory reason
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod, ./branch, ./closure
 *
 * Notes        :
 * - Money fields are integer paise (₹1 = 100 paise)
 * - A sale sends whole hours; the database stores minutes
 ************************************************************/
import { z } from 'zod'
import { renderedBranchIdSchema } from './branch'
import { calendarDateSchema } from './closure'
import { type SacCode, sacCodeSchema } from './tax'

/**
 * Bounds of a membership sale (multi-branch R9, MS-14–MS-16). The pool moves
 * in whole hours from 1 hour; the caps catch typing mistakes, not deals.
 */
export const MEMBERSHIP_SALE_LIMITS = {
  minHours: 1,
  maxHours: 500,
  /** ₹10,00,000.00 */
  maxPricePaise: 100_000_000,
  /** How far ahead a membership may start. */
  maxStartDaysAhead: 60,
  /** The longest validity, start to expiry. */
  maxValidityDays: 1095,
} as const

/** A SPA-only prepaid membership maps to the spa service (provisional). */
export const DEFAULT_MEMBERSHIP_SAC_CODE: SacCode = '999723'

// Sell a membership at the branch the form was rendered for (multi-branch R2.4):
// it becomes the selling branch and issues the purchase invoice. Hours and the
// agreed price are independent of each other and of the tier (R9.3).
export const createMembershipSchema = z.object({
  branchId: renderedBranchIdSchema,
  customerId: z.string().min(1),
  tierId: z.string().min(1),
  // Whole hours (MS-15); stored as minutes.
  hours: z
    .number()
    .int('Hours must be whole hours.')
    .min(MEMBERSHIP_SALE_LIMITS.minHours, 'At least 1 hour.')
    .max(MEMBERSHIP_SALE_LIMITS.maxHours),
  // The agreed price, GST-inclusive, in paise; more than zero.
  pricePaise: z
    .number()
    .int()
    .positive('Enter the agreed price.')
    .max(MEMBERSHIP_SALE_LIMITS.maxPricePaise),
  // IST business dates. The start defaults to today in IST.
  startDate: calendarDateSchema.optional(),
  expiresOn: calendarDateSchema,
  paymentMethod: z.enum(['cash', 'upi', 'card']),
  notes: z.string().trim().max(500).optional(),
})
export type CreateMembershipInput = z.infer<typeof createMembershipSchema>

// A tier is a starting template for a sale (R9.4). Hours are whole hours; 0
// usual hours or ₹0 usual price means "agree it at the counter".
const tierName = z.string().trim().min(1, 'Name the tier.').max(60)
const tierUsualHours = z.number().int().min(0).max(MEMBERSHIP_SALE_LIMITS.maxHours)
const tierUsualPrice = z.number().int().min(0).max(MEMBERSHIP_SALE_LIMITS.maxPricePaise)
const tierUsualValidity = z.number().int().min(1).max(MEMBERSHIP_SALE_LIMITS.maxValidityDays)
const tierOrder = z.number().int().min(0).max(999)

export const membershipTierCreateSchema = z.object({
  name: tierName,
  usualHours: tierUsualHours,
  usualPricePaise: tierUsualPrice,
  usualValidityDays: tierUsualValidity,
  isActive: z.boolean().optional(),
  displayOrder: tierOrder.optional(),
  // Developer only.
  sacCode: sacCodeSchema.optional(),
})
export type MembershipTierCreateInput = z.infer<typeof membershipTierCreateSchema>

export const membershipTierUpdateSchema = z
  .object({
    name: tierName.optional(),
    usualHours: tierUsualHours.optional(),
    usualPricePaise: tierUsualPrice.optional(),
    usualValidityDays: tierUsualValidity.optional(),
    isActive: z.boolean().optional(),
    displayOrder: tierOrder.optional(),
    // Developer only.
    sacCode: sacCodeSchema.optional(),
  })
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), 'Nothing to change.')
export type MembershipTierUpdateInput = z.infer<typeof membershipTierUpdateSchema>

// Record a session against a membership, at the branch the form was rendered
// for. Each service line holds its duration from the membership's free minutes.
// Without a startTime the session starts now ("Record now"; bookingDate, if
// sent, is today in IST). With one, it is booked ahead for bookingDate at that
// IST time, which is then required (membership-scheduling.md).
export const recordSessionSchema = z
  .object({
    branchId: renderedBranchIdSchema,
    // Who does the session: one person for all of it (membership-scheduling.md).
    // A form from before this field names them on its lines instead, and they
    // must all be the same person.
    staffId: z.string().min(1).optional(),
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
    // The planned IST start of a session booked ahead, HH:MM.
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format')
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
  .refine((v) => v.startTime === undefined || v.bookingDate !== undefined, {
    message: 'Choose the date of the session booked ahead.',
    path: ['bookingDate'],
  })
export type RecordSessionInput = z.infer<typeof recordSessionSchema>

// Cancelling stays with the selling branch (route inventory gap 5); the body
// names the branch the page was rendered for.
export const cancelMembershipSchema = z.object({
  branchId: renderedBranchIdSchema,
  reason: z.string().trim().min(1).max(500),
})
export type CancelMembershipInput = z.infer<typeof cancelMembershipSchema>
