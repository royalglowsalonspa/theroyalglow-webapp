import type { MembershipCorrectionInput } from '@rgss/types'
import { desc, eq, type SQL, sql } from 'drizzle-orm'
import { db } from '../index'
import { user } from '../schema/auth'
import { invoice } from '../schema/invoice'
import { spaMembership } from '../schema/membership'
import { membershipCorrection } from '../schema/membership-correction'
import { isConstraintViolation, SQLSTATE } from './driver-errors'

const columns = {
  id: membershipCorrection.id,
  membershipId: membershipCorrection.membershipId,
  bookingId: membershipCorrection.bookingId,
  originalInvoiceId: membershipCorrection.originalInvoiceId,
  invoiceNumber: invoice.invoiceNumber,
  branchId: membershipCorrection.branchId,
  availableMinutesDelta: membershipCorrection.availableMinutesDelta,
  reason: membershipCorrection.reason,
  evidenceReference: membershipCorrection.evidenceReference,
  performedBy: membershipCorrection.performedBy,
  performedByName: user.name,
  performedAt: membershipCorrection.performedAt,
}

function correctionRows(predicate: SQL) {
  return db
    .select(columns)
    .from(membershipCorrection)
    .innerJoin(invoice, eq(invoice.id, membershipCorrection.originalInvoiceId))
    .innerJoin(user, eq(user.id, membershipCorrection.performedBy))
    .where(predicate)
}

export function listMembershipCorrections(
  params: { branchId: string } & (
    | { membershipId: string; invoiceId?: never }
    | { invoiceId: string; membershipId?: never }
  ),
) {
  const target =
    params.membershipId === undefined
      ? eq(membershipCorrection.originalInvoiceId, params.invoiceId)
      : eq(membershipCorrection.membershipId, params.membershipId)
  return correctionRows(
    sql`${eq(membershipCorrection.branchId, params.branchId)} AND ${target}`,
  ).orderBy(desc(membershipCorrection.performedAt), desc(membershipCorrection.id))
}

const REFUSALS = {
  membership_correction_target: 'target',
  membership_correction_actor: 'actor',
  membership_correction_balance: 'balance',
  membership_correction_settlement_reversed: 'settlement',
} as const

export async function recordMembershipCorrection(
  input: MembershipCorrectionInput & { performedBy: string },
) {
  const evidenceReference = input.evidenceReference ?? null
  const byKey = correctionRows(sql`${eq(membershipCorrection.branchId, input.branchId)}
      AND ${eq(membershipCorrection.idempotencyKey, input.idempotencyKey)}`).limit(1)
  const balance = (membershipId: string) =>
    db
      .select({
        remainingMinutes: sql<number>`${spaMembership.totalHoursMinutes} - ${spaMembership.usedHoursMinutes}
      - ${spaMembership.reservedMinutes}`,
      })
      .from(spaMembership)
      .where(eq(spaMembership.id, membershipId))

  async function replay() {
    const [existing] = await byKey
    if (!existing) return null
    if (
      existing.membershipId !== input.membershipId ||
      existing.bookingId !== input.bookingId ||
      existing.originalInvoiceId !== input.originalInvoiceId ||
      existing.availableMinutesDelta !== input.availableMinutesDelta ||
      existing.reason !== input.reason ||
      existing.evidenceReference !== evidenceReference
    ) {
      return { ok: false, reason: 'duplicate_key' } as const
    }
    const [balanceNow] = await balance(existing.membershipId)
    if (!balanceNow) throw new Error('Membership for a correction is missing')
    return { ok: true, correction: existing, ...balanceNow, duplicate: true } as const
  }

  const existing = await replay()
  if (existing) return existing
  try {
    const [, , records, totals] = await db.batch([
      // Take the same lock as reservation writes before the guard reads their totals.
      db.execute(sql`select id from ${spaMembership} where id = ${input.membershipId} for update`),
      db.insert(membershipCorrection).values({ ...input, evidenceReference }),
      byKey,
      balance(input.membershipId),
    ])
    const [correction] = records
    const [balanceNow] = totals
    if (!correction || !balanceNow) throw new Error('Recorded membership correction is missing')
    return { ok: true, correction, ...balanceNow, duplicate: false } as const
  } catch (error) {
    const retry = await replay()
    if (retry) return retry
    for (const [guard, reason] of Object.entries(REFUSALS)) {
      if (isConstraintViolation(error, SQLSTATE.checkViolation, [guard])) {
        return { ok: false, reason } as const
      }
    }
    throw error
  }
}
