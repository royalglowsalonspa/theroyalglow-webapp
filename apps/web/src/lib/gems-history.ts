/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : gems-history
 * Scope        : Presentation — the customer's gems history (/gems)
 *
 * Description  : How one gems transaction reads in the history: what it says,
 *                whether it adds to or takes from the balance, its colour and
 *                how many gems moved.
 *
 * Responsibilities :
 * - describeGemsTx(tx) → { text, sign, tone, gems }
 *
 * Tech Stack   : TypeScript
 * Layer        : Presentation (pure helpers)
 *
 * Dependencies : None
 *
 * Notes        : Stored amounts (migration 0021): earned, redeemed and
 *                returned are positive; expired is negative; an adjustment
 *                is either. Earned, returned and positive adjustments add to
 *                the balance; redeemed, expired and negative adjustments take
 *                from it. Gems come back ("returned") when a free service
 *                booked with them doesn't go ahead (multi-branch ST-03).
 ************************************************************/

type Sign = '+' | '-'

const TX_META: Readonly<Record<string, { label: string; sign: Sign | null; tone: string }>> = {
  earned: { label: 'Earned', sign: '+', tone: 'text-emerald-700' },
  redeemed: { label: 'Redeemed', sign: '-', tone: 'text-gold-ink' },
  returned: { label: 'Returned', sign: '+', tone: 'text-emerald-700' },
  expired: { label: 'Expired', sign: '-', tone: 'text-dusty-gray' },
  // An adjustment's direction is its amount's.
  adjusted: { label: 'Adjusted', sign: null, tone: 'text-cocoa-dark' },
}

export type GemsTxLine = {
  /** What the history says: the transaction's description, or its kind. */
  text: string
  sign: Sign
  /** Text colour class. */
  tone: string
  /** Gems moved, always positive; `sign` says which way. */
  gems: number
}

/** One transaction as the history shows it. */
export function describeGemsTx(tx: {
  type: string
  gemsAmount: number
  description: string | null
}): GemsTxLine {
  const meta = Object.hasOwn(TX_META, tx.type) ? TX_META[tx.type] : undefined
  const label = meta?.label ?? tx.type
  const sign: Sign = meta?.sign ?? (tx.gemsAmount < 0 ? '-' : '+')
  // Older expiries carry an internal marker ("expired:<id>") as their
  // description; show the plain label instead.
  const internalMarker = tx.type === 'expired' && tx.description?.startsWith('expired:') === true
  const text = tx.description && !internalMarker ? tx.description : label
  return { text, sign, tone: meta?.tone ?? 'text-cocoa-dark', gems: Math.abs(tx.gemsAmount) }
}
