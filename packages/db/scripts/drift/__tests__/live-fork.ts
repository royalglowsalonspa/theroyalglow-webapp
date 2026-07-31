/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-09-2026 & Updated - 04-09-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/__tests__/live-fork (test support)
 * Scope        : Schema Drift Remediation — disposable Neon fork harness
 *
 * Description  : Shared harness for the drift INTEGRATION suites (task 12).
 *                Forks the live `prod` Neon branch into a clearly-throwaway
 *                branch, hands back an unpooled connection + catalog reader,
 *                and guarantees the fork is deleted again. Every real branch
 *                (`prod`/`dev`/`test`/`pprd`) is strictly off-limits for writes:
 *                the harness NEVER runs DDL, seeds, or resets a real branch —
 *                it only forks `prod` and reads its catalog.
 *
 * Responsibilities :
 * - Guard the suites so they SKIP without a live DB + NEON_API_KEY (CI)
 * - Create / delete throwaway forks under the `zz-drift-verify` prefix
 * - Provide fingerprint + canonical-derivation helpers over a fork
 * - Expose the project branch list so cleanup can be PROVEN
 *
 * Features / Functionality :
 * - THROWAWAY_PREFIX + per-run hex suffix, so an orphan is identifiable
 * - forkProd()      : fork `prod`, return id + unpooled connection string
 * - deleteFork()    : idempotent delete (safe to call in a finally/afterAll)
 * - fingerprintOf() : read-only catalog read -> hash + fingerprint
 * - canonicalOnFork(): empty the fork's `public` schema, materialize the
 *                      Drizzle CODE into it, and fingerprint the result
 *                      (Req 1.1/1.2 — canonical comes from code, not a branch)
 *
 * Tech Stack   : TypeScript (strict), Vitest, Neon serverless + Management API
 * Layer        : Data Access (Test support)
 *
 * Dependencies : ../../../src/test/live-db, ../canonical, ../catalog-queries,
 *                ../fingerprint, ../neon-admin
 *
 * Notes        : The Neon API key is read from `packages/db/.env` via
 *                `loadDbEnv()` and is never logged or written anywhere. Neon
 *                control-plane operations are polled and slow, so the suites
 *                using this harness set generous per-test timeouts.
 ************************************************************/

import { randomBytes } from 'node:crypto'
import { isNeonAdminAvailable, loadDbEnv } from '../../../src/test/live-db'
import { type CanonicalFingerprint, deriveCanonicalFingerprint, readCatalog } from '../canonical'
import { createCatalogReader, neonExecutor, type SqlExecutor } from '../catalog-queries'
import { Fingerprinter } from '../fingerprint'
import { type BranchSummary, createNeonAdmin, type NeonAdmin } from '../neon-admin'
import type { BranchId, SchemaFingerprint } from '../types'

/**
 * `prod` branch of the Neon project `theroyalglow-db` (divine-heart-60915941).
 * Only ever used as a FORK PARENT and as a read-only catalog source.
 */
export const PROD_BRANCH_ID: BranchId = 'br-bold-cake-aotql242'

/**
 * Prefix every fork created by these suites carries. Deliberately obvious and
 * sorted last, so an orphaned branch is trivially identifiable and can be
 * deleted by hand.
 */
export const THROWAWAY_PREFIX = 'zz-drift-verify'

/** Per-run suffix so two concurrent local runs cannot collide on a fork name. */
export const RUN_ID = randomBytes(4).toString('hex')

/** Build a throwaway fork name: `zz-drift-verify-<run>-<role>`. */
export function forkName(role: string): string {
  return `${THROWAWAY_PREFIX}-${RUN_ID}-${role}`
}

/** Guard for `describe.skipIf(...)`: needs BOTH a live DB URL and an API key. */
export function isDriftForkAvailable(): boolean {
  return isNeonAdminAvailable()
}

/** A live, disposable fork of `prod`. */
export type Fork = {
  branchId: BranchId
  /** Unpooled (direct) connection string — required for DDL. */
  connectionString: string
  /** Raw SQL executor bound to the fork. */
  exec: SqlExecutor
}

/** Lazily-created admin client (constructed only when the guard passes). */
let admin: NeonAdmin | null = null

export function neonAdmin(): NeonAdmin {
  loadDbEnv()
  if (admin === null) {
    admin = createNeonAdmin()
  }
  return admin
}

/**
 * Fork `prod` into a throwaway branch and resolve its unpooled connection.
 *
 * The caller MUST delete it again via {@link deleteFork} in a `finally` /
 * `afterAll` that runs even when the test fails.
 */
export async function forkProd(role: string): Promise<Fork> {
  const api = neonAdmin()
  const branchId = await api.forkBranch(PROD_BRANCH_ID, forkName(role))
  const connectionString = await api.connectionString(branchId)
  return { branchId, connectionString, exec: neonExecutor(connectionString) }
}

/** Delete a fork. Never throws — cleanup must not mask a test failure. */
export async function deleteFork(branchId: BranchId | null): Promise<string | null> {
  if (branchId === null) {
    return null
  }
  try {
    await neonAdmin().deleteBranch(branchId)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** Read-only catalog read + fingerprint of whatever the executor points at. */
export async function fingerprintOf(
  exec: SqlExecutor,
): Promise<{ hash: string; fingerprint: SchemaFingerprint }> {
  const rows = await readCatalog(createCatalogReader(exec))
  const fingerprint = Fingerprinter.build(rows)
  return { fingerprint, hash: Fingerprinter.hash(fingerprint) }
}

/**
 * Derive the Canonical_Fingerprint on a throwaway fork (Req 1.1, 1.2).
 *
 * The fork's `public` schema is dropped and recreated EMPTY, then the Drizzle
 * schema code in `packages/db/src/schema` is materialized into it and the
 * resulting catalog is fingerprinted. Canonical therefore comes from the CODE,
 * never from a live branch. Destructive only on the disposable fork.
 */
export async function canonicalOnFork(fork: Fork): Promise<CanonicalFingerprint> {
  await emptyPublicSchema(fork.exec)
  return deriveCanonicalFingerprint({ targetUrl: fork.connectionString, exec: fork.exec })
}

/** Drop + recreate the fork's `public` schema so it is empty. Forks only. */
export async function emptyPublicSchema(exec: SqlExecutor): Promise<void> {
  await exec('DROP SCHEMA IF EXISTS public CASCADE;')
  await exec('CREATE SCHEMA public;')
}

/** List the project's branches (id + name) so cleanup can be proven. */
export async function listBranches(): Promise<BranchSummary[]> {
  return neonAdmin().listBranches()
}

/** Branches whose name still carries the throwaway prefix (should be none). */
export async function survivingThrowawayBranches(): Promise<BranchSummary[]> {
  const branches = await listBranches()
  return branches.filter((branch) => branch.name.startsWith(THROWAWAY_PREFIX))
}
