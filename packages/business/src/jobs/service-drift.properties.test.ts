/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : service-drift.properties.test
 * Scope        : Property-based test — Drift reconciliation comparison logic
 *
 * Validates    : Requirements 17.2, 17.3
 *
 * Description  : fast-check + Vitest property tests for the pure drift differ
 *                (packages/business/src/jobs/service-drift.ts) used by the daily
 *                reconciliation job. Complements the example-based cases in
 *                service-drift.test.ts by asserting the same guarantees across
 *                generated row sets, field values and row orderings.
 *
 * Responsibilities :
 * - Identical row sets NEVER report drift, whatever the values or row order
 * - A row present only on the CMS side is ALWAYS `missing_in_public`
 * - A row present only on the public side is ALWAYS `extra_in_public`
 * - A timestamp gap within tolerance is never stale; beyond it, always stale
 * - The differ is deterministic and order-independent
 *
 * Features / Functionality :
 * - Generators are constrained to the real snapshot shape: unique ids, integer
 *   paise, nullable optional columns, in-range timestamps
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : Test
 *
 * Dependencies : fast-check, vitest, ./service-drift
 *
 * Notes        : These are the Requirement 17.2 / 17.3 comparison invariants for
 *                Task 13.2 — they are not additional numbered design
 *                Correctness Properties.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  buildServiceDriftReport,
  DRIFT_TIMESTAMP_TOLERANCE_MS,
  type DriftRow,
  type TableDriftReport,
} from './service-drift'

const EMPTY_PAIR = { cmsRows: [] as DriftRow[], publicRows: [] as DriftRow[] }

// Hexadecimal ids: short, sortable, and guaranteed not to contain `_`, which the
// determinism property relies on when it synthesises a `rogue_`-prefixed id.
const HEX_DIGITS = '0123456789abcdef'.split('')
const idArb = fc.string({
  unit: fc.constantFrom(...HEX_DIGITS),
  minLength: 6,
  maxLength: 12,
})
const idsArb = fc.uniqueArray(idArb, { minLength: 1, maxLength: 5 })
const timestampArb = fc.date({
  min: new Date('2026-01-01T00:00:00.000Z'),
  max: new Date('2027-01-01T00:00:00.000Z'),
  noInvalidDate: true,
})
const textArb = fc.string({ minLength: 1, maxLength: 20 })
const nullableTextArb = fc.option(textArb, { nil: null })
const nullableIntArb = fc.option(fc.integer({ min: 0, max: 500 }), { nil: null })

/** A generated `public.service` / `cms.service` snapshot row for one id. */
function serviceRowArb(id: string): fc.Arbitrary<DriftRow> {
  return fc
    .record({
      categoryId: idArb,
      name: textArb,
      slug: textArb,
      description: nullableTextArb,
      durationMinutes: fc.constantFrom(15, 30, 45, 60, 90, 120, 150, 180),
      bufferMinutes: fc.integer({ min: 0, max: 30 }),
      // Money is always integer paise — never a float.
      pricePaise: fc.integer({ min: 0, max: 10_000_000 }),
      isActive: fc.boolean(),
      imageUrl: nullableTextArb,
      displayOrder: fc.integer({ min: 0, max: 50 }),
      gemsRedeemable: fc.boolean(),
      gemsRequired: nullableIntArb,
      gemsCatalogueOrder: nullableIntArb,
      createdAt: timestampArb,
      updatedAt: timestampArb,
    })
    .map((fields) => ({ id, ...fields }) as DriftRow)
}

function categoryRowArb(id: string): fc.Arbitrary<DriftRow> {
  return fc
    .record({
      name: textArb,
      slug: textArb,
      description: nullableTextArb,
      serviceType: fc.constantFrom('salon', 'spa'),
      displayOrder: fc.integer({ min: 0, max: 50 }),
      isActive: fc.boolean(),
      createdAt: timestampArb,
      updatedAt: timestampArb,
    })
    .map((fields) => ({ id, ...fields }) as DriftRow)
}

function rowsArb(rowFor: (id: string) => fc.Arbitrary<DriftRow>): fc.Arbitrary<DriftRow[]> {
  return idsArb.chain((ids) => fc.tuple(...ids.map(rowFor)))
}

const serviceRowsArb = rowsArb(serviceRowArb)
const categoryRowsArb = rowsArb(categoryRowArb)

/** Fresh shallow copies in a random order — proves comparison is by value. */
function permutedCopiesArb(rows: readonly DriftRow[]): fc.Arbitrary<DriftRow[]> {
  if (rows.length === 0) {
    return fc.constant([])
  }
  return fc
    .shuffledSubarray([...rows], { minLength: rows.length, maxLength: rows.length })
    .map((shuffled) => shuffled.map((row) => ({ ...row })))
}

function rotate<T>(rows: readonly T[], by: number): T[] {
  if (rows.length === 0) {
    return []
  }
  const offset = by % rows.length
  return [...rows.slice(offset), ...rows.slice(0, offset)]
}

function tableOf(
  result: ReturnType<typeof buildServiceDriftReport>,
  table: string,
): TableDriftReport {
  const found = result.tables.find((t) => t.table === table)
  if (!found) {
    throw new Error(`no report for table ${table}`)
  }
  return found
}

describe('Requirement 17.3: identical snapshots never report drift', () => {
  it('reports no drift for identical row sets, whatever the values or row order', () => {
    fc.assert(
      fc.property(
        categoryRowsArb.chain((rows) => fc.tuple(fc.constant(rows), permutedCopiesArb(rows))),
        serviceRowsArb.chain((rows) => fc.tuple(fc.constant(rows), permutedCopiesArb(rows))),
        ([cmsCategories, publicCategories], [cmsServices, publicServices]) => {
          const result = buildServiceDriftReport({
            categories: { cmsRows: cmsCategories, publicRows: publicCategories },
            services: { cmsRows: cmsServices, publicRows: publicServices },
          })

          expect(result.hasDrift).toBe(false)
          expect(result.findingCount).toBe(0)
          for (const table of result.tables) {
            expect(table.findings).toEqual([])
            expect(table.missingInPublic).toEqual([])
            expect(table.extraInPublic).toEqual([])
            expect(table.staleRows).toEqual([])
            expect(table.changedRows).toEqual([])
            expect(table.cmsRowCount).toBe(table.publicRowCount)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('Requirement 17.2: rows present on only one side are always flagged', () => {
  it('always reports a CMS-only row as missing_in_public', () => {
    fc.assert(
      fc.property(
        serviceRowsArb.chain((rows) =>
          fc.tuple(fc.constant(rows), fc.nat({ max: rows.length - 1 })),
        ),
        ([cmsRows, droppedIndex]) => {
          const dropped = cmsRows[droppedIndex] as DriftRow
          const publicRows = cmsRows.filter((_, index) => index !== droppedIndex)

          const result = buildServiceDriftReport({
            categories: EMPTY_PAIR,
            services: { cmsRows, publicRows },
          })
          const services = tableOf(result, 'service')

          expect(result.hasDrift).toBe(true)
          expect(services.missingInPublic).toEqual([dropped.id])
          expect(services.extraInPublic).toEqual([])
          // A missing row is reported exactly once, never also as a mismatch.
          expect(services.findings.filter((f) => f.id === dropped.id)).toEqual([
            { table: 'service', kind: 'missing_in_public', id: dropped.id },
          ])
          expect(services.cmsRowCount - services.publicRowCount).toBe(1)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('always reports a public-only row as extra_in_public', () => {
    fc.assert(
      fc.property(
        serviceRowsArb.chain((rows) =>
          fc.tuple(fc.constant(rows), fc.nat({ max: rows.length - 1 })),
        ),
        ([publicRows, rogueIndex]) => {
          const rogue = publicRows[rogueIndex] as DriftRow
          const cmsRows = publicRows.filter((_, index) => index !== rogueIndex)

          const result = buildServiceDriftReport({
            categories: EMPTY_PAIR,
            services: { cmsRows, publicRows },
          })
          const services = tableOf(result, 'service')

          expect(result.hasDrift).toBe(true)
          expect(services.extraInPublic).toEqual([rogue.id])
          expect(services.missingInPublic).toEqual([])
          expect(services.findings.filter((f) => f.id === rogue.id)).toEqual([
            { table: 'service', kind: 'extra_in_public', id: rogue.id },
          ])
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('Requirement 17.3: timestamp divergence is judged against the tolerance', () => {
  const withinToleranceArb = fc.integer({
    min: -DRIFT_TIMESTAMP_TOLERANCE_MS,
    max: DRIFT_TIMESTAMP_TOLERANCE_MS,
  })
  // Beyond the tolerance, in either direction, up to 30 days.
  const beyondToleranceArb = fc
    .tuple(
      fc.integer({ min: DRIFT_TIMESTAMP_TOLERANCE_MS + 1, max: 30 * 24 * 60 * 60 * 1000 }),
      fc.boolean(),
    )
    .map(([magnitude, negative]) => (negative ? -magnitude : magnitude))

  it('never reports a gap within the tolerance', () => {
    fc.assert(
      fc.property(idArb.chain(serviceRowArb), withinToleranceArb, (cmsRow, deltaMs) => {
        const publicRow = {
          ...cmsRow,
          updatedAt: new Date((cmsRow.updatedAt as Date).getTime() + deltaMs),
        } as DriftRow

        const result = buildServiceDriftReport({
          categories: EMPTY_PAIR,
          services: { cmsRows: [cmsRow], publicRows: [publicRow] },
        })

        expect(tableOf(result, 'service').staleRows).toEqual([])
        expect(result.hasDrift).toBe(false)
      }),
      { numRuns: 300 },
    )
  })

  it('always reports a gap beyond the tolerance as stale', () => {
    fc.assert(
      fc.property(idArb.chain(serviceRowArb), beyondToleranceArb, (cmsRow, deltaMs) => {
        const publicRow = {
          ...cmsRow,
          updatedAt: new Date((cmsRow.updatedAt as Date).getTime() + deltaMs),
        } as DriftRow

        const result = buildServiceDriftReport({
          categories: EMPTY_PAIR,
          services: { cmsRows: [cmsRow], publicRows: [publicRow] },
        })
        const services = tableOf(result, 'service')

        expect(result.hasDrift).toBe(true)
        expect(services.staleRows).toEqual([cmsRow.id])
        expect(services.findings).toEqual([
          {
            table: 'service',
            kind: 'stale',
            id: cmsRow.id,
            field: 'updatedAt',
            cmsValue: (cmsRow.updatedAt as Date).toISOString(),
            publicValue: (publicRow.updatedAt as Date).toISOString(),
          },
        ])
      }),
      { numRuns: 300 },
    )
  })
})

describe('Requirement 17.2: the differ is deterministic and order-independent', () => {
  // A public snapshot derived from the CMS one by keeping, mutating, staling or
  // dropping each row — plus an optional row that exists only in `public`.
  const divergentPairArb = serviceRowsArb.chain((cmsRows) =>
    fc.tuple(
      fc.constant(cmsRows),
      fc.array(fc.constantFrom('same', 'mutate', 'stale', 'drop'), {
        minLength: cmsRows.length,
        maxLength: cmsRows.length,
      }),
      fc.boolean(),
    ),
  )

  it('returns the same report for the same inputs, in any row order', () => {
    fc.assert(
      fc.property(divergentPairArb, fc.nat({ max: 8 }), ([cmsRows, plan, addRogue], rotateBy) => {
        const publicRows: DriftRow[] = []
        for (const [index, cmsRow] of cmsRows.entries()) {
          const action = plan[index]
          if (action === 'drop') {
            continue
          }
          if (action === 'mutate') {
            publicRows.push({ ...cmsRow, name: `${String(cmsRow.name)}-edited` } as DriftRow)
            continue
          }
          if (action === 'stale') {
            publicRows.push({
              ...cmsRow,
              updatedAt: new Date((cmsRow.updatedAt as Date).getTime() + 10 * 60 * 1000),
            } as DriftRow)
            continue
          }
          publicRows.push({ ...cmsRow })
        }
        if (addRogue) {
          // `rogue_` can never collide: generated ids are hexadecimal.
          publicRows.push({ ...(cmsRows[0] as DriftRow), id: `rogue_${cmsRows[0]?.id}` })
        }

        const input = { categories: EMPTY_PAIR, services: { cmsRows, publicRows } }
        const first = buildServiceDriftReport(input)

        // Determinism — no clock reads, no iteration-order dependence.
        expect(buildServiceDriftReport(input)).toEqual(first)

        // Order independence — both sides permuted, identical report.
        expect(
          buildServiceDriftReport({
            categories: EMPTY_PAIR,
            services: {
              cmsRows: rotate(cmsRows, rotateBy),
              publicRows: [...rotate(publicRows, rotateBy)].reverse(),
            },
          }),
        ).toEqual(first)
      }),
      { numRuns: 200 },
    )
  })
})
