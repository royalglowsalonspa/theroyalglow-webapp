/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/__tests__/precheck-blocked-steps.test
 * Scope        : Unit tests — blocked-step handling (task 5.4)
 *
 * Validates    : Requirements 5.5, 5.6
 *
 * Description  : Example-based tests for the blocked-step contract: when a
 *                Data_Pre_Check reports a violation, the step it is bound to is
 *                skipped and marked blocked, the violation is recorded in the
 *                Conformance_Report, and every INDEPENDENT step still applies.
 *                Also asserts the non-negotiable data-safety rule: the drift
 *                tooling never emits data-mutation SQL to satisfy a pre-check.
 *
 *                Runs over the REAL pipeline pieces — `Reconciler.plan` binds
 *                each step to its pre-check, `PreChecker.evaluate` classifies
 *                it, `Reporter` records it — with a fake read-only probe reader
 *                standing in for branch data. No database is touched.
 *
 * Responsibilities :
 * - Every additive-constraint step is bound to its own `DataPreCheck` (gateable)
 * - A violating check blocks exactly its bound step; independent steps continue
 * - The blocked violation (kind, description, count, bounded sample) is recorded
 *   in both the markdown and json Conformance_Report
 * - A passing check is never reported as blocked
 * - No `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` (or `drizzle-kit push`) is ever
 *   emitted — by the reconcile DDL or by any pre-check probe
 * - An unverifiable `COUNT(*)` fails CLOSED (never green-lights a constraint)
 *
 * Tech Stack   : Vitest
 * Layer        : Test
 *
 * Dependencies : vitest, ../reconcile, ../precheck, ../report, ../types
 *
 * Notes        : Fixtures use real RGSS tables. pg_cron is RETIRED, so no
 *                fixture references `cron.schedule` or pg_cron bookkeeping.
 ************************************************************/

import { describe, expect, it } from 'vitest'
import { PreChecker, type ProbeReader } from '../precheck'
import { Reconciler } from '../reconcile'
import { type ConformanceReport, RATIFIED_DATA_LOSS_NOTE, Reporter } from '../report'
import type { DiffEntry, PreCheckResult, ReconcileStep, SchemaDiff } from '../types'

const CANONICAL_HASH = 'c0ffee'
const BRANCH_HASH = 'deadbeef'

/** Step ids, resolved from the plan by the diff entry they carry. */
const FK_OBJECT = 'customer_id -> customer_profile(id)'

// ─────────────────────────────────────────────────────────
// Fixture diff: one additive object of every kind the reconciler handles.
// ─────────────────────────────────────────────────────────

const DIFF_ENTRIES: DiffEntry[] = [
  {
    kind: 'enum',
    table: null,
    object: 'booking_status',
    status: 'missing_on_branch',
    canonical: { name: 'booking_status', labels: ['pending', 'confirmed', 'completed'] },
    branch: null,
  },
  {
    // NOT NULL add -> gated by an `existing_null` pre-check.
    kind: 'column',
    table: 'booking',
    object: 'branch_id',
    status: 'missing_on_branch',
    canonical: { name: 'branch_id', type: 'text', nullable: false, default: null },
    branch: null,
  },
  {
    // Nullable add -> no data pre-check needed; always independent.
    kind: 'column',
    table: 'booking',
    object: 'internal_note',
    status: 'missing_on_branch',
    canonical: { name: 'internal_note', type: 'text', nullable: true, default: null },
    branch: null,
  },
  {
    // UNIQUE add -> gated by a `duplicate_key` pre-check.
    kind: 'unique',
    table: 'booking',
    object: 'booking_number',
    status: 'missing_on_branch',
    canonical: { name: null, columns: ['booking_number'] },
    branch: null,
  },
  {
    kind: 'index',
    table: 'booking',
    object: 'customer_id [btree]',
    status: 'missing_on_branch',
    canonical: { columns: ['customer_id'], unique: false, predicate: null, method: 'btree' },
    branch: null,
  },
  {
    // FK add -> gated by an `orphan_fk` pre-check. This is the one we violate.
    kind: 'foreignKey',
    table: 'booking',
    object: FK_OBJECT,
    status: 'missing_on_branch',
    canonical: {
      columns: ['customer_id'],
      refTable: 'customer_profile',
      refColumns: ['id'],
      onDelete: 'restrict',
      onUpdate: 'no action',
    },
    branch: null,
  },
]

const DIFF: SchemaDiff = {
  fromCanonicalHash: CANONICAL_HASH,
  toBranchHash: BRANCH_HASH,
  objects: DIFF_ENTRIES,
  isIdentical: false,
}

/** Two orphaned `booking` rows whose `customer_id` has no parent profile. */
const ORPHAN_ROWS = [
  { id: 'bk_1', customer_id: 'cust_missing_1' },
  { id: 'bk_2', customer_id: 'cust_missing_2' },
]

/**
 * Read-only probe reader over the fixture branch data: the orphan-FK probe finds
 * two violations; the duplicate-key and existing-NULL probes are clean. Every
 * statement it receives is recorded so the test can prove read-only behaviour.
 */
function createProbeReader(): { reader: ProbeReader; seen: string[] } {
  const seen: string[] = []
  const reader: ProbeReader = {
    query: (sql: string) => {
      seen.push(sql)
      // orphan_fk probe (LEFT JOIN to the parent): two violating child rows.
      if (sql.includes('LEFT JOIN')) return Promise.resolve([...ORPHAN_ROWS])
      // duplicate_key probe (GROUP BY ... HAVING COUNT(*) > 1): no duplicates.
      if (sql.includes('GROUP BY')) return Promise.resolve([])
      // existing_null probe: pg returns the bigint COUNT(*) as a string.
      return Promise.resolve([{ count: '0' }])
    },
  }
  return { reader, seen }
}

/** Evaluate every bound pre-check, keyed by the step it gates. */
async function evaluateBoundChecks(
  steps: readonly ReconcileStep[],
  reader: ProbeReader,
): Promise<Map<string, PreCheckResult>> {
  const byStepId = new Map<string, PreCheckResult>()
  for (const step of steps) {
    if (step.preCheck === null) continue
    byStepId.set(step.id, await PreChecker.evaluate(step.preCheck, reader))
  }
  return byStepId
}

/**
 * Requirement 5.5 gate: a step is applied only when it carries no pre-check or
 * its bound pre-check passed. A violating check skips exactly its own step.
 */
function partitionSteps(
  steps: readonly ReconcileStep[],
  results: Map<string, PreCheckResult>,
): { applicable: ReconcileStep[]; blocked: ReconcileStep[] } {
  const applicable: ReconcileStep[] = []
  const blocked: ReconcileStep[] = []
  for (const step of steps) {
    const result = results.get(step.id)
    if (result !== undefined && !result.passed) blocked.push(step)
    else applicable.push(step)
  }
  return { applicable, blocked }
}

function stepFor(steps: readonly ReconcileStep[], object: string): ReconcileStep {
  const step = steps.find((s) => s.diff.object === object)
  if (step === undefined) throw new Error(`no reconcile step for ${object}`)
  return step
}

const DATA_MUTATION_KEYWORDS = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'MERGE', 'COPY']

/**
 * Strip `ON DELETE ...` / `ON UPDATE ...` referential-action clauses before
 * scanning for mutation statements. Those clauses are declarative parts of an
 * `ADD CONSTRAINT ... FOREIGN KEY` and are NOT data mutation.
 */
function withoutReferentialActions(sql: string): string {
  return sql.replace(
    /\bON\s+(?:DELETE|UPDATE)\s+(?:NO\s+ACTION|RESTRICT|CASCADE|SET\s+NULL|SET\s+DEFAULT)/gi,
    '',
  )
}

/** Assert a statement contains no data-mutation keyword. */
function expectNoDataMutation(sql: string): void {
  const scanned = withoutReferentialActions(sql).toUpperCase()
  for (const keyword of DATA_MUTATION_KEYWORDS) {
    expect(scanned).not.toContain(keyword)
  }
}

describe('blocked-step handling (task 5.4)', () => {
  const steps = Reconciler.plan(DIFF)

  it('binds a pre-check to every additive-constraint step so it can be gated', () => {
    expect(steps).toHaveLength(DIFF_ENTRIES.length)

    // Additive constraints over existing data must be gateable.
    expect(stepFor(steps, 'branch_id').preCheck?.kind).toBe('existing_null')
    expect(stepFor(steps, 'booking_number').preCheck?.kind).toBe('duplicate_key')
    expect(stepFor(steps, FK_OBJECT).preCheck?.kind).toBe('orphan_fk')

    // Objects that cannot conflict with existing data need no gate.
    expect(stepFor(steps, 'booking_status').preCheck).toBeNull()
    expect(stepFor(steps, 'internal_note').preCheck).toBeNull()
    expect(stepFor(steps, 'customer_id [btree]').preCheck).toBeNull()
  })

  it('marks the violating step blocked and lets every independent step continue', async () => {
    const { reader } = createProbeReader()
    const results = await evaluateBoundChecks(steps, reader)
    const { applicable, blocked } = partitionSteps(steps, results)

    // Exactly the FK step is blocked, by its own bound orphan_fk check.
    expect(blocked.map((s) => s.diff.object)).toEqual([FK_OBJECT])
    expect(results.get(stepFor(steps, FK_OBJECT).id)?.passed).toBe(false)

    // Every other step — including the two that carry passing checks — continues.
    expect(applicable).toHaveLength(steps.length - 1)
    expect(applicable.map((s) => s.diff.object).sort()).toEqual(
      [
        'booking_number',
        'booking_status',
        'branch_id',
        'customer_id [btree]',
        'internal_note',
      ].sort(),
    )
  })

  it('records the violation count and a bounded sample for the blocked step', async () => {
    const { reader } = createProbeReader()
    const results = await evaluateBoundChecks(steps, reader)
    const fkResult = results.get(stepFor(steps, FK_OBJECT).id)

    expect(fkResult?.passed).toBe(false)
    expect(fkResult?.violationCount).toBe(ORPHAN_ROWS.length)
    expect(fkResult?.sample).toEqual(ORPHAN_ROWS)
    expect(fkResult?.check.description).toContain('customer_profile')
  })

  it('records the blocked pre-check in the markdown conformance report', async () => {
    const { reader } = createProbeReader()
    const results = await evaluateBoundChecks(steps, reader)
    const report: ConformanceReport = {
      canonicalHash: CANONICAL_HASH,
      branches: [{ branch: 'prod', diff: DIFF, preChecks: [...results.values()] }],
    }

    const markdown = Reporter.conformanceMarkdown(report)

    expect(markdown).toContain('1 blocked data pre-checks')
    expect(markdown).toContain('orphan_fk')
    expect(markdown).toContain(`Violations: ${ORPHAN_ROWS.length}`)
    expect(markdown).toContain('cust_missing_1')
    // The two passing checks are not reported as blocked.
    expect(markdown).not.toContain('duplicate_key')
    expect(markdown).not.toContain('existing_null')
    // The ratified test/pprd data-loss tradeoff is always stated.
    expect(markdown).toContain(RATIFIED_DATA_LOSS_NOTE)
  })

  it('records the blocked pre-check in the json conformance report', async () => {
    const { reader } = createProbeReader()
    const results = await evaluateBoundChecks(steps, reader)
    const report: ConformanceReport = {
      canonicalHash: CANONICAL_HASH,
      branches: [{ branch: 'prod', diff: DIFF, preChecks: [...results.values()] }],
    }

    const parsed = JSON.parse(Reporter.conformanceJson(report)) as {
      branches: {
        blockedPreChecks: { kind: string; violationCount: number; sample: unknown[] }[]
      }[]
    }
    const blocked = parsed.branches[0]?.blockedPreChecks ?? []

    expect(blocked).toHaveLength(1)
    expect(blocked[0]?.kind).toBe('orphan_fk')
    expect(blocked[0]?.violationCount).toBe(ORPHAN_ROWS.length)
    expect(blocked[0]?.sample).toHaveLength(ORPHAN_ROWS.length)
  })

  it('issues only read-only SELECT probes and never mutates branch data', async () => {
    const { reader, seen } = createProbeReader()
    await evaluateBoundChecks(steps, reader)

    expect(seen).toHaveLength(3)
    for (const sql of seen) {
      expect(sql.trimStart().toUpperCase().startsWith('SELECT')).toBe(true)
      expectNoDataMutation(sql)
    }
  })

  it('emits no data-mutation SQL in any reconcile step or pre-check probe', () => {
    for (const step of steps) {
      expectNoDataMutation(step.ddl)
      // `drizzle-kit push` partial-applied and caused the drift; never emitted.
      expect(step.ddl).not.toContain('drizzle-kit')
      expect(step.ddl).not.toContain('push')

      if (step.preCheck !== null) expectNoDataMutation(step.preCheck.probeSql)
    }
  })

  it('fails closed when a pre-check count cannot be verified', async () => {
    const nullCheck = stepFor(steps, 'branch_id').preCheck
    expect(nullCheck).not.toBeNull()
    if (nullCheck === null) return

    const unverifiable: ProbeReader = { query: () => Promise.resolve([{ count: 'not-a-number' }]) }
    const result = await PreChecker.evaluate(nullCheck, unverifiable)

    // An unparseable count must NEVER green-light the constraint.
    expect(result.passed).toBe(false)
  })
})
