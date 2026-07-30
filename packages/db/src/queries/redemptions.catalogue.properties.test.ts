/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-08-2026 & Updated - 04-08-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : redemptions.catalogue.properties.test
 * Scope        : Property-based test — Gems catalogue admission
 *
 * Feature      : gems-redemption
 * Property     : 1 — Catalogue filter admits exactly the eligible services
 * Validates    : Requirements 1.2, 1.3
 *
 * Description  : fast-check + Vitest property test for the two-stage gems
 *                catalogue filter:
 *                  stage 1 — `getRedeemableServices()` (packages/db/src/queries/
 *                            loyalty.ts) filters in SQL on
 *                            `gems_redeemable = true AND is_active = true`
 *                  stage 2 — `GET /api/gems` drops rows with a null gem cost
 *                            (`services.filter((s) => s.gemsRequired != null)`)
 *                The composed admission rule is Property 1's iff-condition.
 *
 * Approach     : `../index` is mocked with a small thenable `db` (the pattern
 *                established by queries/services.test.ts — replaying Drizzle's
 *                operator objects faithfully is impractical). Crucially the fake
 *                does NOT hardcode the filter: it DERIVES the row predicate, the
 *                projection and the ordering from the real `where` / `orderBy` /
 *                `select` arguments the real query builds, so a change to the
 *                query's WHERE clause changes what the fake enforces and the
 *                property fails rather than silently passing. A companion
 *                example test pins the exact serialised SQL contract.
 *
 * Responsibilities :
 * - A service is in the catalogue iff gemsRedeemable && isActive && cost != null
 * - No duplicates, no invented rows, projection carries name/cost/pricePaise
 * - Rows come back ordered by gemsCatalogueOrder ascending, nulls last
 *
 * Tech Stack   : Vitest + fast-check, Drizzle ORM
 * Layer        : Test
 *
 * Dependencies : fast-check, vitest, drizzle-orm, drizzle-orm/pg-core
 *
 * Notes        : Stage 2 is a one-line filter that lives in the API route and
 *                cannot be imported from `packages/db`; it is reproduced here
 *                verbatim and is additionally exercised end-to-end by the
 *                route-level tests. Money stays integer paise throughout.
 ************************************************************/

import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

// ── Seeded `service` rows shared with the mocked db (set per fast-check run) ─
type SeedService = {
  id: string
  name: string
  pricePaise: number
  gemsRedeemable: boolean
  isActive: boolean
  gemsRequired: number | null
  gemsCatalogueOrder: number | null
}

let seed: SeedService[] = []

/** What the real query actually asked for, captured for derivation below. */
type CapturedQuery = {
  projection?: Record<string, { name: string }>
  where?: SQL
  orderBy?: SQL
}
let captured: CapturedQuery = {}

const dialect = new PgDialect()

const snakeToCamel = (column: string): string =>
  column.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())

/**
 * Decompose a WHERE clause into the `column = value` terms it conjoins.
 *
 * Throws when the clause contains anything else (an OR, an inequality, a
 * subquery) so an unsupported change is a loud failure rather than a silently
 * weakened predicate.
 */
function conjunctiveEqualities(where: SQL): { column: string; value: unknown }[] {
  const { sql: text, params } = dialect.sqlToQuery(where)
  const term = /"service"\."([a-z_]+)" = \$(\d+)/g
  const terms = [...text.matchAll(term)].map(([, column, index]) => ({
    column: column as string,
    value: params[Number(index) - 1],
  }))
  const residue = text
    .replace(term, '')
    .replace(/\band\b/g, '')
    .replace(/[()\s]/g, '')
  if (terms.length === 0 || residue !== '') {
    throw new Error(`unsupported WHERE clause for derivation: ${text}`)
  }
  return terms
}

/** Does a seeded row satisfy every equality term of the real WHERE clause? */
function matchesWhere(row: SeedService, where: SQL): boolean {
  return conjunctiveEqualities(where).every(
    ({ column, value }) =>
      (row as unknown as Record<string, unknown>)[snakeToCamel(column)] === value,
  )
}

/** `ORDER BY gems_catalogue_order ASC NULLS LAST`, derived from the real clause. */
function applyOrderBy(rows: SeedService[], orderBy: SQL | undefined): SeedService[] {
  if (!orderBy) {
    return rows
  }
  const { sql: text } = dialect.sqlToQuery(orderBy)
  const match = /"service"\."([a-z_]+)"\s+asc\s+nulls\s+last/i.exec(text)
  if (!match) {
    throw new Error(`unsupported ORDER BY clause for derivation: ${text}`)
  }
  const key = snakeToCamel(match[1] as string)
  const orderOf = (row: SeedService) =>
    (row as unknown as Record<string, number | null>)[key] ?? null
  // Stable sort with nulls last — Postgres' documented ASC NULLS LAST semantics.
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const [x, y] = [orderOf(a.row), orderOf(b.row)]
      if (x === y) {
        return a.index - b.index
      }
      if (x === null) {
        return 1
      }
      if (y === null) {
        return -1
      }
      return x - y
    })
    .map(({ row }) => row)
}

/** Project a row through the real `select({ ... })` column map. */
function project(
  row: SeedService,
  projection: CapturedQuery['projection'],
): Record<string, unknown> {
  if (!projection) {
    return { ...row }
  }
  const out: Record<string, unknown> = {}
  for (const [alias, column] of Object.entries(projection)) {
    out[alias] = (row as unknown as Record<string, unknown>)[snakeToCamel(column.name)]
  }
  return out
}

function makeBuilder(projection: Record<string, { name: string }>) {
  captured = { projection }
  const builder: Record<string, unknown> = {
    from: () => builder,
    where: (clause: SQL) => {
      captured.where = clause
      return builder
    },
    orderBy: (clause: SQL) => {
      captured.orderBy = clause
      return builder
    },
    limit: () => builder,
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable to mimic Drizzle's awaitable query builder
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(compute()).then(resolve, reject),
  }

  function compute() {
    const where = captured.where
    if (!where) {
      throw new Error('getRedeemableServices must filter in SQL')
    }
    const admitted = seed.filter((row) => matchesWhere(row, where))
    return applyOrderBy(admitted, captured.orderBy).map((row) => project(row, captured.projection))
  }

  return builder
}

vi.mock('../index', () => ({
  db: { select: (projection: Record<string, { name: string }>) => makeBuilder(projection) },
}))

// Imported after the mock registration (vi.mock is hoisted, so this is safe).
const { getRedeemableServices } = await import('./loyalty')

/**
 * Stage 2, reproduced verbatim from `GET /api/gems` (Req 1.3):
 * `const services = redeemable.filter((s) => s.gemsRequired != null)`
 */
function dropNullCostRows<T extends { gemsRequired: number | null }>(rows: T[]): T[] {
  return rows.filter((s) => s.gemsRequired != null)
}

// ── Generators ──────────────────────────────────────────────────────────────
// Small catalogue-order range so ties are common, and nulls are frequent so the
// nulls-last ordering and the null-cost drop are both exercised hard.
const seedArb = fc
  .array(
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 20 }),
      // Money is integer paise — never a float.
      pricePaise: fc.integer({ min: 0, max: 10_000_000 }),
      gemsRedeemable: fc.boolean(),
      isActive: fc.boolean(),
      gemsRequired: fc.option(fc.integer({ min: 0, max: 5000 }), { nil: null }),
      gemsCatalogueOrder: fc.option(fc.integer({ min: 0, max: 4 }), { nil: null }),
    }),
    { maxLength: 14 },
  )
  .map((rows) => rows.map((row, index): SeedService => ({ id: `svc-${index}`, ...row })))

const isNonDecreasingWithNullsLast = (values: (number | null)[]): boolean => {
  let seenNull = false
  let previous: number | null = null
  for (const value of values) {
    if (value === null) {
      seenNull = true
      continue
    }
    if (seenNull) {
      return false
    }
    if (previous !== null && previous > value) {
      return false
    }
    previous = value
  }
  return true
}

// ===========================================================================
// Feature: gems-redemption, Property 1: Catalogue filter admits exactly the
//          eligible services
// Validates: Requirements 1.2, 1.3
// ===========================================================================
describe('Property 1: Catalogue filter admits exactly the eligible services', () => {
  it('admits a service iff gemsRedeemable === true && isActive === true && gemsRequired != null', async () => {
    await fc.assert(
      fc.asyncProperty(seedArb, async (rows) => {
        seed = rows

        const catalogue = dropNullCostRows(await getRedeemableServices())

        // The iff-condition, stated independently of the implementation.
        const expected = new Set(
          rows
            .filter(
              (r) => r.gemsRedeemable === true && r.isActive === true && r.gemsRequired != null,
            )
            .map((r) => r.id),
        )
        const got = catalogue.map((item) => item.id)

        expect(new Set(got)).toEqual(expected)
        // No duplicates, no invented rows.
        expect(got.length).toBe(expected.size)

        // The projection carries the fields the catalogue UI needs (Req 1.4).
        for (const item of catalogue) {
          const source = rows.find((r) => r.id === item.id) as SeedService
          expect(item.name).toBe(source.name)
          expect(item.gemsRequired).toBe(source.gemsRequired)
          expect(item.pricePaise).toBe(source.pricePaise)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('returns the admitted rows ordered by gemsCatalogueOrder ascending, nulls last (Req 1.5)', async () => {
    await fc.assert(
      fc.asyncProperty(seedArb, async (rows) => {
        seed = rows

        const catalogue = await getRedeemableServices()
        const orders = catalogue.map(
          (item) => rows.find((r) => r.id === item.id)?.gemsCatalogueOrder ?? null,
        )

        expect(isNonDecreasingWithNullsLast(orders)).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('pins the SQL contract the derived predicate mirrors', async () => {
    seed = []
    await getRedeemableServices()

    // Exactly the two equality terms Req 1.2 mandates — nothing more, nothing less.
    expect(conjunctiveEqualities(captured.where as SQL)).toEqual([
      { column: 'gems_redeemable', value: true },
      { column: 'is_active', value: true },
    ])
    expect(dialect.sqlToQuery(captured.orderBy as SQL).sql).toBe(
      '"service"."gems_catalogue_order" asc nulls last',
    )
  })
})
