/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : fake-tx-db (hooks test support)
 * Scope        : CMS Integration — Service Sync unit-test double
 *
 * Description  : In-memory stand-in for the transaction-bound Drizzle handle
 *                that `txDb(req)` resolves. Implements only the chains the
 *                sync hooks use — `insert().values().onConflictDoUpdate()` for
 *                the mirrored row, `insert().values()` and
 *                `delete().where()` for its branch availability rows — plus
 *                `update().set().where()`, backed by Maps.
 *
 * Responsibilities :
 * - Record every builder call so tests can assert on arguments
 * - Apply upsert semantics to the Map, so idempotency is observable
 * - Keep the availability join rows per table, so replacement is observable
 * - Allow a write to be made to reject, exercising the hook's error path
 *
 * Features / Functionality :
 * - makeFakeTxDb() → { db, rows, joinRows, insert, values, onConflictDoUpdate, ... }
 * - failWritesWith(error) — the next and all later writes reject
 *
 * Tech Stack   : TypeScript, Vitest, Drizzle ORM
 * Layer        : CMS (Hooks — test support)
 *
 * Dependencies : vitest, drizzle-orm
 *
 * Notes        : These are UNIT tests — nothing here touches a database. The
 *                Maps exist so "does not duplicate" and "replaces the branch
 *                rows" can be asserted on state rather than only on call
 *                counts. `rows` holds the mirrored rows (service or category);
 *                `joinRows` the rows of `service_branch` /
 *                `service_category_branch`, by table name.
 ************************************************************/

import { getTableName, type SQL, type Table } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { vi } from 'vitest'

/** A recorded row. Keys are Drizzle field names, not SQL column names. */
export type FakeRow = Record<string, unknown>

const dialect = new PgDialect()

/** The availability join tables, and the field naming the parent row. */
const JOIN_PARENT: Record<string, string> = {
  service_branch: 'serviceId',
  service_category_branch: 'categoryId',
}

export function makeFakeTxDb() {
  const rows = new Map<string, FakeRow>()
  const joinRows = new Map<string, FakeRow[]>()
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
    // WITHOUT id), a new row takes the full values payload.
    rows.set(id, existing ? { ...existing, ...config.set } : { ...row })
  })
  const values = vi.fn((payload: FakeRow | FakeRow[]) => {
    pendingInsert = Array.isArray(payload) ? null : payload
    return payload
  })
  const insert = vi.fn((table: Table) => ({
    values: (payload: FakeRow | FakeRow[]) => {
      values(payload)
      const name = getTableName(table)
      return {
        onConflictDoUpdate,
        // `await insert(joinTable).values(rows)` — a plain insert.
        // biome-ignore lint/suspicious/noThenProperty: models Drizzle's thenable query builder.
        then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
          if (failure) {
            reject(failure)
            return
          }
          const list = Array.isArray(payload) ? payload : [payload]
          joinRows.set(name, [...(joinRows.get(name) ?? []), ...list.map((r) => ({ ...r }))])
          resolve(undefined)
        },
      }
    },
  }))

  // delete(joinTable).where(eq(joinTable.parent, id))
  const deleteWhere = vi.fn(async (condition: SQL, name: string) => {
    if (failure) {
      throw failure
    }
    const parentField = JOIN_PARENT[name]
    const [parentId] = dialect.sqlToQuery(condition).params
    joinRows.set(
      name,
      (joinRows.get(name) ?? []).filter((r) => !parentField || r[parentField] !== parentId),
    )
  })
  const deleteFrom = vi.fn((table: Table) => ({
    where: (condition: SQL) => deleteWhere(condition, getTableName(table)),
  }))

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
    db: { insert, update, delete: deleteFrom },
    rows,
    joinRows,
    insert,
    values,
    onConflictDoUpdate,
    update,
    set,
    where,
    deleteFrom,
    deleteWhere,
    /** The rows of one availability join table, e.g. 'service_branch'. */
    joinRowsOf(table: string): FakeRow[] {
      return joinRows.get(table) ?? []
    },
    /** The row passed to the `index`-th `values()` call; throws when there was none. */
    writtenRow(index = 0): FakeRow {
      const row = values.mock.calls[index]?.[0]
      if (!row || Array.isArray(row)) {
        throw new Error(`no row written by values() call ${index}`)
      }
      return row
    },
    /** The set clause of the `index`-th upsert; throws when there was none. */
    upsertSet(index = 0): FakeRow {
      const config = onConflictDoUpdate.mock.calls[index]?.[0]
      if (!config) {
        throw new Error(`no upsert ${index}`)
      }
      return config.set
    },
    failWritesWith(error: Error) {
      failure = error
    },
  }
}
