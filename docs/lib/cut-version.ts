/**
 * Pure registry transform for cutting a new legacy documentation version
 * (task 4.9; Requirements 10.3, 10.6).
 *
 * `cutVersion` is the decision core of the Version_Workflow (the side-effecting
 * file copy + config edits live in `scripts/cut-version.mjs`, task 10.1). Given
 * the current version registry and an integer `N`, it returns a **new** registry
 * with `v{N}` added (additive — every existing version is preserved unchanged),
 * or throws a {@link VersionCutConflictError} identifying `/v{N}` when `N` is
 * already registered, **without mutating** the input. It backs:
 *   - Property 16 — cutting a version is additive and preserves existing versions
 *   - Property 17 — cutting an existing version is rejected without side effects
 *
 * ## Purity / no I/O
 *
 * No filesystem, config, or loader work happens here; the script performs those
 * effects only after this function confirms the cut is conflict-free. That keeps
 * the conflict rule and the resulting registry shape directly unit/PBT testable.
 */

import { getSwitcherOrder, type VersionId, type VersionMeta } from './versions'

/**
 * Thrown by {@link cutVersion} when the requested version already exists. Carries
 * the conflicting version number and prefix so the script can print a precise,
 * actionable message and halt without writing anything (Req 10.6).
 */
export class VersionCutConflictError extends Error {
  /** The integer version number that was already registered. */
  readonly versionNumber: number
  /** The conflicting URL prefix, e.g. `'/docs/v2'`. */
  readonly prefix: string

  constructor(versionNumber: number) {
    const prefix = `/docs/v${versionNumber}`
    super(`Cannot cut version v${versionNumber}: ${prefix} already exists in the registry`)
    this.name = 'VersionCutConflictError'
    this.versionNumber = versionNumber
    this.prefix = prefix
  }
}

/**
 * Cut a new legacy version into the registry (pure; Properties 16, 17;
 * Req 10.3, 10.6).
 *
 * - When `n` is **not** already registered → returns a new registry containing
 *   every input version unchanged plus a new `v{n}` entry, ordered
 *   most-recent-first (Latest first, then legacy by descending number). The input
 *   array and its entries are never mutated (Req 10.3).
 * - When `n` **is** already registered → throws {@link VersionCutConflictError};
 *   the input is untouched (Req 10.6).
 *
 * @param registry the current ordered version registry.
 * @param n the positive integer version number to cut (no leading-zero concerns
 * — it is an integer, not a string).
 * @throws {RangeError} if `n` is not a positive integer.
 * @throws {VersionCutConflictError} if `v{n}` is already registered.
 */
export function cutVersion(registry: readonly VersionMeta[], n: number): VersionMeta[] {
  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError(`Version number must be a positive integer, received: ${n}`)
  }

  const exists = registry.some((version) => version.versionNumber === n)
  if (exists) {
    throw new VersionCutConflictError(n)
  }

  const id: VersionId = `v${n}`
  const newVersion: VersionMeta = {
    id,
    label: id,
    versionNumber: n,
    basePath: `/docs/v${n}`,
    isLatest: false,
  }

  // Return a new, most-recent-first registry; getSwitcherOrder copies + sorts,
  // so neither the input array nor its entries are mutated.
  return getSwitcherOrder([...registry, newVersion])
}
