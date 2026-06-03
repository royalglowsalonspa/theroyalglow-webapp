/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : discount
 * Scope        : Business Logic — Offers
 *
 * Description  : Computes offer discounts against a subtotal.
 *                All integer paise math — no floating point.
 *
 * Responsibilities :
 * - Calculate discount amount based on offer type
 * - Clamp discount to valid range (0 ≤ discount ≤ subtotal)
 *
 * Features / Functionality :
 * - computeOfferDiscount(offer, subtotalPaise) → { discountPaise, finalPaise }
 * - Supports: percentage, flat, combo_price offer types
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : @rgss/types (OfferType)
 *
 * Notes        :
 * - percentage: floor(subtotal * pct / 100)
 * - flat: min(amount, subtotal)
 * - combo_price: max(0, subtotal - comboPrice)
 ************************************************************/
import type { OfferType } from '@rgss/types'
// floats are ever stored. The three offer types each derive a raw discount:
//   percentage  → floor(subtotal * pct / 100)   (never exceeds the subtotal)
//   flat        → min(amount, subtotal)          (capped at the subtotal)
//   combo_price → max(0, subtotal - comboPrice)  (the saving vs the combo price)
// The result is then clamped to 0 ≤ discountPaise ≤ subtotalPaise so the final
// amount is always a non-negative integer (finalPaise = subtotal - discount).
export function computeOfferDiscount(
  offer: {
    offerType: OfferType
    discountPercentage?: number | null
    discountAmountPaise?: number | null
    comboPricePaise?: number | null
  },
  subtotalPaise: number,
): { discountPaise: number; finalPaise: number } {
  let discountPaise: number
  switch (offer.offerType) {
    case 'percentage':
      discountPaise = Math.floor((subtotalPaise * (offer.discountPercentage ?? 0)) / 100)
      break
    case 'flat':
      discountPaise = Math.min(offer.discountAmountPaise ?? 0, subtotalPaise)
      break
    case 'combo_price':
      discountPaise = Math.max(0, subtotalPaise - (offer.comboPricePaise ?? 0))
      break
  }

  discountPaise = Math.max(0, Math.min(discountPaise, subtotalPaise))
  const finalPaise = subtotalPaise - discountPaise
  return { discountPaise, finalPaise }
}
