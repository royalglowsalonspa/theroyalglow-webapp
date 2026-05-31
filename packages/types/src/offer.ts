import { z } from 'zod'

export const OFFER_TYPES = ['percentage', 'flat', 'combo_price'] as const
export type OfferType = (typeof OFFER_TYPES)[number]

// Base object schema. Kept separate from `createOfferSchema` because `.refine`
// returns a ZodEffects which has no `.partial()` — `updateOfferSchema` derives
// from this object directly.
const offerObject = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional(),
  offerType: z.enum(OFFER_TYPES),
  discountPercentage: z.number().int().min(1).max(100).optional(),
  discountAmountPaise: z.number().int().positive().optional(),
  comboPricePaise: z.number().int().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceIds: z.array(z.string().min(1)).min(1),
  terms: z.string().max(1000).optional(),
})

// The discount field matching `offerType` must be present, and `endDate` must
// not precede `startDate`. `superRefine` attaches each failure to the offending
// field's path so the API surfaces a precise field-level error.
export const createOfferSchema = offerObject.superRefine((data, ctx) => {
  if (data.endDate < data.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'endDate must be on or after startDate',
      path: ['endDate'],
    })
  }

  if (data.offerType === 'percentage' && data.discountPercentage === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'discountPercentage is required for a percentage offer',
      path: ['discountPercentage'],
    })
  }

  if (data.offerType === 'flat' && data.discountAmountPaise === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'discountAmountPaise is required for a flat offer',
      path: ['discountAmountPaise'],
    })
  }

  if (data.offerType === 'combo_price' && data.comboPricePaise === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'comboPricePaise is required for a combo_price offer',
      path: ['comboPricePaise'],
    })
  }
})
export type CreateOfferInput = z.infer<typeof createOfferSchema>

export const updateOfferSchema = offerObject.partial().extend({
  isActive: z.boolean().optional(),
})
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>

export const applyOfferSchema = z.object({ offerId: z.string().min(1) })
export type ApplyOfferInput = z.infer<typeof applyOfferSchema>
