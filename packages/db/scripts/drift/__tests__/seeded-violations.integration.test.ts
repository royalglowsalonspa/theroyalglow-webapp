/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-09-2026 & Updated - 04-09-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/__tests__/seeded-violations.integration.test
 * Scope        : Schema Drift Remediation — live blocked-step + idempotence
 *
 * Feature      : schema-drift-remediation
 * Task         : 12.3 — Write seeded-violation and idempotence integration test
 * Validates    : Requirements 5.5, 6.1
 *
 *   Req 5.5 : "IF a Data_Pre_Check reports a violation, THEN THE
 *             Schema_Drift_System SHALL skip that step's DDL, mark the step
 *             blocked, record the violation in the Conformance_Report, and
 *             continue with independent steps."
 *   Req 6.1 : "THE Reconciler SHALL emit corrective DDL using guarded forms
 *             (`IF NOT EXISTS` or catalog existence probes) so that applying
 *             the Reconcile_Plan twice yields the same fingerprint as applying
 *             it once."
 *
 * NOTE ON PROPERTY LABELS : this suite carries NO `Property N` tag. Blocked-step
 *                handling and live idempotence are not among the eight design
 *                correctness properties — Properties 6 and 8 are covered by
 *                tasks 12.1 / 12.2 respectively. This suite is the LIVE
 *                counterpart of the pure-planning unit suite
 *                `precheck-blocked-steps.test.ts` (task 5.4) and of the modeled
 *                idempotence property test (task 6.2, Property 5): the same two
 *                contracts, re-proved against REAL Postgres data.
 *
 * Description  : Seeds DELIBERATE DATA violations on a disposable fork of `prod`
 *                so the pre-checks genuinely FAIL against real rows, then proves
 *                three things:
 *
 *   1. VIOLATIONS ARE DETECTED ON REAL DATA. `audit_log`'s PRIMARY KEY and its
 *      `actor_id` foreign key are dropped and two rows are inserted that share
 *      one `id` (duplicate key) and both point at a non-existent `user`
 *      (orphan FK). `PreChecker.evaluate` is asserted to report
 *      `passed === false`, `violationCount > 0` and a NON-EMPTY, BOUNDED
 *      `sample` for exactly those two checks — the real-data counterpart to
 *      Property 4's pure-function pre-check soundness.
 *
 *   2. REQUIREMENT 5.5, LIVE. The step bound to a failing pre-check is SKIPPED
 *      (its DDL string never reaches the database — proved with a recording
 *      `SqlExecutor` proxy), marked blocked, and recorded in the
 *      Conformance_Report, WHILE the independent steps still apply. Two CLEAN
 *      divergences are seeded alongside the violating ones precisely so there
 *      are genuine independent steps to observe applying: a dropped plain index
 *      (no bound pre-check at all) and a dropped foreign key on the empty
 *      `notification` table (bound pre-check that PASSES).
 *
 *   3. REQUIREMENT 6.1, LIVE. The gated plan is applied TWICE and the fork's
 *      fingerprint hash after the second application is asserted IDENTICAL to
 *      the hash after the first. The reconciler's guarded DDL
 *      (`CREATE INDEX IF NOT EXISTS`, `DO $$ ... IF NOT EXISTS (<catalog
 *      probe>)`) is what makes that hold, and the second pass re-issues the very
 *      same statements (asserted) rather than skipping them — so idempotence is
 *      measured against real Postgres, not a model.
 *
 * WHERE THE GATE LIVES — RECORDED OPEN FINDING (read before changing this file):
 *                `runner.ts` applies EVERY step's DDL BEFORE evaluating the
 *                bound pre-checks, and its apply loop has NO per-step
 *                try/catch. That is the open finding already recorded under
 *                tasks.md Notes ("Requirement 5.5 ... is enforced by
 *                `precheck.ts` at the planning layer but NOT at the
 *                orchestration layer"). Consequently `runner.verifyOnFork` /
 *                `runner.rollout` CANNOT be used to prove point 2: they would
 *                attempt the violating DDL, error, and abort the whole loop.
 *                This suite therefore implements the check-then-apply gate
 *                ITSELF (`gatedApply` below) — evaluate each step's bound
 *                `DataPreCheck` first, skip the DDL when it fails, continue with
 *                the independent steps — which is exactly the orchestration
 *                behaviour Req 5.5 describes. THE GATE IS IN THE TEST BECAUSE
 *                THE ORCHESTRATOR DOES NOT YET IMPLEMENT IT. `runner.ts` is
 *                deliberately NOT refactored here: that needs an explicit owner
 *                decision on whether Req 5.5 is an orchestration-layer
 *                contract. The final assertion test corroborates the current
 *                orchestrator behaviour non-fragilely: it feeds each blocked
 *                step's DDL to real Postgres and asserts Postgres REJECTS it —
 *                which is what an ungated apply loop hits today — and that the
 *                rejected DDL leaves the fork's fingerprint unchanged.
 *
 * Recorded observations reused from 12.1 / 12.2 (live `prod` = br-bold-cake-aotql242) :
 *   1. `prod` differs from canonical in EXACTLY one object: `public."user".role`
 *      carries no column default while canonical has `DEFAULT 'customer'::text`.
 *      `reconcile.ts` emits no step for a divergent column DEFAULT, so that
 *      inherited divergence contributes nothing to the plan (asserted here, not
 *      assumed). Convergence to canonical is therefore NOT asserted by this
 *      suite — that is task 12.1's job.
 *   2. A dropped UNIQUE constraint would ALSO surface its backing unique index
 *      as a separate `missing_on_branch` index step, and `reconcile.ts` binds NO
 *      pre-check to an index step — an ungated `CREATE UNIQUE INDEX` that real
 *      duplicate data would reject. The duplicate-key violation is therefore
 *      seeded on a PRIMARY KEY instead: `catalog-queries.ts` excludes
 *      `indisprimary` indexes, so a dropped PK yields exactly ONE gated step and
 *      no ungated companion.
 *   3. Fork row baseline on a `prod` fork: `user=2 account=2 session=3
 *      loyalty_account=2`, every other table 0. `audit_log` and `notification`
 *      both start empty, which is why the seeded rows are the ONLY violations
 *      and why `notification`'s foreign key re-add is genuinely clean.
 *
 * Skip behaviour : Guarded by `describe.skipIf(!isDriftForkAvailable())`, which
 *                requires BOTH a live `DATABASE_URL` and a `NEON_API_KEY`. CI has
 *                neither, so the whole suite SKIPS there instead of failing the
 *                pipeline. Excluded from `bun run test` by the
 *                `.integration.test.ts` suffix; run via `bunx vitest run` on this
 *                file.
 *
 * SAFETY (non-negotiable) : `prod`, `dev`, `test` and `pprd` are NEVER written
 *                to. Every seed, INSERT and DDL statement in this suite lands on
 *                a disposable `zz-drift-verify-*` fork; `prod` is only ever a
 *                fork PARENT and a read-only catalog source. No
 *                `resetFromParent` is called on any branch, and the archived
 *                `test`/`pprd` branches are never reactivated. Every write
 *                target is asserted absent from the real-branch id set. Both
 *                forks are deleted in a final test PLUS an `afterAll` that runs
 *                even when an assertion fails, and `survivingThrowawayBranches()`
 *                PROVES no orphan remains. The Neon API key and connection
 *                strings are never logged.
 *
 * Fixture constraint : no fixture reintroduces pg_cron or `cron.schedule`
 *                objects — pg_cron is RETIRED (QStash scheduled HTTP jobs
 *                replaced it) and `fingerprint.ts` excludes retired pg_cron
 *                rows, so such a fixture would be both off-canonical and
 *                invisible to the fingerprint. Seeded rows follow the project's
 *                DB conventions: `text` nanoid-style primary keys, explicit
 *                `timestamptz` (`now()`) timestamps; no money column is involved,
 *                so the integer-paise rule does not apply here.
 *
 * Tech Stack   : Vitest, Neon serverless + Management API, Drizzle Kit
 * Layer        : Data Access (Test)
 *
 * Dependencies : vitest, ./live-fork, ../canonical, ../catalog-queries, ../diff,
 *                ../precheck, ../reconcile, ../report, ../types
 *
 * Notes        : Neon control-plane operations are polled and slow (fork,
 *                endpoint, delete) and canonical derivation materializes the
 *                full 38-table schema statement-by-statement over neon-http, so
 *                the hooks and tests carry MINUTE-scale timeouts.
 ************************************************************/

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CanonicalFingerprint } from '../canonical'
import type { SqlExecutor } from '../catalog-queries'
import { SchemaDiffer } from '../diff'
import { PreChecker, type ProbeReader } from '../precheck'
import { Reconciler } from '../reconcile'
import { type ConformanceReport, RATIFIED_DATA_LOSS_NOTE, Reporter } from '../report'
import type { BranchId, DiffEntry, PreCheckResult, ReconcileStep } from '../types'
import {
  canonicalOnFork,
  deleteFork,
  type Fork,
  fingerprintOf,
  forkProd,
  isDriftForkAvailable,
  PROD_BRANCH_ID,
  RUN_ID,
  survivingThrowawayBranches,
} from './live-fork'

const LIVE = isDriftForkAvailable()

/** Neon control-plane work is polled; allow minutes, not seconds. */
const SETUP_TIMEOUT_MS = 20 * 60 * 1000
const TEST_TIMEOUT_MS = 15 * 60 * 1000
const CLEANUP_TIMEOUT_MS = 5 * 60 * 1000

/**
 * The four REAL branches of `theroyalglow-db`. Listed only so the suite can
 * ASSERT it never targets one of them with a write. Mirrors `runner.ts`.
 */
const REAL_BRANCH_IDS: ReadonlySet<BranchId> = new Set<BranchId>([
  PROD_BRANCH_ID, // prod
  'br-rapid-block-aoh6m3q0', // dev
  'br-floral-waterfall-aoag027c', // test
  'br-super-king-aoqdtfor', // pprd
])

/** Bound `precheck.ts` applies to `PreCheckResult.sample`. */
const SAMPLE_LIMIT = 20

// ─────────────────────────────────────────────────────────
// Seeded fixtures.
//
// Two VIOLATING divergences (their pre-checks must FAIL) and two CLEAN ones
// (their steps must APPLY), all on the disposable fork:
//
//   VIOLATING
//   - `audit_log` PRIMARY KEY dropped + two rows sharing one `id`
//       -> `duplicate_key` pre-check fails. A PRIMARY KEY (not a UNIQUE) is used
//          deliberately: `catalog-queries.ts` excludes `indisprimary` indexes, so
//          the diff yields exactly ONE gated step. A dropped UNIQUE would also
//          surface its backing unique index as a SECOND, UNGATED step that real
//          duplicate data would reject.
//   - `audit_log.actor_id -> user(id)` foreign key dropped + those same two rows
//     pointing at a non-existent `user`
//       -> `orphan_fk` pre-check fails.
//
//   CLEAN (the "independent steps" of Req 5.5)
//   - plain index `audit_log(entity_type, entity_id)` dropped
//       -> index step, NO bound pre-check, must apply. Deliberately on the SAME
//          table as both blocked steps, so "independent" is proved at step
//          granularity rather than table granularity.
//   - `notification.user_id -> user(id)` foreign key dropped
//       -> `orphan_fk` pre-check that PASSES (`notification` is empty), so a
//          GATED-BUT-CLEAN step is also observed applying.
//
// `audit_log` carries no UNIQUE constraint and is referenced by no foreign key,
// so dropping its PRIMARY KEY disturbs nothing else. Dropping a PRIMARY KEY
// leaves the key columns `NOT NULL` in Postgres, so no column divergence appears.
// ─────────────────────────────────────────────────────────

const VIOLATION_TABLE = 'audit_log'
const VIOLATION_PK_COLUMNS = ['id'] as const
const VIOLATION_FK = { table: 'audit_log', columns: ['actor_id'] } as const
const CLEAN_INDEX = { table: 'audit_log', columns: ['entity_type', 'entity_id'] } as const
const CLEAN_FK = { table: 'notification', columns: ['user_id'] } as const

/** Throwaway, clearly-prefixed nanoid-style `text` ids for the seeded rows. */
const SEED_ROW_ID = `zzdrift_${RUN_ID}_dup`
/** An `actor_id` that deliberately matches NO row in `public."user"`. */
const SEED_GHOST_ACTOR_ID = `zzdrift_${RUN_ID}_ghost`

/**
 * Structural identity of every step the seeded fixtures must produce, keyed the
 * way `diff.ts` names its entries. Used as a SAFETY GUARD: `beforeAll` throws
 * before executing any DDL if the plan contains a step outside this set, so an
 * unexpected divergence can never be applied blind.
 */
const EXPECTED_STEP_IDENTITIES: ReadonlySet<string> = new Set([
  'primaryKey:audit_log:id:missing_on_branch',
  'foreignKey:audit_log:actor_id -> user(id):missing_on_branch',
  'index:audit_log:entity_id, entity_type [btree]:missing_on_branch',
  'foreignKey:notification:user_id -> user(id):missing_on_branch',
])

/** Steps whose bound pre-check must FAIL, so their DDL is never executed. */
const EXPECTED_BLOCKED_IDENTITIES: ReadonlySet<string> = new Set([
  'primaryKey:audit_log:id:missing_on_branch',
  'foreignKey:audit_log:actor_id -> user(id):missing_on_branch',
])

/** Steps that must APPLY despite the blocked ones (Req 5.5 "independent steps"). */
const EXPECTED_APPLIED_IDENTITIES: ReadonlySet<string> = new Set([
  'index:audit_log:entity_id, entity_type [btree]:missing_on_branch',
  'foreignKey:notification:user_id -> user(id):missing_on_branch',
])

/** `diff.ts`-aligned identity of a diff entry. */
function identityOf(entry: DiffEntry): string {
  return `${entry.kind}:${entry.table ?? '-'}:${entry.object}:${entry.status}`
}

function stepIdentity(step: ReconcileStep): string {
  return identityOf(step.diff)
}

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

type ConstraintRow = { conname: string; def: string }
type IndexRow = { indexname: string; indexdef: string }

/** Column names in the first parenthesised group of a catalog definition, sorted. */
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

/** Resolve a constraint of a given `contype` by its exact column set. */
async function findConstraintName(
  exec: SqlExecutor,
  table: string,
  contype: 'p' | 'u' | 'f',
  columns: readonly string[],
): Promise<string | null> {
  const rows = await exec<ConstraintRow>(
    `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
     FROM pg_constraint con
     JOIN pg_class c ON c.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = ${quoteLiteral(table)}
       AND con.contype = ${quoteLiteral(contype)}`,
  )
  const match = rows.find((row) => sameColumnSet(row.def, columns))
  return match?.conname ?? null
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

// ─────────────────────────────────────────────────────────
// Recording executor — proves a blocked step's DDL never reached the database.
// Mirrors the proxy used by the 12.2 read-only audit suite.
// ─────────────────────────────────────────────────────────

type Recorder = {
  /** Every SQL string passed through the proxy, in issue order. */
  statements: string[]
  /** Drop-in `SqlExecutor` replacement that records then delegates. */
  exec: SqlExecutor
}

function recordingExecutor(inner: SqlExecutor): Recorder {
  const statements: string[] = []
  const exec: SqlExecutor = <Row>(query: string): Promise<Row[]> => {
    statements.push(query)
    return inner<Row>(query)
  }
  return { exec, statements }
}

// ─────────────────────────────────────────────────────────
// The check-then-apply gate.
//
// THIS IS THE ORCHESTRATION BEHAVIOUR REQ 5.5 DESCRIBES, IMPLEMENTED HERE
// BECAUSE `runner.ts` DOES NOT YET IMPLEMENT IT (recorded open finding — see the
// header block). For each step in `step.order`: evaluate the bound
// `DataPreCheck` FIRST; if it fails, record the step blocked and DO NOT execute
// its DDL; otherwise execute it. Each execution is individually wrapped, so one
// failing statement blocks one step instead of aborting the loop — the "continue
// with independent steps" half of Req 5.5.
// ─────────────────────────────────────────────────────────

type StepVerdict = 'applied' | 'blocked' | 'failed' | 'inert'

type StepOutcome = {
  identity: string
  verdict: StepVerdict
  preCheck: PreCheckResult | null
  error: string | null
}

type ApplyPass = {
  outcomes: StepOutcome[]
  /** DDL statements that actually reached the database, in issue order. */
  executedDdl: string[]
  /** Pre-check probe statements issued during the gate, in issue order. */
  probes: string[]
}

/**
 * True when a step's DDL is inert — empty or only `--` comment lines (the
 * operator-confirm-flagged statements `reconcile.ts` never auto-applies). Mirrors
 * the private `isInertDdl` in `runner.ts`.
 */
function isInertDdl(ddl: string): boolean {
  return (
    ddl
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('--')).length === 0
  )
}

async function gatedApply(fork: Fork, plan: readonly ReconcileStep[]): Promise<ApplyPass> {
  // DDL goes through its own recorder so `executedDdl` is EXACTLY the set of
  // statements that reached the database — which is what makes the
  // "blocked DDL never executed" assertion decisive. Probes are recorded
  // separately so they cannot dilute that set.
  const ddl = recordingExecutor(fork.exec)
  const probe = recordingExecutor(fork.exec)
  const probeReader: ProbeReader = { query: (sql) => probe.exec(sql) }

  const outcomes: StepOutcome[] = []
  const ordered = [...plan].sort((a, b) => a.order - b.order)

  for (const step of ordered) {
    const identity = stepIdentity(step)

    if (isInertDdl(step.ddl)) {
      outcomes.push({ error: null, identity, preCheck: null, verdict: 'inert' })
      continue
    }

    // ── Req 5.5 gate: the bound pre-check runs BEFORE the DDL, never after.
    let preCheck: PreCheckResult | null = null
    if (step.preCheck !== null) {
      preCheck = await PreChecker.evaluate(step.preCheck, probeReader)
      if (!preCheck.passed) {
        // Blocked: the DDL is SKIPPED entirely and never touches `ddl.exec`.
        outcomes.push({ error: null, identity, preCheck, verdict: 'blocked' })
        continue
      }
    }

    try {
      await ddl.exec(step.ddl)
      outcomes.push({ error: null, identity, preCheck, verdict: 'applied' })
    } catch (error) {
      // Per-step isolation: record and continue with the independent steps.
      outcomes.push({
        error: error instanceof Error ? error.message : String(error),
        identity,
        preCheck,
        verdict: 'failed',
      })
    }
  }

  return { executedDdl: [...ddl.statements], outcomes, probes: [...probe.statements] }
}

function identitiesWith(pass: ApplyPass, verdict: StepVerdict): string[] {
  return pass.outcomes
    .filter((outcome) => outcome.verdict === verdict)
    .map((outcome) => outcome.identity)
    .sort()
}

// ─────────────────────────────────────────────────────────
// Suite state.
// ─────────────────────────────────────────────────────────

/** Fork used only to materialize the Drizzle CODE and read canonical off it. */
let canonicalForkId: BranchId | null = null
/** Fork that receives the seeded violations and the gated plan. */
let seededForkId: BranchId | null = null
/** Handle on the seeded fork, kept so the corroboration test can issue DDL. */
let seededFork: Fork | null = null

let canonical: CanonicalFingerprint
/** Seed statements applied to the disposable fork. */
let seedStatements: string[] = []
/** Diff entries the reconciler expressed no step for (expected: the DEFAULT gap). */
let unexpressedIdentities: string[] = []

let plan: ReconcileStep[] = []
/** Fork fingerprint hash BEFORE any plan application (post-seed baseline). */
let seededHash: string
/** First gated application. */
let pass1: ApplyPass
/** Fork fingerprint hash AFTER the first application. */
let hashAfterPass1: string
/** Second gated application of the SAME plan. */
let pass2: ApplyPass
/** Fork fingerprint hash AFTER the second application (must equal the first). */
let hashAfterPass2: string

describe.skipIf(!LIVE)('seeded-violation blocking and idempotence on a live Neon fork', () => {
  beforeAll(async () => {
    // ── 1. Canonical_Fingerprint from the Drizzle CODE (Req 1.1, 1.2), on its
    //    own disposable fork whose `public` schema is emptied first.
    const canonicalFork = await forkProd('canonical')
    canonicalForkId = canonicalFork.branchId
    expect(REAL_BRANCH_IDS.has(canonicalFork.branchId)).toBe(false)
    canonical = await canonicalOnFork(canonicalFork)

    // ── 2. A second fork of `prod` receives every seed and every DDL statement.
    //    `prod` is only the fork parent; no real branch is ever written to.
    const fork = await forkProd('seeded')
    seededForkId = fork.branchId
    seededFork = fork
    expect(REAL_BRANCH_IDS.has(fork.branchId)).toBe(false)

    // ── 3. Seed the divergences, VIOLATING ones first so the rows that break
    //    them can be inserted once the constraints are gone.
    const seeds: string[] = []

    const pkName = await findConstraintName(fork.exec, VIOLATION_TABLE, 'p', VIOLATION_PK_COLUMNS)
    expect(pkName, `primary key on ${VIOLATION_TABLE}`).not.toBe(null)
    seeds.push(
      `ALTER TABLE ${quoteIdent(VIOLATION_TABLE)} DROP CONSTRAINT ${quoteIdent(pkName as string)};`,
    )

    const violatingFkName = await findConstraintName(
      fork.exec,
      VIOLATION_FK.table,
      'f',
      VIOLATION_FK.columns,
    )
    expect(violatingFkName, `foreign key ${VIOLATION_FK.table}(${VIOLATION_FK.columns})`).not.toBe(
      null,
    )
    seeds.push(
      `ALTER TABLE ${quoteIdent(VIOLATION_FK.table)} DROP CONSTRAINT ${quoteIdent(violatingFkName as string)};`,
    )

    // Two rows sharing ONE `id` (duplicate key) and both referencing a `user`
    // that does not exist (orphan FK). Conventions: `text` nanoid-style ids,
    // explicit `timestamptz` via `now()`. No money column is involved.
    seeds.push(
      `INSERT INTO ${quoteIdent(VIOLATION_TABLE)} ` +
        '("id", "actor_id", "action", "entity_type", "entity_id", "created_at") VALUES ' +
        `(${quoteLiteral(SEED_ROW_ID)}, ${quoteLiteral(SEED_GHOST_ACTOR_ID)}, 'create', 'zz_drift_fixture', ${quoteLiteral(`${SEED_ROW_ID}_a`)}, now()), ` +
        `(${quoteLiteral(SEED_ROW_ID)}, ${quoteLiteral(SEED_GHOST_ACTOR_ID)}, 'create', 'zz_drift_fixture', ${quoteLiteral(`${SEED_ROW_ID}_b`)}, now());`,
    )

    const cleanIndexName = await findPlainIndexName(
      fork.exec,
      CLEAN_INDEX.table,
      CLEAN_INDEX.columns,
    )
    expect(
      cleanIndexName,
      `plain index ${CLEAN_INDEX.columns.join('+')} on ${CLEAN_INDEX.table}`,
    ).not.toBe(null)
    seeds.push(`DROP INDEX ${quoteIdent(cleanIndexName as string)};`)

    const cleanFkName = await findConstraintName(fork.exec, CLEAN_FK.table, 'f', CLEAN_FK.columns)
    expect(cleanFkName, `foreign key ${CLEAN_FK.table}(${CLEAN_FK.columns})`).not.toBe(null)
    seeds.push(
      `ALTER TABLE ${quoteIdent(CLEAN_FK.table)} DROP CONSTRAINT ${quoteIdent(cleanFkName as string)};`,
    )

    for (const statement of seeds) {
      await fork.exec(statement)
    }
    seedStatements = seeds

    // ── 4. Derive the plan for the now-seeded fork.
    const seededFp = await fingerprintOf(fork.exec)
    seededHash = seededFp.hash
    const diff = SchemaDiffer.diff(canonical.fingerprint, seededFp.fingerprint)
    plan = Reconciler.plan(diff)

    const expressed = new Set(plan.map((step) => step.diff))
    unexpressedIdentities = diff.objects
      .filter((entry) => !expressed.has(entry))
      .map(identityOf)
      .sort()

    // SAFETY GUARD: never execute a step we did not deliberately seed. Throwing
    // here aborts before any DDL runs; `afterAll` still deletes both forks.
    const unexpected = plan.map(stepIdentity).filter((id) => !EXPECTED_STEP_IDENTITIES.has(id))
    if (unexpected.length > 0) {
      throw new Error(
        `Reconcile plan contains steps outside the seeded fixture set; refusing to apply: ${unexpected.join(' | ')}`,
      )
    }

    // ── 5. FIRST gated application, then fingerprint.
    pass1 = await gatedApply(fork, plan)
    hashAfterPass1 = (await fingerprintOf(fork.exec)).hash

    // ── 6. SECOND gated application of the SAME plan, then fingerprint (Req 6.1).
    pass2 = await gatedApply(fork, plan)
    hashAfterPass2 = (await fingerprintOf(fork.exec)).hash
  }, SETUP_TIMEOUT_MS)

  afterAll(async () => {
    // Belt and braces: the cleanup test below deletes these, but this hook runs
    // even when an assertion or the setup fails.
    await deleteFork(canonicalForkId)
    await deleteFork(seededForkId)
    canonicalForkId = null
    seededForkId = null
    seededFork = null
  }, CLEANUP_TIMEOUT_MS)

  it('seeds the disposable fork only, never a real branch', () => {
    expect(seedStatements.length).toBe(5)
    for (const statement of seedStatements) {
      expect(statement).toMatch(
        /^(ALTER TABLE ".+" DROP CONSTRAINT ".+";|DROP INDEX ".+";|INSERT INTO ".+" \(.+\) VALUES .+;)$/,
      )
    }
    // Exactly one seed statement inserts data, and it targets only the fixture
    // rows on the disposable fork.
    const inserts = seedStatements.filter((s) => s.startsWith('INSERT'))
    expect(inserts.length).toBe(1)
    expect(inserts[0]).toContain(SEED_ROW_ID)
    expect(inserts[0]).toContain(SEED_GHOST_ACTOR_ID)

    expect(REAL_BRANCH_IDS.has(seededForkId as BranchId)).toBe(false)
    expect(REAL_BRANCH_IDS.has(canonicalForkId as BranchId)).toBe(false)
  })

  it('plans exactly one step per seeded divergence, in dependency order', () => {
    expect(plan.map(stepIdentity).sort()).toEqual([...EXPECTED_STEP_IDENTITIES].sort())

    // Ordered enums -> columns -> pk/unique -> indexes -> foreign keys.
    const orders = plan.map((step) => step.order)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)

    // The seeded fork is genuinely off-canonical, so the plan is not vacuous.
    expect(seededHash).not.toBe(canonical.hash)

    // The ONLY divergence the reconciler expresses no step for is the recorded
    // `user.role` DEFAULT gap inherited from `prod` (12.1's observation #2),
    // asserted rather than assumed.
    expect(unexpressedIdentities).toEqual(['column:user:role:divergent'])
  })

  // ── POINT 1: violations are detected on REAL data.

  it('detects the seeded duplicate-key and orphan-FK violations on real data', () => {
    const blocked = pass1.outcomes.filter((outcome) => outcome.verdict === 'blocked')
    expect(blocked.length).toBe(EXPECTED_BLOCKED_IDENTITIES.size)

    const byKind = new Map(
      blocked.map((outcome) => [outcome.preCheck?.check.kind as string, outcome]),
    )
    expect([...byKind.keys()].sort()).toEqual(['duplicate_key', 'orphan_fk'])

    for (const outcome of blocked) {
      const result = outcome.preCheck
      expect(result, `blocked step ${outcome.identity} must carry a pre-check result`).not.toBe(
        null,
      )
      if (result === null) continue

      // passed === false, a positive violation count, and a NON-EMPTY sample
      // that is BOUNDED by `precheck.ts`'s SAMPLE_LIMIT.
      expect(result.passed, `${result.check.kind}: ${result.check.description}`).toBe(false)
      expect(result.violationCount).toBeGreaterThan(0)
      expect(result.sample.length).toBeGreaterThan(0)
      expect(result.sample.length).toBeLessThanOrEqual(SAMPLE_LIMIT)
      expect(result.sample.length).toBeLessThanOrEqual(result.violationCount)
    }

    // The duplicate-key probe groups by `id`: one duplicated key, our seed.
    const duplicate = byKind.get('duplicate_key')?.preCheck
    expect(duplicate?.violationCount).toBe(1)
    expect(JSON.stringify(duplicate?.sample)).toContain(SEED_ROW_ID)

    // The orphan-FK probe returns each violating child row: both seeded rows.
    const orphan = byKind.get('orphan_fk')?.preCheck
    expect(orphan?.violationCount).toBe(2)
    expect(JSON.stringify(orphan?.sample)).toContain(SEED_GHOST_ACTOR_ID)
  })

  it('evaluates every pre-check through read-only SELECT probes only', () => {
    // Three checks are evaluated per pass: the two violating ones plus the clean
    // `notification` foreign key. The index step binds none.
    expect(pass1.probes.length).toBe(3)
    for (const probe of pass1.probes) {
      expect(probe.trimStart().toUpperCase().startsWith('SELECT'), probe).toBe(true)
    }
  })

  // ── POINT 2: Requirement 5.5 blocked-step contract, live.

  it('skips the blocked steps entirely while the independent steps still apply', () => {
    expect(identitiesWith(pass1, 'blocked')).toEqual([...EXPECTED_BLOCKED_IDENTITIES].sort())
    expect(identitiesWith(pass1, 'applied')).toEqual([...EXPECTED_APPLIED_IDENTITIES].sort())
    // Nothing errored: with the gate in place, no step reached a DDL failure.
    expect(identitiesWith(pass1, 'failed')).toEqual([])
    expect(identitiesWith(pass1, 'inert')).toEqual([])

    // THE DECISIVE ASSERTION. Only the two independent steps' DDL reached the
    // database, and each blocked step's DDL string is absent from the executed
    // log — it was never sent, not merely rolled back.
    const blockedDdl = plan
      .filter((step) => EXPECTED_BLOCKED_IDENTITIES.has(stepIdentity(step)))
      .map((step) => step.ddl)
    expect(blockedDdl.length).toBe(EXPECTED_BLOCKED_IDENTITIES.size)

    expect(pass1.executedDdl.length).toBe(EXPECTED_APPLIED_IDENTITIES.size)
    for (const ddl of blockedDdl) {
      expect(pass1.executedDdl, `blocked DDL was executed: ${ddl}`).not.toContain(ddl)
    }
    for (const step of plan) {
      if (EXPECTED_APPLIED_IDENTITIES.has(stepIdentity(step))) {
        expect(pass1.executedDdl).toContain(step.ddl)
      }
    }

    // The independent steps really landed: the fork moved away from its seeded
    // state even though two steps were blocked.
    expect(hashAfterPass1).not.toBe(seededHash)
  })

  it('records the blocked violations in the Conformance_Report (Req 5.5)', () => {
    const preChecks = pass1.outcomes
      .map((outcome) => outcome.preCheck)
      .filter((result): result is PreCheckResult => result !== null)

    const report: ConformanceReport = {
      branches: [
        {
          branch: seededForkId as BranchId,
          diff: SchemaDiffer.diff(canonical.fingerprint, canonical.fingerprint),
          preChecks,
        },
      ],
      canonicalHash: canonical.hash,
    }

    const markdown = Reporter.conformanceMarkdown(report)
    expect(markdown).toContain('2 blocked data pre-checks')
    expect(markdown).toContain('duplicate_key')
    expect(markdown).toContain('orphan_fk')
    expect(markdown).toContain(SEED_GHOST_ACTOR_ID)
    expect(markdown).toContain(RATIFIED_DATA_LOSS_NOTE)

    const parsed = JSON.parse(Reporter.conformanceJson(report)) as {
      branches: { blockedPreChecks: { kind: string; violationCount: number }[] }[]
    }
    const blocked = parsed.branches[0]?.blockedPreChecks ?? []
    expect(blocked.map((b) => b.kind).sort()).toEqual(['duplicate_key', 'orphan_fk'])
    for (const entry of blocked) {
      expect(entry.violationCount).toBeGreaterThan(0)
    }
  })

  // ── POINT 3: Requirement 6.1 idempotence, live.

  it(
    'applies the plan twice and yields an identical fingerprint (Req 6.1)',
    () => {
      // The second pass reaches the SAME verdicts — the blocked steps stay
      // blocked (their violating rows are untouched, Req 5.6) and the
      // independent steps run again.
      expect(identitiesWith(pass2, 'blocked')).toEqual(identitiesWith(pass1, 'blocked'))
      expect(identitiesWith(pass2, 'applied')).toEqual(identitiesWith(pass1, 'applied'))
      expect(identitiesWith(pass2, 'failed')).toEqual([])

      // Idempotence is proved by RE-ISSUING the same guarded statements, not by
      // skipping them: `CREATE INDEX IF NOT EXISTS` and the `DO $$ ... IF NOT
      // EXISTS (<catalog probe>)` foreign-key guard absorb the second run.
      expect(pass2.executedDdl).toEqual(pass1.executedDdl)

      // Req 6.1 — applying the plan twice yields the same fingerprint as once.
      expect(hashAfterPass2).toBe(hashAfterPass1)

      // Evidence summary. Hashes and counts only — no connection string and no
      // API key is ever printed.
      console.info(
        [
          `[12.3] canonical hash          : ${canonical.hash}`,
          `[12.3] fork hash (seeded)      : ${seededHash}`,
          `[12.3] fork hash after apply 1 : ${hashAfterPass1}`,
          `[12.3] fork hash after apply 2 : ${hashAfterPass2}`,
          `[12.3] blocked steps           : ${identitiesWith(pass1, 'blocked').join(' | ')}`,
          `[12.3] applied steps           : ${identitiesWith(pass1, 'applied').join(' | ')}`,
          `[12.3] executed DDL statements : ${pass1.executedDdl.length} per pass`,
        ].join('\n'),
      )
    },
    TEST_TIMEOUT_MS,
  )

  // ── Corroboration of the recorded orchestration finding (optional evidence).

  it(
    'corroborates the pre-check verdicts: Postgres rejects the blocked DDL and the schema is unchanged',
    async () => {
      // WHY THIS EXISTS. The gate above lives in the TEST because `runner.ts`
      // applies every step's DDL BEFORE evaluating the bound pre-checks and has
      // no per-step try/catch (recorded open finding, tasks.md Notes). This test
      // shows what that ungated orchestrator hits today: each blocked step's DDL
      // is fed to real Postgres and REJECTED. That is also live corroboration of
      // pre-check soundness — the probe said the constraint would fail, and it
      // genuinely does.
      const fork = seededFork
      expect(fork, 'seeded fork must still be available').not.toBe(null)
      if (fork === null) return

      /**
       * The rejection each blocked step must draw. Postgres reports the
       * duplicate key as `could not create unique index "..."` on the primary
       * key add (the `Key (id)=(...) is duplicated.` detail line is not part of
       * the message neon-http surfaces), and the orphan as a foreign-key
       * violation on the constraint add.
       */
      const EXPECTED_REJECTION: Readonly<Record<string, RegExp>> = {
        'foreignKey:audit_log:actor_id -> user(id):missing_on_branch':
          /foreign key|is not present in table/i,
        'primaryKey:audit_log:id:missing_on_branch': /duplicat|could not create unique index/i,
      }

      const rejections: string[] = []
      for (const step of plan) {
        const identity = stepIdentity(step)
        if (!EXPECTED_BLOCKED_IDENTITIES.has(identity)) continue

        let message: string | null = null
        try {
          await fork.exec(step.ddl)
        } catch (error) {
          message = error instanceof Error ? error.message : String(error)
        }
        expect(message, `Postgres accepted DDL a pre-check called unsafe: ${step.ddl}`).not.toBe(
          null,
        )
        if (message === null) continue

        rejections.push(`${identity} => ${message.split('\n')[0]}`)
        // The rejection is the SPECIFIC data violation the pre-check predicted.
        expect(message, `unexpected rejection for ${identity}: ${message}`).toMatch(
          EXPECTED_REJECTION[identity] as RegExp,
        )
      }

      expect(rejections.length).toBe(EXPECTED_BLOCKED_IDENTITIES.size)

      // A rejected statement rolls back: the fork's schema is exactly as the
      // gated passes left it, so no destructive residue is possible.
      expect((await fingerprintOf(fork.exec)).hash).toBe(hashAfterPass2)

      console.info(`[12.3] blocked DDL rejected by Postgres: ${rejections.join(' || ')}`)
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'leaves no orphaned throwaway branch behind',
    async () => {
      expect(await deleteFork(canonicalForkId)).toBe(null)
      canonicalForkId = null
      expect(await deleteFork(seededForkId)).toBe(null)
      seededForkId = null
      seededFork = null

      const surviving = await survivingThrowawayBranches()
      expect(surviving.map((branch) => branch.name)).toEqual([])
    },
    CLEANUP_TIMEOUT_MS,
  )
})
