/************************************************************
 * Module Name  : realtime-revocations
 * Scope        : Data Access — realtime token revocation outbox (R2.6)
 *
 * Description  : When someone's role or branches change, the tokens they hold
 *                for live updates must stop working. The intent is recorded in
 *                the same transaction as the change (realtimeRevocationStatement
 *                inside applyBranchRolePlan), so it can't be lost; the admin
 *                portal then asks Ably to revoke and records how it ended here.
 *
 * Responsibilities :
 * - realtimeRevocationStatement: the insert for a role-change batch
 * - getPendingRealtimeRevocations: what still needs doing, oldest first
 * - recordRealtimeRevocationAttempt: a call to Ably, and whether it failed
 * - resolveRealtimeRevocations: how pending rows ended
 *
 * Notes        : Every write here touches only pending rows, so a retry or a
 *                concurrent run never overwrites an outcome.
 ************************************************************/

import { and, asc, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../index'
import { realtimeRevocation } from '../schema/system'

export type RealtimeRevocationOutcome = NonNullable<
  (typeof realtimeRevocation.$inferSelect)['outcome']
>

export type PendingRealtimeRevocation = {
  id: string
  userId: string
  requestedAt: Date
  attempts: number
  lastAttemptAt: Date | null
  lastError: string | null
}

/** The insert recording that `userId`'s realtime tokens must be revoked. */
export function realtimeRevocationStatement(userId: string) {
  return db.insert(realtimeRevocation).values({ userId })
}

/**
 * Pending revocations, oldest first: every pending row, or only those of
 * `userIds`. At most `limit` (Ably accepts 100 targets per request).
 */
export async function getPendingRealtimeRevocations(
  options: { userIds?: readonly string[]; limit?: number } = {},
): Promise<PendingRealtimeRevocation[]> {
  const conditions = [isNull(realtimeRevocation.resolvedAt)]
  if (options.userIds) {
    if (options.userIds.length === 0) {
      return []
    }
    conditions.push(inArray(realtimeRevocation.userId, [...options.userIds]))
  }
  return db
    .select({
      id: realtimeRevocation.id,
      userId: realtimeRevocation.userId,
      requestedAt: realtimeRevocation.requestedAt,
      attempts: realtimeRevocation.attempts,
      lastAttemptAt: realtimeRevocation.lastAttemptAt,
      lastError: realtimeRevocation.lastError,
    })
    .from(realtimeRevocation)
    .where(and(...conditions))
    .orderBy(asc(realtimeRevocation.requestedAt), asc(realtimeRevocation.id))
    .limit(options.limit ?? 100)
}

/** Record one call to Ably for pending rows: when, and its error or null. */
export async function recordRealtimeRevocationAttempt(
  ids: readonly string[],
  error: string | null,
  at: Date = new Date(),
): Promise<void> {
  if (ids.length === 0) {
    return
  }
  await db
    .update(realtimeRevocation)
    .set({
      attempts: sql`${realtimeRevocation.attempts} + 1`,
      lastAttemptAt: at,
      lastError: error === null ? null : error.slice(0, 500),
    })
    .where(and(inArray(realtimeRevocation.id, [...ids]), isNull(realtimeRevocation.resolvedAt)))
}

/** Close pending rows with how they ended. Returns how many it closed. */
export async function resolveRealtimeRevocations(
  ids: readonly string[],
  outcome: RealtimeRevocationOutcome,
  at: Date = new Date(),
): Promise<number> {
  if (ids.length === 0) {
    return 0
  }
  const rows = await db
    .update(realtimeRevocation)
    .set({ outcome, resolvedAt: at })
    .where(and(inArray(realtimeRevocation.id, [...ids]), isNull(realtimeRevocation.resolvedAt)))
    .returning({ id: realtimeRevocation.id })
  return rows.length
}
