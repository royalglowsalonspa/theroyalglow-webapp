/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/__tests__/precheck.property.test
 * Scope        : Property 4: Pre-check soundness
 *
 * Validates    : Requirements 5.7, 13.4
 *
 * Description  : fast-check + Vitest property test for the data pre-checker
 *                (`packages/db/scripts/drift/precheck.ts`). Asserts the SAFETY
 *                biconditional: `passed === true` iff adding the constraint to
 *                the branch data would succeed — a violation is reported iff one
 *                actually exists. The no-false-negative half is the one that
 *                protects `prod`: the pre-checker must NEVER green-light a
 *                constraint that would fail.
 *
 * Responsibilities :
 * - `passed ⟺ zero real violations`, for duplicate_key, orphan_fk, existing_null
 * - `violationCount` equals the true violation count
 * - No false negatives: a non-empty violation set is never reported as passed
 * - The violating-row `sample` is bounded and empty when the check passed
 * - Every emitted `probeSql` is read-only: no data-mutation / DDL keyword
 *
 * Features / Functionality :
 * - Datasets are generated in memory and the TRUE violation set is computed
 *   directly in TypeScript, then served through a fake read-only `ProbeReader`.
 *   That keeps the property database-free (CI has no Neon branch) while still
 *   exercising the real `PreChecker.plan` + `PreChecker.evaluate` code paths.
 * - ≥100 runs per property (Requirement 13.9).
 *
 * Tech Stack   : Vitest + fast-check 4
 * Layer        : Test
 *
 * Dependencies : fast-check, vitest, ../precheck, ../types
 *
 * Notes        : The fake reader ASSERTS every probe it receives is a bare
 *                `SELECT`, so a probe that tried to mutate branch data would
 *                fail the property rather than silently pass.
 *
 * Feature: schema-drift-remediation, Property 4: Pre-check soundness
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { PreChecker, type ProbeReader } from '../precheck'
import type { DataPreCheck, DataPreCheckKind, DiffEntry, SchemaDiff } from '../types'

const RUNS = { numRuns: 200 } as const

/** `precheck.ts` bounds the retained violating-row sample at 20. */
const SAMPLE_LIMIT = 20

const CHILD_TABLE = 't_child'
const PARENT_TABLE = 't_parent'
const PK_COLUMN = 'c_id'

/** Statements that must never appear in a read-only probe. */
const MUTATION_KEYWORDS = [
  'INSERT',
  'UPDATE ',
  'DELETE',
  'TRUNCATE',
  'MERGE',
  'COPY',
  'CREATE',
  'ALTER',
  'DROP',
  'GRANT',
  'REVOKE',
  'FOR UPDATE',
]

function assertReadOnly(sql: string): void {
  const upper = sql.toUpperCase()
  expect(upper.trimStart().startsWith('SELECT')).toBe(true)
  for (const keyword of MUTATION_KEYWORDS) {
    expect(upper).not.toContain(keyword)
  }
}

/** A read-only probe reader that serves a precomputed violation set. */
function createProbeReader(rows: readonly unknown[]): ProbeReader {
  return {
    query: (sql: string) => {
      // A probe that tried to mutate data fails the property here.
      assertReadOnly(sql)
      return Promise.resolve([...rows])
    },
  }
}

function singletonDiff(entry: DiffEntry): SchemaDiff {
  return {
    fromCanonicalHash: 'canonical',
    toBranchHash: 'branch',
    objects: [entry],
    isIdentical: false,
  }
}

/** Derive the single real `DataPreCheck` the planner emits for one entry. */
function planOne(entry: DiffEntry): DataPreCheck {
  const checks = PreChecker.plan(singletonDiff(entry))
  expect(checks).toHaveLength(1)
  const check = checks[0]
  if (check === undefined) throw new Error('planner emitted no check')
  return check
}

// ─────────────────────────────────────────────────────────
// Scenarios — a diff entry, the branch data, and the TRUE violation set that a
// read-only probe would return for it.
// ─────────────────────────────────────────────────────────

type Scenario = {
  expectedKind: DataPreCheckKind
  entry: DiffEntry
  /** Rows the read-only probe returns. */
  probeRows: unknown[]
  /** The true number of violations in the branch data. */
  violationCount: number
}

const keyValueArb = fc.constantFrom('a', 'b', 'c')

/** UNIQUE / PRIMARY KEY add -> duplicate-key groups in the existing data. */
const duplicateKeyScenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    kind: fc.constantFrom<'unique' | 'primaryKey'>('unique', 'primaryKey'),
    columns: fc.uniqueArray(fc.constantFrom('f_a', 'f_b'), { minLength: 1, maxLength: 2 }),
    rows: fc.array(fc.array(keyValueArb, { minLength: 1, maxLength: 2 }), { maxLength: 30 }),
  })
  .map(({ kind, columns, rows }) => {
    // Group the generated rows by their key tuple; a group of >1 is a violation.
    const groups = new Map<string, number>()
    for (const row of rows) {
      const key = columns.map((_, i) => row[i] ?? '').join('\u0000')
      groups.set(key, (groups.get(key) ?? 0) + 1)
    }
    const violating = [...groups.entries()].filter(([, count]) => count > 1)
    const probeRows = violating.map(([key, count]) => {
      const record: Record<string, unknown> = { count: String(count) }
      key.split('\u0000').forEach((value, i) => {
        const column = columns[i]
        if (column !== undefined) record[column] = value
      })
      return record
    })

    const canonical = kind === 'primaryKey' ? columns : { name: null, columns }
    return {
      expectedKind: 'duplicate_key' as const,
      entry: {
        kind,
        table: CHILD_TABLE,
        object: columns.join(', '),
        status: 'missing_on_branch' as const,
        canonical,
        branch: null,
      },
      probeRows,
      violationCount: probeRows.length,
    }
  })

/** FOREIGN KEY add -> child rows with no matching parent. */
const orphanFkScenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    childValues: fc.array(fc.option(keyValueArb, { nil: null }), { maxLength: 30 }),
    parentKeys: fc.uniqueArray(keyValueArb, { maxLength: 3 }),
  })
  .map(({ childValues, parentKeys }) => {
    const parents = new Set(parentKeys)
    // MATCH SIMPLE: a NULL foreign key is always allowed, so only fully-set
    // values with no matching parent are orphans.
    const orphans = childValues
      .filter((value): value is string => value !== null && !parents.has(value))
      .map((value) => ({ [PK_COLUMN]: `row_${value}`, f_ref: value }))

    return {
      expectedKind: 'orphan_fk' as const,
      entry: {
        kind: 'foreignKey' as const,
        table: CHILD_TABLE,
        object: `f_ref -> ${PARENT_TABLE}(${PK_COLUMN})`,
        status: 'missing_on_branch' as const,
        canonical: {
          columns: ['f_ref'],
          refTable: PARENT_TABLE,
          refColumns: [PK_COLUMN],
          onDelete: 'restrict',
          onUpdate: 'no action',
        },
        branch: null,
      },
      probeRows: orphans,
      violationCount: orphans.length,
    }
  })

/** NOT NULL add / tighten -> existing NULLs in the column. */
const existingNullScenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    status: fc.constantFrom<'missing_on_branch' | 'divergent'>('missing_on_branch', 'divergent'),
    values: fc.array(fc.option(keyValueArb, { nil: null }), { maxLength: 30 }),
  })
  .map(({ status, values }) => {
    const nullCount = values.filter((v) => v === null).length
    const canonical = { name: 'f_a', type: 'text', nullable: false, default: null }

    return {
      expectedKind: 'existing_null' as const,
      entry: {
        kind: 'column' as const,
        table: CHILD_TABLE,
        object: 'f_a',
        status,
        canonical,
        // A divergent entry is only an additive tightening when the branch
        // column is currently nullable.
        branch:
          status === 'divergent'
            ? { name: 'f_a', type: 'text', nullable: true, default: null }
            : null,
      },
      // pg returns bigint COUNT(*) as a string.
      probeRows: [{ count: String(nullCount) }],
      violationCount: nullCount,
    }
  })

const scenarioArb: fc.Arbitrary<Scenario> = fc.oneof(
  duplicateKeyScenarioArb,
  orphanFkScenarioArb,
  existingNullScenarioArb,
)

// Feature: schema-drift-remediation, Property 4: Pre-check soundness
describe('Property 4: Pre-check soundness', () => {
  it('reports a violation iff one actually exists in the branch data', () => {
    fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const check = planOne(scenario.entry)
        expect(check.kind).toBe(scenario.expectedKind)

        const result = await PreChecker.evaluate(check, createProbeReader(scenario.probeRows))

        // The biconditional: safe to apply iff the data has no violation.
        expect(result.passed).toBe(scenario.violationCount === 0)
        expect(result.violationCount).toBe(scenario.violationCount)
      }),
      RUNS,
    )
  })

  it('never green-lights a constraint that would fail (no false negatives)', () => {
    fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const result = await PreChecker.evaluate(
          planOne(scenario.entry),
          createProbeReader(scenario.probeRows),
        )

        if (scenario.violationCount > 0) {
          expect(result.passed).toBe(false)
        }
      }),
      RUNS,
    )
  })

  it('bounds the violating-row sample and reports none when the check passed', () => {
    fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const result = await PreChecker.evaluate(
          planOne(scenario.entry),
          createProbeReader(scenario.probeRows),
        )

        expect(result.sample.length).toBeLessThanOrEqual(SAMPLE_LIMIT)
        if (result.passed) expect(result.sample).toEqual([])
      }),
      RUNS,
    )
  })

  it('emits only read-only probe SQL naming the target table', () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const check = planOne(scenario.entry)

        assertReadOnly(check.probeSql)
        expect(check.probeSql).toContain(`"${CHILD_TABLE}"`)
        expect(check.description.length).toBeGreaterThan(0)
      }),
      RUNS,
    )
  })

  it('plans no pre-check for objects that are not additive constraints', () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        // An object that is EXTRA on the branch is never added, so it needs no
        // data pre-check; nor does an added NULLABLE column.
        const extra: DiffEntry = { ...scenario.entry, status: 'extra_on_branch' }
        expect(PreChecker.plan(singletonDiff(extra))).toEqual([])

        const nullableColumn: DiffEntry = {
          kind: 'column',
          table: CHILD_TABLE,
          object: 'f_a',
          status: 'missing_on_branch',
          canonical: { name: 'f_a', type: 'text', nullable: true, default: null },
          branch: null,
        }
        expect(PreChecker.plan(singletonDiff(nullableColumn))).toEqual([])
      }),
      RUNS,
    )
  })
})
