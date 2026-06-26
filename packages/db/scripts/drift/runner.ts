/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/runner
 * Scope        : Schema Drift Remediation — phase orchestration (I/O)
 *
 * Description  : The only stateful/effectful component of the drift tooling.
 *                Orchestrates the pipeline phases — audit, fork-verify, and
 *                rollout — over the injected adapters. This file implements
 *                `audit` (10.1), `verifyOnFork` (10.2), and `rollout` (10.3).
 *
 * Responsibilities :
 * - audit        : read-only fingerprint of each branch
 * - verifyOnFork : prove the reconcile plan on a disposable fork of `prod`
 * - rollout      : forward-migrate / reset branches to canonical (task 10.3)
 *
 * Features / Functionality :
 * - The `NeonAdmin` adapter and the `CatalogReader` factory are INJECTED via
 *   constructor options, so the runner is fully testable without live Neon.
 *   Defaults wire the real `createNeonAdmin()` and `createNeonCatalogReader`.
 * - Audit is strictly READ-ONLY: it only resolves a connection string, opens a
 *   reader, and issues the catalog `SELECT`s — every branch is left unchanged.
 * - Archived branches (e.g. `test` / `pprd`) are reactivated before reading;
 *   when reactivation fails the failure is recorded and the remaining branches
 *   continue to be audited (the pipeline is never blocked by one branch).
 *
 * Tech Stack   : TypeScript (strict), Neon serverless
 * Layer        : Data Access (orchestration / control plane)
 *
 * Dependencies : ./types, ./fingerprint, ./canonical (readCatalog),
 *                ./catalog-queries, ./diff, ./precheck, ./neon-admin
 *
 * Notes        : Audit issues only `SELECT` statements (Req 2.2, 14.1). DDL is
 *                never executed against a real branch — fork-verify applies the
 *                plan only to a disposable fork, which is always deleted.
 *
 * _Requirements: 2.2, 7.1, 7.2, 7.3, 7.4, 11.1, 11.2, 14.1, 14.3_
 ************************************************************/

import { type CanonicalFingerprint, readCatalog } from './canonical'
import {
  type CatalogReader,
  type SqlExecutor,
  createNeonCatalogReader,
  neonExecutor,
} from './catalog-queries'
import { SchemaDiffer } from './diff'
import { Fingerprinter } from './fingerprint'
import { type NeonAdmin, createNeonAdmin } from './neon-admin'
import { PreChecker, type ProbeReader } from './precheck'
import type {
  BranchId,
  PreCheckResult,
  ReconcileStep,
  SchemaDiff,
  SchemaFingerprint,
} from './types'

// ─────────────────────────────────────────────────────────
// Audit result model.
// ─────────────────────────────────────────────────────────

/** A successfully fingerprinted branch. */
export type BranchFingerprint = {
  branchId: BranchId
  hash: string
  fingerprint: SchemaFingerprint
}

/** A branch that could not be audited (reactivation or read failure). */
export type BranchAuditFailure = {
  branchId: BranchId
  error: string
}

/** Per-branch audit outcome: either a fingerprint or a recorded failure. */
export type BranchAuditResult = BranchFingerprint | BranchAuditFailure

/** Aggregate read-only audit report across all requested branches. */
export type AuditReport = {
  /** One entry per requested branch, in request order. */
  branches: BranchAuditResult[]
  /** The subset of entries that failed, for quick reporting. */
  failures: BranchAuditFailure[]
}

/** Narrow a {@link BranchAuditResult} to the failure variant. */
export function isAuditFailure(result: BranchAuditResult): result is BranchAuditFailure {
  return 'error' in result
}

// ─────────────────────────────────────────────────────────
// Fork-verify / rollout result models.
//
// `VerifyReport` is the concrete fork-verify outcome (task 10.2);
// `RolloutReport` is the concrete convergence outcome (task 10.3).
// ─────────────────────────────────────────────────────────

/**
 * Outcome of proving the reconcile plan on a disposable fork of `prod`.
 *
 * Verification SUCCEEDS (`converged === true`) only when the fork's
 * post-apply fingerprint hash equals the Canonical_Fingerprint hash AND every
 * Data_Pre_Check passed (Req 7.3). On non-convergence the report carries the
 * residual `diff` and the failing `preCheckResults` so the Conformance_Report
 * can be regenerated and the plan refined (Req 7.4 / Error Handling Scenario 3).
 */
export type VerifyReport = {
  /** Id of the disposable Verify_Branch (already deleted by the time this returns). */
  verifyBranchId: BranchId | null
  /** True iff fork fingerprint === canonical AND all pre-checks passed. */
  converged: boolean
  /** Canonical_Fingerprint hash the fork was verified against. */
  canonicalHash: string
  /** Fork fingerprint hash after applying the plan, or `null` if unreadable. */
  forkHash: string | null
  /** Result of every Data_Pre_Check evaluated on the fork (Req 7.2). */
  preCheckResults: PreCheckResult[]
  /** Residual structural diff (canonical vs fork) when not converged. */
  diff?: SchemaDiff
}

/**
 * Convergence strategy applied to a single branch during rollout.
 *
 *  - `forward_migrate` — apply the verified additive DDL in place, preserving
 *    the branch's live data (`prod`, `dev`); the branch is NEVER reset.
 *  - `reset_from_parent` — discard the branch's data and reset it to its parent
 *    (`prod`) head, making it byte-identical to canonical (`test`, `pprd`).
 */
export type RolloutStrategy = 'forward_migrate' | 'reset_from_parent'

/**
 * Post-rollout outcome for one branch (Req 8.5, 8.6).
 *
 * `matchesCanonical` is the convergence verdict for this branch:
 * `fingerprintHash === canonical.hash`. A `null` `fingerprintHash` means the
 * branch could not be re-fingerprinted after rollout (its error is recorded in
 * {@link RolloutReport.errors}); such a branch never matches canonical.
 */
export type BranchRolloutOutcome = {
  branchId: BranchId
  strategy: RolloutStrategy
  /** Branch fingerprint hash after rollout, or `null` when it could not be read. */
  fingerprintHash: string | null
  /** True iff `fingerprintHash === canonical.hash`. */
  matchesCanonical: boolean
}

/**
 * Outcome of converging the real branches to canonical (task 10.3).
 *
 * `converged` is the overall verdict — true iff EVERY processed branch's
 * fingerprint equals the Canonical_Fingerprint (Req 8.5); `diverged` lists the
 * branches that fell short (Req 8.6). `restorePoints` maps each branch to the
 * retained pre-change snapshot branch captured before any DDL (Req 10.1), which
 * supports manual restore on an unrecoverable failure (Req 10.4). `errors`
 * records every per-branch failure so a partial rollout never throws mid-way
 * and can be safely re-run (idempotent, Req 10.3).
 */
export type RolloutReport = {
  /** Canonical_Fingerprint hash every branch must converge to. */
  canonicalHash: string
  /** Per-branch convergence outcome, in processing order. */
  branches: BranchRolloutOutcome[]
  /** True iff every branch fingerprint equals canonical. */
  converged: boolean
  /** Branches whose fingerprint does not equal canonical (Req 8.6). */
  diverged: BranchId[]
  /** Retained pre-change Restore_Point snapshot branch id, per branch (Req 10.1). */
  restorePoints: Record<BranchId, string>
  /** Per-branch failures captured during rollout (never thrown mid-way). */
  errors: Array<{ branchId: BranchId; error: string }>
}

// ─────────────────────────────────────────────────────────
// DriftRunner — the orchestration surface.
// ─────────────────────────────────────────────────────────

export interface DriftRunner {
  /** Read-only fingerprint of each branch (reactivating archived ones first). */
  audit(branches: BranchId[]): Promise<AuditReport>
  /** Prove the reconcile plan on a disposable fork before any real branch. */
  verifyOnFork(plan: ReconcileStep[], canonical: CanonicalFingerprint): Promise<VerifyReport>
  /** Apply the verified plan / reset branches to converge on canonical. */
  rollout(
    plan: ReconcileStep[],
    branches: BranchId[],
    canonical: CanonicalFingerprint,
  ): Promise<RolloutReport>
}

/** Factory that opens a read-only {@link CatalogReader} over a connection string. */
export type ReaderFactory = (connectionString: string) => CatalogReader

/** Factory that builds a raw {@link SqlExecutor} (DDL + probes) over a connection string. */
export type ExecutorFactory = (connectionString: string) => SqlExecutor

/** Default `prod` branch id (theroyalglow-db). Overridable via {@link DriftRunnerOptions}. */
const DEFAULT_PROD_BRANCH_ID = 'br-bold-cake-aotql242'

/** Default `dev` branch id. Forward-migrated (live data preserved). */
const DEFAULT_DEV_BRANCH_ID = 'br-rapid-block-aoh6m3q0'

/** Default `test` branch id. Reset from parent (disposable QA data). */
const DEFAULT_TEST_BRANCH_ID = 'br-floral-waterfall-aoag027c'

/** Default `pprd` branch id. Reset from parent (pre-prod mirror). */
const DEFAULT_PPRD_BRANCH_ID = 'br-super-king-aoqdtfor'

/**
 * Default per-branch rollout strategy (design "Rollout decision model").
 *
 *  - `prod` / `dev` → `forward_migrate` (apply verified DDL, preserve data).
 *  - `test` / `pprd` → `reset_from_parent` (discard data, reset off canonical prod).
 *
 * A branch absent from this map resolves to `forward_migrate` — the
 * non-destructive default, so an unknown branch is never reset by accident.
 */
const DEFAULT_BRANCH_STRATEGIES: Readonly<Record<BranchId, RolloutStrategy>> = {
  [DEFAULT_PROD_BRANCH_ID]: 'forward_migrate',
  [DEFAULT_DEV_BRANCH_ID]: 'forward_migrate',
  [DEFAULT_TEST_BRANCH_ID]: 'reset_from_parent',
  [DEFAULT_PPRD_BRANCH_ID]: 'reset_from_parent',
}

/** Injectable collaborators for {@link DriftRunnerImpl}. */
export type DriftRunnerOptions = {
  /** Neon control-plane adapter. Defaults to {@link createNeonAdmin}. */
  neonAdmin?: NeonAdmin
  /**
   * Builds a read-only catalog reader from a connection string.
   * Defaults to {@link createNeonCatalogReader}.
   */
  readerFactory?: ReaderFactory
  /**
   * Builds a raw SQL executor from a connection string, used by `verifyOnFork`
   * to apply DDL and run read-only data pre-check probes over the fork.
   * Defaults to {@link neonExecutor}.
   */
  executorFactory?: ExecutorFactory
  /**
   * Decide whether a branch should be reactivated before reading. Reactivation
   * is idempotent and safe (it only adds a compute endpoint when one is
   * absent), so the default reactivates every branch — guaranteeing archived
   * `test` / `pprd` branches are live before fingerprinting without needing to
   * know branch names up front.
   */
  shouldReactivate?: (branchId: BranchId) => boolean
  /** `prod` branch id forked for verification. Defaults to {@link DEFAULT_PROD_BRANCH_ID}. */
  prodBranchId?: BranchId
  /** Generate a unique disposable Verify_Branch name. Defaults to `drift-verify-<timestamp>`. */
  forkName?: () => string
  /**
   * Per-branch rollout strategy. Each branch passed to `rollout` is classified
   * by this map: `forward_migrate` branches receive the verified DDL in place
   * (data preserved); `reset_from_parent` branches are reset off canonical
   * `prod`. Defaults to {@link DEFAULT_BRANCH_STRATEGIES} (prod/dev →
   * forward_migrate, test/pprd → reset_from_parent). A branch absent from the
   * resolved map falls back to `forward_migrate` — the non-destructive default,
   * so an unrecognised branch is never reset by accident.
   */
  branchStrategies?: Record<BranchId, RolloutStrategy>
  /**
   * Capture a Restore_Point for a real branch BEFORE any DDL (Req 10.1) and
   * return the retained snapshot's identifier. The default forks the branch
   * into a retained pre-change branch (`drift-restorepoint-<branch>-<ts>`) via
   * {@link NeonAdmin.forkBranch}; this snapshot is intentionally NOT deleted, so
   * it remains available for a manual Neon point-in-time restore should a
   * failure prove unrecoverable by idempotent re-run (Req 10.4). No destructive
   * in-place undo DDL is ever authored (Req 10.2, 14.2).
   */
  captureRestorePoint?: (branchId: BranchId) => Promise<string>
}

/**
 * Concrete orchestration of the drift remediation phases.
 *
 * Construct via {@link createDriftRunner} to wire the real Neon adapters, or
 * pass fakes through {@link DriftRunnerOptions} for testing without live Neon.
 */
export class DriftRunnerImpl implements DriftRunner {
  private readonly neonAdmin: NeonAdmin
  private readonly readerFactory: ReaderFactory
  private readonly executorFactory: ExecutorFactory
  private readonly shouldReactivate: (branchId: BranchId) => boolean
  private readonly prodBranchId: BranchId
  private readonly forkName: () => string
  private readonly branchStrategies: Record<BranchId, RolloutStrategy>
  private readonly captureRestorePoint: (branchId: BranchId) => Promise<string>

  constructor(options: DriftRunnerOptions = {}) {
    this.neonAdmin = options.neonAdmin ?? createNeonAdmin()
    this.readerFactory = options.readerFactory ?? createNeonCatalogReader
    this.executorFactory = options.executorFactory ?? neonExecutor
    this.shouldReactivate = options.shouldReactivate ?? (() => true)
    this.prodBranchId = options.prodBranchId ?? DEFAULT_PROD_BRANCH_ID
    this.forkName = options.forkName ?? (() => `drift-verify-${Date.now()}`)
    this.branchStrategies = options.branchStrategies ?? { ...DEFAULT_BRANCH_STRATEGIES }
    this.captureRestorePoint =
      options.captureRestorePoint ??
      ((branchId) =>
        this.neonAdmin.forkBranch(branchId, `drift-restorepoint-${branchId}-${Date.now()}`))
  }

  /**
   * Read-only audit of each branch (design phase 2 / Property 8).
   *
   * For every branch, in request order:
   *   1. Reactivate it first (archived `test` / `pprd` need a live compute).
   *      If reactivation fails, record the failure and CONTINUE — the other
   *      branches are still audited (Req 11.1, 11.2).
   *   2. Resolve an unpooled read-only connection string, open a
   *      `CatalogReader`, read every catalog class, and fingerprint it.
   *
   * Only `SELECT` statements are issued; every audited branch is left unchanged
   * (Req 2.2, 14.1). Read failures are captured per-branch rather than thrown,
   * so one unreadable branch never aborts the whole audit.
   */
  async audit(branches: BranchId[]): Promise<AuditReport> {
    const results: BranchAuditResult[] = []
    const failures: BranchAuditFailure[] = []

    const record = (failure: BranchAuditFailure): void => {
      failures.push(failure)
      results.push(failure)
    }

    for (const branchId of branches) {
      // 1. Reactivate archived branches before reading (Req 11.1).
      if (this.shouldReactivate(branchId)) {
        try {
          await this.neonAdmin.reactivate(branchId)
        } catch (error) {
          // Reactivation failed — record and continue with the others (Req 11.2).
          record({ branchId, error: errorMessage(error) })
          continue
        }
      }

      // 2. Read-only fingerprint of the branch.
      try {
        const connectionString = await this.neonAdmin.connectionString(branchId)
        const reader = this.readerFactory(connectionString)
        const rows = await readCatalog(reader)
        const fingerprint = Fingerprinter.build(rows)
        const hash = Fingerprinter.hash(fingerprint)
        results.push({ branchId, fingerprint, hash })
      } catch (error) {
        record({ branchId, error: errorMessage(error) })
      }
    }

    return { branches: results, failures }
  }

  // ───────────────────────────────────────────────────────
  // Fork-verify (design phase 5 / Requirement 7).
  // ───────────────────────────────────────────────────────

  /**
   * Prove the entire reconcile plan on a disposable fork of `prod` before any
   * real branch is touched (Req 7.1–7.4 / Error Handling Scenario 3).
   *
   *   1. Fork `prod` into a disposable Verify_Branch and resolve its UNPOOLED
   *      (direct) connection string for DDL.
   *   2. Apply the ENTIRE plan in `order`. Steps whose DDL is fully
   *      operator-confirm-commented are inert and skipped (neon-http has no
   *      interactive transactions, so statements run independently and ordered).
   *   3. Run ALL bound Data_Pre_Checks against the fork via a read-only probe.
   *   4. Re-fingerprint the fork and compare its hash to canonical.
   *   5. `converged` iff fork hash === canonical hash AND every pre-check passed.
   *
   * The disposable fork is ALWAYS deleted (success or failure) so real branches
   * are left untouched (Req 7.4). On non-convergence the residual diff and the
   * failing pre-check results are returned for the Conformance_Report; the
   * caller aborts rollout.
   */
  async verifyOnFork(
    plan: ReconcileStep[],
    canonical: CanonicalFingerprint,
  ): Promise<VerifyReport> {
    // 1. Fork prod into a disposable Verify_Branch (Req 7.1).
    const verifyBranchId = await this.neonAdmin.forkBranch(this.prodBranchId, this.forkName())

    try {
      const connectionString = await this.neonAdmin.connectionString(verifyBranchId)
      const exec = this.executorFactory(connectionString)

      // 2. Apply the entire plan in order; skip inert (commented) steps.
      const ordered = [...plan].sort((a, b) => a.order - b.order)
      for (const step of ordered) {
        if (isInertDdl(step.ddl)) continue
        await exec(step.ddl)
      }

      // 3. Run all bound data pre-checks on the fork via a read-only probe (Req 7.2).
      const probeReader: ProbeReader = { query: (sql) => exec(sql) }
      const preCheckResults: PreCheckResult[] = []
      for (const step of ordered) {
        if (step.preCheck === null) continue
        preCheckResults.push(await PreChecker.evaluate(step.preCheck, probeReader))
      }
      const allPreChecksPassed = preCheckResults.every((result) => result.passed)

      // 4. Re-fingerprint the fork and compare to canonical.
      const reader = this.readerFactory(connectionString)
      const rows = await readCatalog(reader)
      const forkFingerprint = Fingerprinter.build(rows)
      const forkHash = Fingerprinter.hash(forkFingerprint)

      // 5. Converged iff fork === canonical AND all pre-checks pass (Req 7.3).
      const converged = forkHash === canonical.hash && allPreChecksPassed

      const report: VerifyReport = {
        verifyBranchId,
        converged,
        canonicalHash: canonical.hash,
        forkHash,
        preCheckResults,
      }
      // Attach the residual diff for the Conformance_Report when not identical.
      if (forkHash !== canonical.hash) {
        report.diff = SchemaDiffer.diff(canonical.fingerprint, forkFingerprint)
      }
      return report
    } finally {
      // Always dispose the fork — real branches are never touched (Req 7.4).
      await this.neonAdmin.deleteBranch(verifyBranchId)
    }
  }

  // ───────────────────────────────────────────────────────
  // Rollout (design phase 6 / Requirements 8, 9, 10).
  // ───────────────────────────────────────────────────────

  /**
   * Converge every real branch on the Canonical_Fingerprint (Req 8.5 / 8.6).
   *
   * Each branch is classified by {@link DriftRunnerOptions.branchStrategies}
   * (default {@link DEFAULT_BRANCH_STRATEGIES}); an unknown branch resolves to
   * the non-destructive `forward_migrate` default so it is never reset by
   * accident. The pipeline runs in strict, documented phases:
   *
   *   1. **Restore points (Req 10.1)** — before ANY DDL, capture a retained
   *      pre-change snapshot for every branch. A branch whose capture fails is
   *      recorded and SKIPPED (we never apply DDL without a rollback path); the
   *      remaining branches continue. The snapshot supports a manual restore if
   *      a failure proves unrecoverable by re-run (Req 10.4). No destructive
   *      in-place undo DDL is authored (Req 10.2, 14.2).
   *   2. **Forward-migrate first (Req 8.1, 8.2)** — apply the verified DDL in
   *      `step.order` over each `forward_migrate` branch's UNPOOLED connection,
   *      `prod` FIRST. Inert (operator-confirm-commented) steps are skipped.
   *      These branches are NEVER reset, so their live data is preserved, and
   *      the guarded DDL is safe to re-run (idempotent, Req 10.3).
   *   3. **Reset from parent AFTER prod is canonical (Req 8.3, 8.4)** — reset
   *      each `reset_from_parent` branch (`test`/`pprd`) off `prod`'s now-canonical
   *      head, reactivating it first if archived. This DISCARDS their data — a
   *      ratified tradeoff (Req 9.1) — and is only sound once prod is canonical.
   *   4. **Re-fingerprint (Req 8.5, 8.6)** — re-read every branch and compare to
   *      canonical; record each `BranchRolloutOutcome` plus the overall
   *      `converged` flag and the `diverged` list.
   *
   * Failures are captured per-branch in `errors` rather than thrown mid-way, so
   * a partial rollout can be resumed by a safe idempotent re-run (Req 10.3).
   * `prod` and `dev` are never reset (Req 8.2 / 9.2); `prod` is never the source
   * of canonical (canonical comes from the Drizzle code).
   */
  async rollout(
    plan: ReconcileStep[],
    branches: BranchId[],
    canonical: CanonicalFingerprint,
  ): Promise<RolloutReport> {
    const restorePoints: Record<BranchId, string> = {}
    const errors: Array<{ branchId: BranchId; error: string }> = []

    const strategyOf = (branchId: BranchId): RolloutStrategy =>
      this.branchStrategies[branchId] ?? 'forward_migrate'

    // Process forward_migrate branches first (prod ahead of the rest), then
    // reset_from_parent branches — so test/pprd reset off a canonical prod.
    const forwardBranches = branches
      .filter((branchId) => strategyOf(branchId) === 'forward_migrate')
      .sort((a, b) => prodRank(a, this.prodBranchId) - prodRank(b, this.prodBranchId))
    const resetBranches = branches.filter(
      (branchId) => strategyOf(branchId) === 'reset_from_parent',
    )
    const orderedBranches = [...forwardBranches, ...resetBranches]

    const ddlSteps = [...plan].sort((a, b) => a.order - b.order)

    // ── Phase 1: capture a Restore_Point per branch BEFORE any DDL (Req 10.1).
    for (const branchId of orderedBranches) {
      try {
        restorePoints[branchId] = await this.captureRestorePoint(branchId)
      } catch (error) {
        // Without a restore point we will not apply DDL to this branch; record
        // and continue — the other branches are still processed (Req 10.3).
        errors.push({ branchId, error: errorMessage(error) })
      }
    }

    // ── Phase 2: forward-migrate prod/dev with the verified DDL (Req 8.1, 8.2).
    for (const branchId of forwardBranches) {
      if (!(branchId in restorePoints)) continue // restore-point capture failed.
      try {
        const connectionString = await this.neonAdmin.connectionString(branchId)
        const exec = this.executorFactory(connectionString)
        for (const step of ddlSteps) {
          if (isInertDdl(step.ddl)) continue
          await exec(step.ddl)
        }
      } catch (error) {
        errors.push({ branchId, error: errorMessage(error) })
      }
    }

    // ── Phase 3: reset test/pprd off the now-canonical prod (Req 8.3, 8.4, 9.1).
    for (const branchId of resetBranches) {
      if (!(branchId in restorePoints)) continue // restore-point capture failed.
      try {
        if (this.shouldReactivate(branchId)) {
          await this.neonAdmin.reactivate(branchId) // un-archive before reset (Req 8.4).
        }
        await this.neonAdmin.resetFromParent(branchId)
      } catch (error) {
        errors.push({ branchId, error: errorMessage(error) })
      }
    }

    // ── Phase 4: re-fingerprint every branch and compare to canonical (Req 8.5).
    const outcomes: BranchRolloutOutcome[] = []
    for (const branchId of orderedBranches) {
      const strategy = strategyOf(branchId)
      try {
        if (this.shouldReactivate(branchId)) {
          await this.neonAdmin.reactivate(branchId)
        }
        const connectionString = await this.neonAdmin.connectionString(branchId)
        const reader = this.readerFactory(connectionString)
        const rows = await readCatalog(reader)
        const fingerprintHash = Fingerprinter.hash(Fingerprinter.build(rows))
        outcomes.push({
          branchId,
          strategy,
          fingerprintHash,
          matchesCanonical: fingerprintHash === canonical.hash,
        })
      } catch (error) {
        errors.push({ branchId, error: errorMessage(error) })
        outcomes.push({ branchId, strategy, fingerprintHash: null, matchesCanonical: false })
      }
    }

    const diverged = outcomes.filter((o) => !o.matchesCanonical).map((o) => o.branchId)

    return {
      canonicalHash: canonical.hash,
      branches: outcomes,
      converged: diverged.length === 0,
      diverged,
      restorePoints,
      errors,
    }
  }
}

/** Construct a {@link DriftRunner}, defaulting to the real Neon adapters. */
export function createDriftRunner(options: DriftRunnerOptions = {}): DriftRunner {
  return new DriftRunnerImpl(options)
}

// ─────────────────────────────────────────────────────────
// Internals.
// ─────────────────────────────────────────────────────────

/** Extract a human-readable message from an unknown thrown value. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Sort key putting `prod` ahead of the other forward-migrate branches: prod
 * must reach canonical first so the later `reset_from_parent` branches reset off
 * a canonical prod. Returns `0` for prod and `1` for everything else (a stable
 * sort preserves the relative order of the remaining branches).
 */
function prodRank(branchId: BranchId, prodBranchId: BranchId): number {
  return branchId === prodBranchId ? 0 : 1
}

/**
 * True when a step's DDL is inert — empty or composed solely of `--` comment
 * lines (the operator-confirm-flagged, never-auto-applied statements emitted by
 * `reconcile`). Such steps carry no executable SQL, so the fork-apply loop
 * skips them.
 */
function isInertDdl(ddl: string): boolean {
  const executable = ddl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('--'))
  return executable.length === 0
}
