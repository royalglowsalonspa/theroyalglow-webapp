/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-09-2026 & Updated - 04-09-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/__tests__/convergence.integration.test
 * Scope        : Schema Drift Remediation — live convergence verification
 *
 * Feature      : schema-drift-remediation
 * Task         : 12.1 — Write convergence integration test
 * Property     : Property 6 — Convergence to canonical
 * Validates    : Requirements 8.5, 13.7
 *
 *   Req 8.5  : "WHEN rollout completes, THE Drift_Runner SHALL confirm that the
 *              fingerprint of each of `prod`, `dev`, `test`, and `pprd` equals
 *              the Canonical_Fingerprint."
 *   Req 13.7 : "THE Schema_Drift_System SHALL verify convergence to canonical
 *              (design Property 6) by an integration assertion on a Neon fork
 *              that the post-rollout fingerprint equals the
 *              Canonical_Fingerprint."
 *
 * Description  : Proves Property 6 end-to-end against REAL Neon. A disposable
 *                fork of `prod` is drifted on purpose, the reconcile plan is
 *                derived from `diff(canonical, fork)`, `runner.verifyOnFork`
 *                applies the ENTIRE plan on a further disposable fork, and the
 *                post-apply fingerprint hash is asserted EQUAL to the
 *                Canonical_Fingerprint hash with every Data_Pre_Check passed.
 *
 * Why the fork is drifted first : Property 6 is only measurable when the plan
 *                has something to converge. An untouched `prod` fork currently
 *                yields an EMPTY plan (see "Recorded observations" below), so
 *                the assertion would be vacuous. The suite therefore seeds
 *                structural drift the additive Reconciler is designed to repair
 *                (a dropped nullable column, a dropped plain index, two dropped
 *                foreign keys) and asserts the plan restores the fork exactly.
 *
 * Recorded observations (live run, `prod` = br-bold-cake-aotql242) :
 *   1. `prod` once differed from canonical in EXACTLY one object:
 *      `public."user".role` carried no column default while canonical has
 *      `DEFAULT 'customer'::text`.
 *   2. `reconcile.ts` NOW emits a step for a divergent column DEFAULT (an
 *      idempotent `ALTER COLUMN ... SET/DROP DEFAULT` in the columns band,
 *      derived from the canonical fingerprint and needing no data pre-check).
 *      The former hand-written `alignColumnDefaults` compensation is therefore
 *      DELETED: the fork is aligned to canonical by THE PLAN ALONE, and the
 *      suite asserts the plan leaves NO diff entry unexpressed.
 *   3. `runner.verifyOnFork` now applies every step through the Req 5.5
 *      check-then-apply gate (`applyGatedPlan`): each bound Data_Pre_Check runs
 *      BEFORE its DDL, a violating check blocks that one step, and a failing
 *      statement no longer aborts the loop. The seeded drift deliberately
 *      introduces no data violation, so every step here applies and
 *      `VerifyReport.stepOutcomes` carries no `blocked` verdict.
 *
 * Skip behaviour : Guarded by `describe.skipIf(!isDriftForkAvailable())`, which
 *                requires BOTH a live `DATABASE_URL` and a `NEON_API_KEY`. CI has
 *                neither, so the whole suite SKIPS there instead of failing the
 *                pipeline. Excluded from `bun run test` by the
 *                `.integration.test.ts` suffix; run via `bun run test:integration`.
 *
 * SAFETY (non-negotiable) : `prod`, `dev`, `test` and `pprd` are NEVER written
 *                to. Every DDL statement lands on a disposable `zz-drift-verify-*`
 *                fork; `prod` is only ever a fork PARENT. No `resetFromParent` is
 *                called on any real branch. Both forks this suite creates are
 *                deleted in a final test plus an `afterAll` that runs even when
 *                an assertion fails, and `survivingThrowawayBranches()` PROVES no
 *                orphan remains. The Neon API key and connection strings are
 *                never logged.
 *
 * Fixture constraint : no fixture reintroduces pg_cron or `cron.schedule`
 *                objects — pg_cron is RETIRED (QStash scheduled HTTP jobs
 *                replaced it) and `fingerprint.ts` excludes retired pg_cron
 *                rows, so such a fixture would be both off-canonical and
 *                invisible to the fingerprint.
 *
 * Tech Stack   : Vitest, Neon serverless + Management API, Drizzle Kit
 * Layer        : Data Access (Test)
 *
 * Dependencies : vitest, ./live-fork, ../canonical, ../diff, ../reconcile,
 *                ../runner, ../types
 *
 * Notes        : Neon control-plane operations are polled and slow (fork,
 *                endpoint, delete) and canonical derivation materializes the
 *                full 38-table schema statement-by-statement over neon-http, so
 *                the hooks and tests carry MINUTE-scale timeouts.
 ************************************************************/

// Feature: schema-drift-remediation, Property 6: Convergence to canonical

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CanonicalFingerprint } from '../canonical'
import type { SqlExecutor } from '../catalog-queries'
import { SchemaDiffer } from '../diff'
import { Reconciler } from '../reconcile'
import { createDriftRunner, type VerifyReport } from '../runner'
import type { BranchId, DiffEntry, ReconcileStep } from '../types'
import {
  canonicalOnFork,
  deleteFork,
  fingerprintOf,
  forkName,
  forkProd,
  isDriftForkAvailable,
  neonAdmin,
  PROD_BRANCH_ID,
  survivingThrowawayBranches,
} from './live-fork'

const LIVE = isDriftForkAvailable()

/** Neon control-plane work is polled; allow minutes, not seconds. */
const SETUP_TIMEOUT_MS = 20 * 60 * 1000
const TEST_TIMEOUT_MS = 15 * 60 * 1000
const CLEANUP_TIMEOUT_MS = 5 * 60 * 1000

/**
 * The four REAL branches of `theroyalglow-db`. Listed only so the suite can
 * ASSERT it never targets one of them with DDL. Mirrors the defaults in
 * `runner.ts`.
 */
const REAL_BRANCH_IDS: ReadonlySet<BranchId> = new Set<BranchId>([
  PROD_BRANCH_ID, // prod
  'br-rapid-block-aoh6m3q0', // dev
  'br-floral-waterfall-aoag027c', // test
  'br-super-king-aoqdtfor', // pprd
])

// ─────────────────────────────────────────────────────────
// Seeded drift fixtures.
//
// Chosen so the ADDITIVE Reconciler can restore each one exactly:
//   - `business_hour` has NO foreign keys and is referenced by none, so dropping
//     and re-adding a column cannot disturb the attnum -> column resolution that
//     `fingerprint.ts` relies on for FK members.
//   - the index is plain (non-unique, no predicate), so re-creating it cannot
//     collide with a constraint-backing index.
//   - UNIQUE / PRIMARY KEY constraints are deliberately NOT seeded: their
//     backing index is also fingerprinted, and the reconciler would add both a
//     constraint and a separately-named unique index, duplicating the entry.
// ─────────────────────────────────────────────────────────

const SEED_COLUMN = { table: 'business_hour', column: 'open_time' } as const
const SEED_INDEX = { table: 'audit_log', columns: ['entity_id', 'entity_type'] } as const
const SEED_FOREIGN_KEYS = [
  { table: 'audit_log', columns: ['actor_id'] },
  { table: 'notification', columns: ['user_id'] },
] as const

/** Number of objects the fixtures remove — one reconcile step is due for each. */
const SEEDED_DRIFT_COUNT = 1 + 1 + SEED_FOREIGN_KEYS.length

// ─────────────────────────────────────────────────────────
// SQL helpers. Identifiers come from our own catalog (never user input) but are
// still double-quoted + escaped, matching `reconcile.ts`.
// ─────────────────────────────────────────────────────────

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

type IndexRow = { indexname: string; indexdef: string }
type ConstraintRow = { conname: string; def: string }

/**
 * Column names inside the FIRST top-level parenthesised group of a catalog
 * definition, normalised: quotes and per-member modifiers (`DESC`, `NULLS
 * LAST`, opclasses) stripped, then sorted. Catalog definitions do not preserve
 * the column order the fingerprint reports (the fingerprint sorts index members
 * by name), so comparison must be order-insensitive.
 */
function definitionColumns(definition: string): string[] {
  const open = definition.indexOf('(')
  const close = definition.indexOf(')', open)
  if (open === -1 || close === -1) return []
  return definition
    .slice(open + 1, close)
    .split(',')
    .map(
      (member) =>
        member
          .trim()
          .replace(/"/g, '')
          .replace(/\s+(ASC|DESC)\b/gi, '')
          .replace(/\s+NULLS\s+(FIRST|LAST)\b/gi, '')
          .split(/\s+/)[0],
    )
    .filter((member): member is string => member !== undefined && member !== '')
    .sort()
}

function sameColumnSet(definition: string, columns: readonly string[]): boolean {
  const found = definitionColumns(definition)
  const wanted = [...columns].sort()
  return found.length === wanted.length && found.every((name, i) => name === wanted[i])
}

/** Resolve a plain (non-unique, non-partial) index by its exact column set. */
async function findPlainIndexName(
  exec: SqlExecutor,
  table: string,
  columns: readonly string[],
): Promise<string | null> {
  const rows = await exec<IndexRow>(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = ${quoteLiteral(table)}`,
  )
  const match = rows.find(
    (row) =>
      !row.indexdef.includes('UNIQUE INDEX') &&
      !row.indexdef.includes(' WHERE ') &&
      sameColumnSet(row.indexdef.slice(row.indexdef.indexOf('USING')), columns),
  )
  return match?.indexname ?? null
}

/** Resolve a foreign-key constraint by its exact child column set. */
async function findForeignKeyName(
  exec: SqlExecutor,
  table: string,
  columns: readonly string[],
): Promise<string | null> {
  const rows = await exec<ConstraintRow>(
    `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
     FROM pg_constraint con
     JOIN pg_class c ON c.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = ${quoteLiteral(table)} AND con.contype = 'f'`,
  )
  const match = rows.find(
    (row) => row.def.startsWith('FOREIGN KEY') && sameColumnSet(row.def, columns),
  )
  return match?.conname ?? null
}

// ─────────────────────────────────────────────────────────
// Baseline alignment — the reconcile plan now expresses EVERY divergence.
//
// The former `alignColumnDefaults` workaround is gone: `reconcile.ts` emits an
// idempotent `ALTER COLUMN ... SET/DROP DEFAULT` step for a divergent column
// DEFAULT, so an inherited `prod` divergence is repaired BY THE PLAN. The suite
// keeps a totality check instead of a compensation: any diff entry the plan
// leaves unexpressed is a failure, not something to patch around.
// ─────────────────────────────────────────────────────────

/** Diff entries for which `Reconciler.plan` emitted no step at all. */
function unexpressedEntries(objects: readonly DiffEntry[], plan: readonly ReconcileStep[]) {
  const expressed = new Set(plan.map((step) => step.diff))
  return objects.filter((entry) => !expressed.has(entry))
}

/** `diff.ts`-aligned identity of a diff entry, for readable failure messages. */
function identityOf(entry: DiffEntry): string {
  return `${entry.kind}:${entry.table ?? '-'}:${entry.object}:${entry.status}`
}

// ─────────────────────────────────────────────────────────
// Suite state.
// ─────────────────────────────────────────────────────────

/** Fork used only to materialize the Drizzle CODE and read canonical off it. */
let canonicalForkId: BranchId | null = null
/** Fork that stands in for `prod` as the drifted rollout target. */
let driftedForkId: BranchId | null = null

let canonical: CanonicalFingerprint
/** Plan DDL applied to align the fork with canonical before seeding drift. */
let alignmentStatements: string[] = []
/** Diff identities the reconciler expressed no step for (must stay EMPTY). */
let inheritedUnexpressed: string[] = []
/** Baseline hash of the fork AFTER alignment, BEFORE seeding drift. */
let alignedHash: string
let plan: ReconcileStep[] = []
let report: VerifyReport

describe.skipIf(!LIVE)('drift convergence on a live Neon fork (Property 6)', () => {
  beforeAll(async () => {
    // ── 1. Canonical_Fingerprint from the Drizzle CODE (Req 1.1, 1.2).
    //    A dedicated fork's `public` schema is emptied and the code is
    //    materialized into it, so canonical never comes from a live branch.
    const canonicalFork = await forkProd('canonical')
    canonicalForkId = canonicalFork.branchId
    expect(REAL_BRANCH_IDS.has(canonicalFork.branchId)).toBe(false)
    canonical = await canonicalOnFork(canonicalFork)

    // ── 2. A second fork of `prod` becomes the drifted rollout target. All DDL
    //    below lands here; `prod` itself is only the fork parent.
    const fork = await forkProd('drifted')
    driftedForkId = fork.branchId
    expect(REAL_BRANCH_IDS.has(fork.branchId)).toBe(false)

    // ── 3. Align the fork with canonical using THE PLAN ALONE. Every inherited
    //    divergence — including a column DEFAULT — is now expressible, so no
    //    hand-written compensation is applied. `inheritedUnexpressed` is
    //    asserted empty below rather than patched around.
    const inheritedFp = await fingerprintOf(fork.exec)
    const inheritedDiff = SchemaDiffer.diff(canonical.fingerprint, inheritedFp.fingerprint)
    const inheritedPlan = Reconciler.plan(inheritedDiff)
    inheritedUnexpressed = unexpressedEntries(inheritedDiff.objects, inheritedPlan)
      .map(identityOf)
      .sort()
    alignmentStatements = []
    for (const step of inheritedPlan) {
      await fork.exec(step.ddl)
      alignmentStatements.push(step.ddl)
    }
    alignedHash = (await fingerprintOf(fork.exec)).hash

    // ── 4. Seed structural drift the additive Reconciler is built to repair.
    await fork.exec(
      `ALTER TABLE ${quoteIdent(SEED_COLUMN.table)} DROP COLUMN ${quoteIdent(SEED_COLUMN.column)};`,
    )

    const indexName = await findPlainIndexName(fork.exec, SEED_INDEX.table, SEED_INDEX.columns)
    expect(
      indexName,
      `plain index ${SEED_INDEX.columns.join('+')} on ${SEED_INDEX.table}`,
    ).not.toBe(null)
    await fork.exec(`DROP INDEX ${quoteIdent(indexName as string)};`)

    for (const fk of SEED_FOREIGN_KEYS) {
      const name = await findForeignKeyName(fork.exec, fk.table, fk.columns)
      expect(name, `foreign key ${fk.table}(${fk.columns.join(',')})`).not.toBe(null)
      await fork.exec(
        `ALTER TABLE ${quoteIdent(fk.table)} DROP CONSTRAINT ${quoteIdent(name as string)};`,
      )
    }

    // ── 5. Derive the reconcile plan for the now-drifted fork.
    const driftedFp = await fingerprintOf(fork.exec)
    const driftedDiff = SchemaDiffer.diff(canonical.fingerprint, driftedFp.fingerprint)
    plan = Reconciler.plan(driftedDiff)

    // ── 6. Prove the plan on a disposable fork of the DRIFTED fork. `prod` is
    //    never the DDL target: `prodBranchId` points at our throwaway branch,
    //    and the Verify_Branch carries the `zz-drift-verify-` prefix so cleanup
    //    is provable.
    const runner = createDriftRunner({
      forkName: () => forkName('verify'),
      neonAdmin: neonAdmin(),
      prodBranchId: fork.branchId,
    })
    report = await runner.verifyOnFork(plan, canonical)
  }, SETUP_TIMEOUT_MS)

  afterAll(async () => {
    // Belt and braces: the cleanup test below deletes these, but this hook runs
    // even when an assertion or the setup fails.
    await deleteFork(canonicalForkId)
    await deleteFork(driftedForkId)
    canonicalForkId = null
    driftedForkId = null
  }, CLEANUP_TIMEOUT_MS)

  it('aligns the prod fork to canonical using the reconcile plan alone', () => {
    // The reconciler expresses EVERY inherited divergence — the column-DEFAULT
    // class it once emitted nothing for included — so nothing outside the plan
    // is applied and no compensation remains.
    expect(inheritedUnexpressed).toEqual([])

    // After alignment the fork is byte-identical to canonical, which is what
    // makes the seeded-drift convergence assertion below meaningful.
    expect(alignedHash).toBe(canonical.hash)
  })

  it('plans one reconcile step per seeded drift object', () => {
    expect(plan.length).toBe(SEEDED_DRIFT_COUNT)
    // Ordered enums -> columns -> pk/unique -> indexes -> foreign keys.
    const orders = plan.map((step) => step.order)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })

  it(
    'converges the fork to the Canonical_Fingerprint with every pre-check passed',
    () => {
      // Property 6 / Req 8.5 / Req 13.7 — the post-apply fingerprint hash of the
      // fork EQUALS the Canonical_Fingerprint hash.
      expect(report.canonicalHash).toBe(canonical.hash)
      expect(report.forkHash).toBe(canonical.hash)

      // ...AND every Data_Pre_Check passed (Req 7.3). The two seeded foreign
      // keys each bind an `orphan_fk` probe.
      expect(report.preCheckResults.length).toBeGreaterThanOrEqual(SEED_FOREIGN_KEYS.length)
      for (const result of report.preCheckResults) {
        expect(result.passed, `${result.check.kind}: ${result.check.description}`).toBe(true)
        expect(result.violationCount).toBe(0)
      }

      // Both conditions together are the runner's convergence verdict, and no
      // residual diff is reported.
      expect(report.converged).toBe(true)
      expect(report.diff).toBeUndefined()
      expect(report.verifyBranchId).not.toBe(null)
      expect(REAL_BRANCH_IDS.has(report.verifyBranchId as BranchId)).toBe(false)
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'leaves no orphaned throwaway branch behind',
    async () => {
      expect(await deleteFork(canonicalForkId)).toBe(null)
      canonicalForkId = null
      expect(await deleteFork(driftedForkId)).toBe(null)
      driftedForkId = null

      // The Verify_Branch is deleted by `verifyOnFork` itself; these two were
      // ours. Nothing carrying the throwaway prefix may survive.
      const surviving = await survivingThrowawayBranches()
      expect(surviving.map((branch) => branch.name)).toEqual([])
    },
    CLEANUP_TIMEOUT_MS,
  )
})
