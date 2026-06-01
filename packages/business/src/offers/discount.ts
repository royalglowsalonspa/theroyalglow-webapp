import type { OfferType } from '@rgss/types'

// Compute an offer's discount against a subtotal. All integer paise math — no
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
