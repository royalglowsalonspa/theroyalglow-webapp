/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : seed-validation (scripts/lib)
 * Scope        : CMS Operations Script — Seed Pre-flight Guards
 *
 * Description  : The PURE guard logic behind `scripts/seed-services.ts`,
 *                extracted so it can be asserted without a database, a Payload
 *                instance, or a network connection. Behaviour is unchanged —
 *                the script imports these functions instead of declaring them
 *                inline.
 *
 * Responsibilities :
 * - Refuse to seed while the Payload → Drizzle sync is ENABLED
 * - Collect every reason a live `public.*` row cannot be represented in the CMS
 * - Fail loudly, listing all offenders at once rather than one per run
 *
 * Features / Functionality :
 * - assertSyncDisabled(): throws unless SERVICE_SYNC_ENABLED === 'false'
 * - collectSeedProblems(categories, services): string[] (empty = seedable)
 * - assertSeedable(categories, services): throws with every problem listed
 *
 * Tech Stack   : TypeScript
 * Layer        : CMS (Scripts — pure validation)
 *
 * Dependencies : @rgss/db/schema (row types only), @rgss/types,
 *                ../../src/lib/sync-db (feature-flag read)
 *
 * Notes        :
 * - Zero I/O by design. `isSyncEnabled()` reads `process.env` and nothing else,
 *   so this module stays fully deterministic under test.
 * - Every problem is COLLECTED rather than thrown on first sight: a
 *   half-migrated catalogue is far more work to unpick than one
 *   fix-then-rerun cycle.
 ************************************************************/
import type { service, serviceCategory } from '@rgss/db/schema'
import { SERVICE_DURATION_MINUTES } from '@rgss/types'
import { isSyncEnabled } from '../../src/lib/sync-db'

/** A live `public.service_category` row, as read by the seed script. */
export type DrizzleCategoryRow = typeof serviceCategory.$inferSelect
/** A live `public.service` row, as read by the seed script. */
export type DrizzleServiceRow = typeof service.$inferSelect

/**
 * The `durationMinutes` values Payload's `select` field accepts — derived from
 * the shared constant, never restated, so this can never drift from the
 * collection options or the Drizzle data.
 */
export type DurationOption = `${(typeof SERVICE_DURATION_MINUTES)[number]}`

const ALLOWED_DURATIONS: ReadonlySet<number> = new Set(SERVICE_DURATION_MINUTES)

/**
 * Refuse to run while the sync hooks are live.
 *
 * The seed reads rows FROM `public.service` and then calls `payload.create()`,
 * which fires `syncServiceToPublic` and re-writes `public.service` using the
 * SAME id it was just read from. The hook's `onConflictDoUpdate` would absorb
 * that, but relying on it is not the intended procedure — the flag is.
 */
export function assertSyncDisabled(): void {
  if (!isSyncEnabled()) {
    return
  }

  throw new Error(
    [
      'Refusing to seed with the service sync ENABLED.',
      '',
      'This script reads rows FROM public.service and then calls payload.create(),',
      'which fires syncServiceToPublic and re-writes public.service with the same id.',
      '',
      'Re-run with the flag off:',
      "  PowerShell : $env:SERVICE_SYNC_ENABLED='false'",
      '  bash       : SERVICE_SYNC_ENABLED=false \\',
      '  then       : bun run --env-file=.env.local scripts/seed-services.ts',
    ].join('\n'),
  )
}

/**
 * Every reason the live catalogue cannot be represented in the CMS.
 *
 * Returns an EMPTY array when the data is seedable. Pure — no I/O, no clock,
 * no ordering dependency on the caller.
 */
export function collectSeedProblems(
  categories: readonly DrizzleCategoryRow[],
  services: readonly DrizzleServiceRow[],
): string[] {
  const problems: string[] = []
  const categoryIds = new Set(categories.map((cat) => cat.id))

  for (const svc of services) {
    // Durations outside SERVICE_DURATION_MINUTES cannot be represented by the
    // Payload `select` field. Coercing them silently would either corrupt the
    // booking duration or fail opaquely mid-seed, so they are surfaced here.
    if (!ALLOWED_DURATIONS.has(svc.durationMinutes)) {
      problems.push(
        `service ${svc.id} (${svc.slug}): durationMinutes=${svc.durationMinutes} is not in SERVICE_DURATION_MINUTES [${SERVICE_DURATION_MINUTES.join(', ')}]`,
      )
    }

    // Mirrors the collection's `validateGems` beforeValidate hook, which would
    // otherwise reject this row part-way through the run.
    if (svc.gemsRedeemable && !(typeof svc.gemsRequired === 'number' && svc.gemsRequired > 0)) {
      problems.push(
        `service ${svc.id} (${svc.slug}): gemsRedeemable is true but gemsRequired=${svc.gemsRequired}`,
      )
    }

    // The Payload relationship field resolves against `cms.service_category`,
    // which this script populates from `public.service_category` — so an
    // orphaned FK in `public` would fail the create.
    if (!categoryIds.has(svc.categoryId)) {
      problems.push(
        `service ${svc.id} (${svc.slug}): categoryId=${svc.categoryId} has no row in public.service_category`,
      )
    }
  }

  return problems
}

/**
 * Fail-loud pre-flight validation of the live `public.*` rows.
 *
 * Nothing is written until this passes, and every problem is reported together
 * so one run surfaces the full list of fixes needed.
 */
export function assertSeedable(
  categories: readonly DrizzleCategoryRow[],
  services: readonly DrizzleServiceRow[],
): void {
  const problems = collectSeedProblems(categories, services)

  if (problems.length === 0) {
    return
  }

  throw new Error(
    [
      `Refusing to seed: ${problems.length} row(s) in the live catalogue cannot be represented in the CMS.`,
      ...problems.map((problem) => `  - ${problem}`),
      '',
      'Fix the offending rows in public.* (or extend SERVICE_DURATION_MINUTES in',
      'packages/types/src/service.ts, which needs a Payload migration) and re-run.',
    ].join('\n'),
  )
}
