/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : fake-tx-db (hooks test support)
 * Scope        : CMS Integration — Service Sync unit-test double
 *
 * Description  : In-memory stand-in for the transaction-bound Drizzle handle
 *                that `txDb(req)` resolves. Implements only the two chains the
 *                sync hooks use — `insert().values().onConflictDoUpdate()` and
 *                `update().set().where()` — backed by a Map keyed on row id.
 *
 * Responsibilities :
 * - Record every builder call so tests can assert on arguments
 * - Apply upsert semantics to the Map, so idempotency is observable
 * - Allow a write to be made to reject, exercising the hook's error path
 *
 * Features / Functionality :
 * - makeFakeTxDb() → { db, rows, insert, values, onConflictDoUpdate, ... }
 * - failWritesWith(error) — the next and all later writes reject
 *
 * Tech Stack   : TypeScript, Vitest
 * Layer        : CMS (Hooks — test support)
 *
 * Dependencies : vitest
 *
 * Notes        : These are UNIT tests — nothing here touches a database. The
 *                Map exists so "does not duplicate" can be asserted on state
 *                rather than only on call counts.
 ************************************************************/

import { vi } from 'vitest'

/** A recorded row. Keys are Drizzle field names, not SQL column names. */
export type FakeRow = Record<string, unknown>

export function makeFakeTxDb() {
  const rows = new Map<string, FakeRow>()
  let failure: Error | null = null
  let pendingInsert: FakeRow | null = null
  let pendingPatch: FakeRow | null = null

  // insert(table).values(row).onConflictDoUpdate({ target, set })
  const onConflictDoUpdate = vi.fn(async (config: { target: unknown; set: FakeRow }) => {
    if (failure) {
      throw failure
    }
    const row = pendingInsert ?? {}
    const id = String(row.id)
    const existing = rows.get(id)
    // Upsert: an existing row takes the `set` clause (which the hook builds
    // WITHOUT id/createdAt), a new row takes the full values payload.
    rows.set(id, existing ? { ...existing, ...config.set } : { ...row })
  })
  const values = vi.fn((row: FakeRow) => {
    pendingInsert = row
    return { onConflictDoUpdate }
  })
  const insert = vi.fn((_table: unknown) => ({ values }))

  // update(table).set(patch).where(condition)
  const where = vi.fn(async (_condition: unknown) => {
    if (failure) {
      throw failure
    }
    const patch = pendingPatch ?? {}
    const id = String(patch.id)
    const existing = rows.get(id)
    if (existing) {
      rows.set(id, { ...existing, ...patch })
    }
  })
  const set = vi.fn((patch: FakeRow) => {
    pendingPatch = patch
    return { where }
  })
  const update = vi.fn((_table: unknown) => ({ set }))

  return {
    /** Pass this where the hook expects the resolved `txDb(req)` handle. */
    db: { insert, update },
    rows,
    insert,
    values,
    onConflictDoUpdate,
    update,
    set,
    where,
    failWritesWith(error: Error) {
      failure = error
    },
  }
}
