/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 30-10-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : settlement/value
 * Scope        : Business Logic — what branches owe each other (R10)
 *
 * Description  : Values for the cross-branch settlement ledger. A membership
 *                session is worth its share of what the customer paid; a gem
 *                spent at another branch is worth the Developer's value per
 *                gem. The performing branch is owed the value without its GST
 *                share, at the Developer's share rate. A month's entries net
 *                into one amount per pair of branches.
 *
 * Responsibilities :
 * - membershipSessionValue: value, GST share and amount owed for a session,
 *   in 64-bit integers, so that a membership's sessions add up exactly
 * - gemsEntryValue: value and amount owed for gems spent elsewhere
 * - netPair: a pair's totals each way and the net payment
 * - istMonthOf: the IST calendar month an entry belongs to
 *
 * Tech Stack   : TypeScript (BigInt)
 * Layer        : Business Logic
 *
 * Dependencies : None
 *
 * Notes        : The database writes each entry in the statement that
 *                consumes the minutes or completes the free service, with
 *                the same formulas in SQL (packages/db queries); these pure
 *                versions are the specification the live suite checks them
 *                against (membership-scheduling.md, settlement.md).
 ************************************************************/

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

/** floor(a × b / c) for non-negative integers, without 32-bit overflow. */
function mulDiv(a: number, b: number, c: number): bigint {
  return (BigInt(a) * BigInt(b)) / BigInt(c)
}

function assertWhole(value: number, name: string, min: number): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new RangeError(`${name} must be a whole number of at least ${min}`)
  }
}

/** The part of an amount the performing branch receives at `shareBps` (10000 = 100%). */
export function shareOf(amountPaise: bigint, shareBps: number): bigint {
  assertWhole(shareBps, 'shareBps', 0)
  if (shareBps > 10_000) {
    throw new RangeError('shareBps must be at most 10000')
  }
  return (amountPaise * BigInt(shareBps)) / 10_000n
}

export type MembershipSessionValueInput = {
  /** What the customer paid for the membership, GST included (P). */
  pricePaise: number
  /** The GST on the membership's purchase invoice (G). */
  gstPaise: number
  /** Minutes purchased (T). */
  totalMinutes: number
  /** Minutes used by earlier sessions (c). */
  usedBeforeMinutes: number
  /** This session's minutes (n). */
  minutes: number
  /** Share of the amount the performing branch receives. */
  shareBps: number
}

export type SessionValue = {
  valuePaise: bigint
  gstSharePaise: bigint
  amountOwedPaise: bigint
}

/**
 * A session's value is the price share for all minutes used so far minus the
 * share earlier sessions had: floor(P(c+n)/T) − floor(Pc/T). Its GST share is
 * the same formula on the purchase GST. Once every minute is used, the values
 * add up to exactly P and the GST shares to exactly G. The performing branch
 * is owed the value without its GST share, at the share rate.
 */
export function membershipSessionValue(input: MembershipSessionValueInput): SessionValue {
  const { pricePaise, gstPaise, totalMinutes, usedBeforeMinutes, minutes, shareBps } = input
  assertWhole(pricePaise, 'pricePaise', 0)
  assertWhole(gstPaise, 'gstPaise', 0)
  assertWhole(totalMinutes, 'totalMinutes', 1)
  assertWhole(usedBeforeMinutes, 'usedBeforeMinutes', 0)
  assertWhole(minutes, 'minutes', 1)
  if (gstPaise > pricePaise) {
    throw new RangeError('gstPaise cannot exceed pricePaise')
  }
  if (usedBeforeMinutes + minutes > totalMinutes) {
    throw new RangeError('a session cannot use more minutes than remain')
  }
  const after = usedBeforeMinutes + minutes
  const valuePaise =
    mulDiv(pricePaise, after, totalMinutes) - mulDiv(pricePaise, usedBeforeMinutes, totalMinutes)
  const gstSharePaise =
    mulDiv(gstPaise, after, totalMinutes) - mulDiv(gstPaise, usedBeforeMinutes, totalMinutes)
  return {
    valuePaise,
    gstSharePaise,
    amountOwedPaise: shareOf(valuePaise - gstSharePaise, shareBps),
  }
}

/** Gems spent at a branch other than the one that issued them. No GST is added (settlement.md). */
export function gemsEntryValue(input: {
  gems: number
  gemValuePaise: number
  shareBps: number
}): SessionValue {
  assertWhole(input.gems, 'gems', 1)
  assertWhole(input.gemValuePaise, 'gemValuePaise', 1)
  const valuePaise = BigInt(input.gems) * BigInt(input.gemValuePaise)
  return { valuePaise, gstSharePaise: 0n, amountOwedPaise: shareOf(valuePaise, input.shareBps) }
}

/** An entry as netting sees it. Internal entries (owing = owed) never net. */
export type NettableEntry = {
  owingBranchId: string
  owedBranchId: string
  kind: 'membership_session' | 'gems_redemption' | 'reversal'
  /** For a reversal, the kind it reverses. */
  reversedKind?: 'membership_session' | 'gems_redemption'
  amountOwedPaise: bigint
}

export type PairTotals = {
  membershipPaise: bigint
  gemsPaise: bigint
}

export type PairNet = {
  /** The two branches in id order. */
  branchAId: string
  branchBId: string
  aOwesB: PairTotals
  bOwesA: PairTotals
  /** Who pays the difference; null when it nets to zero. */
  payingBranchId: string | null
  receivingBranchId: string | null
  netPaise: bigint
  entryCount: number
}

/** A pair's totals each way and the net, from its month's entries. */
export function netPair(
  branchAId: string,
  branchBId: string,
  entries: readonly NettableEntry[],
): PairNet {
  if (!(branchAId < branchBId)) {
    throw new RangeError('branchAId must sort before branchBId')
  }
  const aOwesB: PairTotals = { membershipPaise: 0n, gemsPaise: 0n }
  const bOwesA: PairTotals = { membershipPaise: 0n, gemsPaise: 0n }
  let entryCount = 0
  for (const entry of entries) {
    const forward = entry.owingBranchId === branchAId && entry.owedBranchId === branchBId
    const backward = entry.owingBranchId === branchBId && entry.owedBranchId === branchAId
    if (!forward && !backward) {
      continue
    }
    entryCount += 1
    const totals = forward ? aOwesB : bOwesA
    const kind = entry.kind === 'reversal' ? entry.reversedKind : entry.kind
    if (kind === 'gems_redemption') {
      totals.gemsPaise += entry.amountOwedPaise
    } else {
      totals.membershipPaise += entry.amountOwedPaise
    }
  }
  const diff =
    aOwesB.membershipPaise + aOwesB.gemsPaise - (bOwesA.membershipPaise + bOwesA.gemsPaise)
  return {
    branchAId,
    branchBId,
    aOwesB,
    bOwesA,
    payingBranchId: diff > 0n ? branchAId : diff < 0n ? branchBId : null,
    receivingBranchId: diff > 0n ? branchBId : diff < 0n ? branchAId : null,
    netPaise: diff < 0n ? -diff : diff,
    entryCount,
  }
}

/** The IST calendar month of an instant, as "YYYY-MM". */
export function istMonthOf(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 7)
}

/** The month after "YYYY-MM". */
export function nextMonth(month: string): string {
  const [y = 0, m = 1] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}
