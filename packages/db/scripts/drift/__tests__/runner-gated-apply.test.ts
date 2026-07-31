/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-10-2026 & Updated - 04-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/__tests__/runner-gated-apply.test
 * Scope        : Unit tests — the ORCHESTRATION-layer Req 5.5 gate
 *
 * Validates    : Requirements 5.5, 5.6, 6.6, 7.2
 *
 *   Req 5.5 : "IF a Data_Pre_Check reports a violation, THEN THE
 *             Schema_Drift_System SHALL skip that step's DDL, mark the step
 *             blocked, record the violation in the Conformance_Report, and
 *             continue with independent steps."
 *
 * Description  : `precheck-blocked-steps.test.ts` proves the gate contract at the
 *                PLANNING layer (which step binds which check). This suite is its
 *                ORCHESTRATION-layer counterpart: it proves `runner.ts` actually
 *                withholds a blocked step's DDL from the database, and that one
 *                failing statement does not abort the apply loop.
 *
 *                Both halves are asserted on the EXECUTED-STATEMENT LOG of a fake
 *                `SqlExecutor` — not merely on the returned verdicts — so a
 *                regression that reinstated apply-then-check (or dropped the
 *                per-step try/catch) fails here.
 *
 * Responsibilities :
 * - A failing bound pre-check withholds THAT step's DDL entirely; independent
 *   steps (gated-and-clean, and ungated) still execute
 * - A failing DDL is isolated: later steps in `step.order` still execute
 * - A probe that THROWS fails closed (blocked, DDL withheld)
 * - Inert operator-confirm steps are never probed and never executed (Req 6.6)
 * - Steps execute in `step.order`, whatever order the plan array is in
 * - No branch data is mutated to satisfy a pre-check (Req 5.6): every statement
 *   the gate issues is either plan DDL or a read-only `SELECT` probe
 * - `verifyOnFork` and `rollout` route DDL through that same gate and surface the
 *   verdicts on `VerifyReport.stepOutcomes` / `RolloutReport.blocked`
 *
 * Tech Stack   : Vitest
 * Layer        : Test
 *
 * Dependencies : vitest, ../runner, ../catalog-queries, ../types
 *
 * Notes        : DB-FREE. Every collaborator (Neon control plane, SQL executor,
 *                catalog reader) is a fake; no network, no database, no fork.
 ************************************************************/

import { describe, expect, it } from 'vitest'
import type { CanonicalFingerprint } from '../canonical'
import type { CatalogReader, SqlExecutor } from '../catalog-queries'
import { Fingerprinter } from '../fingerprint'
import type { NeonAdmin } from '../neon-admin'
import { applyGatedPlan, createDriftRunner, type StepOutcome } from '../runner'
import type { CatalogRows, DataPreCheck, DiffEntry, ReconcileStep } from '../types'

// ─────────────────────────────────────────────────────────
// Fixture plan. Four steps in three dependency bands, deliberately declared
// OUT of `step.order` so the gate's ordering is observable.
// ─────────────────────────────────────────────────────────

const DUPLICATE_PROBE = 'SELECT "booking_number", COUNT(*) AS count FROM "booking" GROUP BY 1'
const ORPHAN_PROBE = 'SELECT c.* FROM "booking" c LEFT JOIN "customer_profile" p ON 1=1'
const NULL_PROBE = 'SELECT COUNT(*) AS count FROM "booking" WHERE "branch_id" IS NULL'

function entry(kind: DiffEntry['kind'], object: string): DiffEntry {
  return {
    kind,
    table: 'booking',
    object,
    status: 'missing_on_branch',
    canonical: {},
    branch: null,
  }
}

function check(kind: DataPreCheck['kind'], probeSql: string): DataPreCheck {
  return { kind, probeSql, description: `${kind} probe` }
}

/** Ungated column add — always independent. */
const STEP_COLUMN: ReconcileStep = {
  id: 'column_booking_internal_note',
  diff: entry('column', 'internal_note'),
  ddl: 'ALTER TABLE "booking" ADD COLUMN IF NOT EXISTS "internal_note" text;',
  preCheck: null,
  order: 1,
}

/** Gated UNIQUE add whose duplicate_key check FAILS -> must be blocked. */
const STEP_UNIQUE: ReconcileStep = {
  id: 'unique_booking_booking_number',
  diff: entry('unique', 'booking_number'),
  ddl: 'ALTER TABLE "booking" ADD CONSTRAINT "booking_booking_number_key" UNIQUE ("booking_number");',
  preCheck: check('duplicate_key', DUPLICATE_PROBE),
  order: 2,
}

/** Gated UNIQUE INDEX add whose duplicate_key check PASSES -> must apply. */
const STEP_INDEX: ReconcileStep = {
  id: 'index_booking_customer_id',
  diff: entry('index', 'customer_id [btree]'),
  ddl: 'CREATE UNIQUE INDEX IF NOT EXISTS "booking_customer_id_uniq" ON "booking" USING btree ("customer_id");',
  preCheck: check('existing_null', NULL_PROBE),
  order: 3,
}

/** Gated FK add whose orphan_fk check FAILS -> must be blocked. */
const STEP_FK: ReconcileStep = {
  id: 'foreignkey_booking_customer_id',
  diff: entry('foreignKey', 'customer_id -> customer_profile(id)'),
  ddl: 'ALTER TABLE "booking" ADD CONSTRAINT "booking_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profile" ("id");',
  preCheck: check('orphan_fk', ORPHAN_PROBE),
  order: 4,
}

/** Operator-confirm PK redefinition: commented out, never auto-applied. */
const STEP_INERT: ReconcileStep = {
  id: 'primarykey_booking_id_divergent',
  diff: { ...entry('primaryKey', 'id'), status: 'divergent' },
  ddl: [
    '-- OPERATOR-CONFIRM: PRIMARY KEY on "booking" diverges from canonical.',
    '--   ALTER TABLE "booking" ADD PRIMARY KEY ("id");',
  ].join('\n'),
  preCheck: check('duplicate_key', DUPLICATE_PROBE),
  order: 2,
}

/** Declared out of order on purpose. */
const PLAN: ReconcileStep[] = [STEP_FK, STEP_INDEX, STEP_UNIQUE, STEP_COLUMN]

// ─────────────────────────────────────────────────────────
// Fake executor. Probe answers are scripted per probe SQL; DDL either succeeds
// or throws, recorded either way.
// ─────────────────────────────────────────────────────────

type FakeExecutor = {
  exec: SqlExecutor
  /** Every statement the gate issued, in order. */
  statements: string[]
  /** The subset that is plan DDL (i.e. reached the database as DDL). */
  executedDdl: () => string[]
}

type FakeOptions = {
  /** Rows each probe returns. Absent probe -> `[]` (a passing check). */
  probeRows?: Record<string, unknown[]>
  /** Probes that THROW instead of answering. */
  throwingProbes?: readonly string[]
  /** DDL statements that THROW when executed. */
  failingDdl?: readonly string[]
}

/**
 * Baseline probe answers: no violations anywhere. `existing_null` reads a
 * `COUNT(*)` row (pg returns the bigint as a string), so an ABSENT answer would
 * fail closed rather than pass — hence the explicit clean count.
 */
const CLEAN_ROWS: Record<string, unknown[]> = {
  [DUPLICATE_PROBE]: [],
  [ORPHAN_PROBE]: [],
  [NULL_PROBE]: [{ count: '0' }],
}

function fakeExecutor(options: FakeOptions = {}): FakeExecutor {
  const statements: string[] = []
  const planDdl = new Set(PLAN.map((step) => step.ddl))
  const probeRows = { ...CLEAN_ROWS, ...(options.probeRows ?? {}) }
  const exec: SqlExecutor = <Row>(query: string): Promise<Row[]> => {
    statements.push(query)
    if (options.throwingProbes?.includes(query)) {
      return Promise.reject(new Error('probe failed: relation does not exist'))
    }
    if (options.failingDdl?.includes(query)) {
      return Promise.reject(new Error('42P16: column "id" is in a primary key'))
    }
    const rows = probeRows[query] ?? []
    return Promise.resolve(rows as Row[])
  }
  return { exec, executedDdl: () => statements.filter((sql) => planDdl.has(sql)), statements }
}

/** Probe answers that make the UNIQUE and FK checks fail, the null check pass. */
const VIOLATING_ROWS: Record<string, unknown[]> = {
  [DUPLICATE_PROBE]: [{ booking_number: 'BK-RS-2605-H-38291', count: '2' }],
  [ORPHAN_PROBE]: [{ id: 'bk_1', customer_id: 'cust_missing' }],
  [NULL_PROBE]: [{ count: '0' }],
}

function verdictOf(outcomes: readonly StepOutcome[], stepId: string): StepOutcome['verdict'] {
  const outcome = outcomes.find((candidate) => candidate.stepId === stepId)
  if (outcome === undefined) throw new Error(`no outcome for step ${stepId}`)
  return outcome.verdict
}

function idsWith(outcomes: readonly StepOutcome[], verdict: StepOutcome['verdict']): string[] {
  return outcomes
    .filter((outcome) => outcome.verdict === verdict)
    .map((outcome) => outcome.stepId)
    .sort()
}

// ─────────────────────────────────────────────────────────
// Fake collaborators for the full `verifyOnFork` / `rollout` paths.
// ─────────────────────────────────────────────────────────

const EMPTY_ROWS: CatalogRows = {
  tables: [],
  columns: [],
  primaryKeys: [],
  uniques: [],
  foreignKeys: [],
  indexes: [],
  enums: [],
}

/** A reader over an EMPTY schema — enough to exercise the orchestration path. */
function fakeReader(): CatalogReader {
  return {
    readTables: () => Promise.resolve(EMPTY_ROWS.tables),
    readColumns: () => Promise.resolve(EMPTY_ROWS.columns),
    readPrimaryKeys: () => Promise.resolve(EMPTY_ROWS.primaryKeys),
    readUniques: () => Promise.resolve(EMPTY_ROWS.uniques),
    readForeignKeys: () => Promise.resolve(EMPTY_ROWS.foreignKeys),
    readIndexes: () => Promise.resolve(EMPTY_ROWS.indexes),
    readEnums: () => Promise.resolve(EMPTY_ROWS.enums),
  }
}

const EMPTY_FINGERPRINT = Fingerprinter.build(EMPTY_ROWS)

/** Canonical that the fake (empty) branch will NOT match — convergence is not the subject here. */
const CANONICAL: CanonicalFingerprint = {
  fingerprint: EMPTY_FINGERPRINT,
  hash: 'canonical-hash-that-differs',
}

const FAKE_BRANCH = 'br-fake-target'

type FakeAdminLog = {
  admin: NeonAdmin
  forked: string[]
  deleted: string[]
  reset: string[]
}

function fakeAdmin(): FakeAdminLog {
  const forked: string[] = []
  const deleted: string[] = []
  const reset: string[] = []
  const admin: NeonAdmin = {
    forkBranch: (parent, name) => {
      forked.push(`${parent}->${name}`)
      return Promise.resolve(`br-fork-${forked.length}`)
    },
    deleteBranch: (id) => {
      deleted.push(id)
      return Promise.resolve()
    },
    listBranches: () => Promise.resolve([]),
    reactivate: () => Promise.resolve(),
    resetFromParent: (id) => {
      reset.push(id)
      return Promise.resolve()
    },
    connectionString: (id) => Promise.resolve(`postgres://fake/${id}`),
  }
  return { admin, deleted, forked, reset }
}

describe('orchestration-layer check-then-apply gate (Req 5.5)', () => {
  it('withholds a blocked step’s DDL while independent steps still execute', async () => {
    const fake = fakeExecutor({ probeRows: VIOLATING_ROWS })

    const outcomes = await applyGatedPlan(fake.exec, PLAN)

    // Verdicts: two blocked by their own failing check, two applied.
    expect(idsWith(outcomes, 'blocked')).toEqual([STEP_FK.id, STEP_UNIQUE.id].sort())
    expect(idsWith(outcomes, 'applied')).toEqual([STEP_COLUMN.id, STEP_INDEX.id].sort())
    expect(idsWith(outcomes, 'failed')).toEqual([])

    // THE DECISIVE ASSERTION — the executed-statement log, not the verdicts.
    // Neither blocked step's DDL was EVER sent to the database.
    expect(fake.statements).not.toContain(STEP_UNIQUE.ddl)
    expect(fake.statements).not.toContain(STEP_FK.ddl)
    // ...while the independent steps' DDL was.
    expect(fake.executedDdl()).toEqual([STEP_COLUMN.ddl, STEP_INDEX.ddl])
  })

  it('evaluates each bound pre-check BEFORE its own DDL, never after', async () => {
    const fake = fakeExecutor({ probeRows: VIOLATING_ROWS })

    await applyGatedPlan(fake.exec, PLAN)

    // The clean gated step's probe precedes its DDL in the issue log.
    const probeAt = fake.statements.indexOf(NULL_PROBE)
    const ddlAt = fake.statements.indexOf(STEP_INDEX.ddl)
    expect(probeAt).toBeGreaterThanOrEqual(0)
    expect(ddlAt).toBeGreaterThan(probeAt)

    // The blocked steps' probes ran; their DDL never did.
    expect(fake.statements).toContain(DUPLICATE_PROBE)
    expect(fake.statements).toContain(ORPHAN_PROBE)
  })

  it('isolates a failing DDL to its own step and keeps going', async () => {
    // Every check passes; the FIRST step's DDL throws.
    const fake = fakeExecutor({ failingDdl: [STEP_COLUMN.ddl] })

    const outcomes = await applyGatedPlan(fake.exec, PLAN)

    expect(verdictOf(outcomes, STEP_COLUMN.id)).toBe('failed')
    // The loop did NOT abort: every later step still ran.
    expect(idsWith(outcomes, 'applied')).toEqual([STEP_FK.id, STEP_INDEX.id, STEP_UNIQUE.id].sort())
    expect(fake.executedDdl()).toEqual([
      STEP_COLUMN.ddl,
      STEP_UNIQUE.ddl,
      STEP_INDEX.ddl,
      STEP_FK.ddl,
    ])
    // The failure is reported, with its message, on that step alone.
    const failed = outcomes.find((outcome) => outcome.stepId === STEP_COLUMN.id)
    expect(failed?.error).toContain('42P16')
    expect(outcomes.filter((outcome) => outcome.error !== null)).toHaveLength(1)
  })

  it('fails closed when a pre-check probe cannot be evaluated', async () => {
    const fake = fakeExecutor({ throwingProbes: [ORPHAN_PROBE] })

    const outcomes = await applyGatedPlan(fake.exec, PLAN)

    // Unverifiable data conformance blocks the step — it is never optimistically
    // applied — and the probe error is carried for the report.
    expect(verdictOf(outcomes, STEP_FK.id)).toBe('blocked')
    expect(fake.statements).not.toContain(STEP_FK.ddl)
    const blocked = outcomes.find((outcome) => outcome.stepId === STEP_FK.id)
    expect(blocked?.preCheck).toBeNull()
    expect(blocked?.error).toContain('probe failed')
  })

  it('never probes or executes an inert operator-confirm step (Req 6.6)', async () => {
    const fake = fakeExecutor()

    const outcomes = await applyGatedPlan(fake.exec, [STEP_INERT])

    expect(idsWith(outcomes, 'inert')).toEqual([STEP_INERT.id])
    expect(fake.statements).toEqual([])
  })

  it('applies steps in step.order regardless of plan array order', async () => {
    const fake = fakeExecutor()

    await applyGatedPlan(fake.exec, PLAN)

    expect(fake.executedDdl()).toEqual([
      STEP_COLUMN.ddl, // order 1
      STEP_UNIQUE.ddl, // order 2
      STEP_INDEX.ddl, // order 3
      STEP_FK.ddl, // order 4
    ])
  })

  it('mutates no branch data to satisfy a pre-check (Req 5.6)', async () => {
    const fake = fakeExecutor({ probeRows: VIOLATING_ROWS })

    await applyGatedPlan(fake.exec, PLAN)

    const planDdl = new Set(PLAN.map((step) => step.ddl))
    for (const statement of fake.statements) {
      if (planDdl.has(statement)) continue
      // Everything that is not plan DDL is a read-only probe.
      expect(statement.trimStart().toUpperCase().startsWith('SELECT'), statement).toBe(true)
    }
  })

  it('routes verifyOnFork DDL through the gate and reports the blocked steps', async () => {
    const fake = fakeExecutor({ probeRows: VIOLATING_ROWS })
    const { admin, deleted, forked } = fakeAdmin()
    const runner = createDriftRunner({
      neonAdmin: admin,
      executorFactory: () => fake.exec,
      readerFactory: () => fakeReader(),
      prodBranchId: 'br-fake-prod',
      forkName: () => 'drift-verify-fake',
    })

    const report = await runner.verifyOnFork(PLAN, CANONICAL)

    // The fork received the gated apply: blocked DDL was never issued.
    expect(forked).toEqual(['br-fake-prod->drift-verify-fake'])
    expect(fake.statements).not.toContain(STEP_UNIQUE.ddl)
    expect(fake.statements).not.toContain(STEP_FK.ddl)
    expect(fake.executedDdl()).toEqual([STEP_COLUMN.ddl, STEP_INDEX.ddl])

    // Blocked steps reach the report, so the Conformance_Report can list them.
    expect(report.blockedStepIds.sort()).toEqual([STEP_FK.id, STEP_UNIQUE.id].sort())
    expect(idsWith(report.stepOutcomes, 'applied')).toEqual([STEP_COLUMN.id, STEP_INDEX.id].sort())
    // A failing pre-check can never be reported as convergence (Req 7.3).
    expect(report.converged).toBe(false)
    expect(report.preCheckResults.some((result) => !result.passed)).toBe(true)
    // The disposable fork is always disposed.
    expect(deleted).toEqual(['br-fork-1'])
  })

  it('routes rollout DDL through the gate and records blocked steps per branch', async () => {
    const fake = fakeExecutor({ probeRows: VIOLATING_ROWS })
    const { admin } = fakeAdmin()
    const runner = createDriftRunner({
      neonAdmin: admin,
      executorFactory: () => fake.exec,
      readerFactory: () => fakeReader(),
      branchStrategies: { [FAKE_BRANCH]: 'forward_migrate' },
      captureRestorePoint: () => Promise.resolve('br-restore-point'),
    })

    const report = await runner.rollout(PLAN, [FAKE_BRANCH], CANONICAL)

    // A blocked step's DDL is withheld from the REAL branch, and the independent
    // steps still apply there.
    expect(fake.statements).not.toContain(STEP_UNIQUE.ddl)
    expect(fake.statements).not.toContain(STEP_FK.ddl)
    expect(fake.executedDdl()).toEqual([STEP_COLUMN.ddl, STEP_INDEX.ddl])

    expect(report.blocked.map((item) => item.stepId).sort()).toEqual(
      [STEP_FK.id, STEP_UNIQUE.id].sort(),
    )
    for (const item of report.blocked) {
      expect(item.branchId).toBe(FAKE_BRANCH)
      expect(item.preCheck?.passed).toBe(false)
      expect(item.preCheck?.violationCount).toBeGreaterThan(0)
    }
    // A restore point was captured before any DDL (Req 10.1).
    expect(report.restorePoints[FAKE_BRANCH]).toBe('br-restore-point')
  })
})
