/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : tax (types)
 * Scope        : Shared Types & Validation — GST configuration (multi-branch R6)
 *
 * Description  : The reviewed SAC codes, GSTIN validation and the requests
 *                that manage a branch's effective-dated tax rates
 *                (tax-settings.md §1–2).
 *
 * Responsibilities :
 * - REVIEWED_SAC_CODES / sacCodeSchema: the four provisional classifications
 * - gstinSchema: format and check character of a 15-character GSTIN
 * - taxVersionCreateSchema / taxVersionActionSchema: Developer-only changes
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod, ./branch, ./closure
 *
 * Notes        : Rates are whole basis points (500 = 5%). Only tax-inclusive
 *                prices are supported.
 ************************************************************/
import { z } from 'zod'
import { renderedBranchIdSchema } from './branch'
import { calendarDateSchema } from './closure'

/**
 * SAC codes reviewed for development (tax-settings.md §1). A service's or a
 * membership tier's tax classification is one of these.
 */
export const REVIEWED_SAC_CODES = ['999721', '999722', '999723', '999729'] as const
export type SacCode = (typeof REVIEWED_SAC_CODES)[number]
export const sacCodeSchema = z.enum(REVIEWED_SAC_CODES)

/** What each reviewed SAC code covers, for pickers and invoices. */
export const SAC_CODE_LABELS: Record<SacCode, string> = {
  '999721': 'Hair care and barber work',
  '999722': 'Facial, cosmetic care, manicure and pedicure',
  '999723': 'Spa, massage and physical wellbeing',
  '999729': 'Other beauty treatments',
}

/** The highest rate a version may carry, in basis points (28%). */
export const MAX_TAX_RATE_BPS = 2_800

export { gstinSchema, hasValidGstinCheckCharacter } from './gstin'

/** A new rate for one SAC code at a branch, from 00:00 IST on its date. */
export const taxVersionCreateSchema = z.object({
  branchId: renderedBranchIdSchema,
  sacCode: sacCodeSchema,
  rateBps: z.number().int().min(0).max(MAX_TAX_RATE_BPS),
  effectiveFrom: calendarDateSchema,
  reason: z.string().trim().min(3, 'Say why the rate changes.').max(500),
})
export type TaxVersionCreateInput = z.infer<typeof taxVersionCreateSchema>

/** Record the launch review of a version, for the branch the page shows. */
export const taxVersionReviewSchema = z.object({
  branchId: renderedBranchIdSchema,
  reviewed: z.literal(true),
})
export type TaxVersionReviewInput = z.infer<typeof taxVersionReviewSchema>

/** A tax version as the admin Tax screen shows it. */
export type TaxVersionView = {
  id: string
  branchId: string
  sacCode: string
  rateBps: number
  effectiveFrom: string
  reviewStatus: 'provisional' | 'reviewed'
  reason: string
  createdByName: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  /** In force now, scheduled for later, or replaced by a later version. */
  state: 'in_force' | 'scheduled' | 'replaced'
  usedByInvoices: boolean
}
