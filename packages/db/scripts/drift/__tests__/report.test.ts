/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/__tests__/report.test
 * Scope        : Unit tests — deterministic report rendering (task 9.2)
 *
 * Validates    : Requirements 9.3
 *
 * Description  : Asserts `packages/db/scripts/drift/report.ts` renders
 *                BYTE-IDENTICAL markdown and json for identical input. A drift
 *                report is the artifact an operator signs off a `prod` rollout
 *                against, so it must never shift between runs: no clock reads,
 *                no map/object iteration order leaking through, no dependence on
 *                the order branches, diff entries, or pre-check results arrive
 *                in. The ratified `test`/`pprd` data-loss note must always be
 *                stated verbatim.
 *
 * Responsibilities :
 * - Repeated calls on the same input produce identical bytes
 * - Reordering branches / diff entries / pre-check results changes nothing
 * - Object key insertion order (including inside violation samples) leaks nothing
 * - No timestamp appears unless `generatedAt` is explicitly injected
 * - The verbatim `RATIFIED_DATA_LOSS_NOTE` appears in all four renderers
 * - json output is valid JSON with recursively sorted keys
 * - Post-rollout divergence is rendered explicitly (Req 8.6)
 *
 * Tech Stack   : Vitest
 * Layer        : Test
 *
 * Dependencies : vitest, ../report, ../types
 *
 * Notes        : Pure — no I/O, no database, no clock. Fixtures reference real
 *                RGSS tables; pg_cron is RETIRED so none appear.
 ************************************************************/

import { describe, expect, it } from 'vitest'
import {
  type BranchConformance,
  type ConformanceReport,
  RATIFIED_DATA_LOSS_NOTE,
  Reporter,
  type RolloutReport,
} from '../report'
import type { DiffEntry, PreCheckResult, SchemaDiff } from '../types'

const CANONICAL_HASH = 'a1b2c3d4e5f6'
const PROD_HASH = 'f6e5d4c3b2a1'
const DEV_HASH = '0011223344ff'

// ─────────────────────────────────────────────────────────
// Fixtures.
// ─────────────────────────────────────────────────────────

const DIFF_ENTRIES: DiffEntry[] = [
  {
    kind: 'foreignKey',
    table: 'booking',
    object: 'customer_id -> customer_profile(id)',
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
  {
    kind: 'unique',
    table: 'booking',
    object: 'booking_number',
    status: 'missing_on_branch',
    canonical: { name: null, columns: ['booking_number'] },
    branch: null,
  },
  {
    kind: 'index',
    table: 'invoice',
    object: 'invoice_number (unique) [btree]',
    status: 'extra_on_branch',
    canonical: null,
    branch: { columns: ['invoice_number'], unique: true, predicate: null, method: 'btree' },
  },
  {
    kind: 'column',
    table: 'invoice',
    object: 'total_paise',
    status: 'divergent',
    canonical: { name: 'total_paise', type: 'integer', nullable: false, default: null },
    branch: { name: 'total_paise', type: 'integer', nullable: true, default: null },
  },
  {
    kind: 'enum',
    table: null,
    object: 'booking_status',
    status: 'missing_on_branch',
    canonical: { name: 'booking_status', labels: ['pending', 'confirmed'] },
    branch: null,
  },
]

function prodDiff(objects: DiffEntry[] = DIFF_ENTRIES): SchemaDiff {
  return {
    fromCanonicalHash: CANONICAL_HASH,
    toBranchHash: PROD_HASH,
    objects,
    isIdentical: objects.length === 0,
  }
}

const BLOCKED_ORPHAN_FK: PreCheckResult = {
  check: {
    kind: 'orphan_fk',
    probeSql:
      'SELECT c.* FROM "booking" c LEFT JOIN "customer_profile" p ' +
      'ON c."customer_id" = p."id" WHERE p."id" IS NULL AND c."customer_id" IS NOT NULL',
    description:
      'Detect orphaned rows on booking(customer_id) with no matching ' +
      'customer_profile(id) before adding the foreign key',
  },
  passed: false,
  violationCount: 2,
  sample: [
    { id: 'bk_1', customer_id: 'cust_missing_1' },
    { customer_id: 'cust_missing_2', id: 'bk_2' },
  ],
}

const BLOCKED_DUPLICATE_KEY: PreCheckResult = {
  check: {
    kind: 'duplicate_key',
    probeSql:
      'SELECT "booking_number", COUNT(*) AS count FROM "booking" ' +
      'GROUP BY "booking_number" HAVING COUNT(*) > 1',
    description:
      'Detect duplicate UNIQUE groups on booking(booking_number) before adding the constraint',
  },
  passed: false,
  violationCount: 1,
  sample: [{ booking_number: 'BK-RS-2605-H-38291', count: '2' }],
}

const PASSING_NULL_CHECK: PreCheckResult = {
  check: {
    kind: 'existing_null',
    probeSql: 'SELECT COUNT(*) AS count FROM "invoice" WHERE "total_paise" IS NULL',
    description: 'Detect existing NULLs in invoice.total_paise before tightening to NOT NULL',
  },
  passed: true,
  violationCount: 0,
  sample: [],
}

const PROD_BRANCH: BranchConformance = {
  branch: 'prod',
  diff: prodDiff(),
  preChecks: [BLOCKED_ORPHAN_FK, PASSING_NULL_CHECK, BLOCKED_DUPLICATE_KEY],
}

const DEV_BRANCH: BranchConformance = {
  branch: 'dev',
  diff: {
    fromCanonicalHash: CANONICAL_HASH,
    toBranchHash: DEV_HASH,
    objects: [],
    isIdentical: true,
  },
  preChecks: [],
}

const CONFORMANCE: ConformanceReport = {
  canonicalHash: CANONICAL_HASH,
  branches: [PROD_BRANCH, DEV_BRANCH],
}

const ROLLOUT: RolloutReport = {
  canonicalHash: CANONICAL_HASH,
  branches: [
    {
      branch: 'prod',
      strategy: 'forward_migrate',
      fingerprintHash: CANONICAL_HASH,
      matchesCanonical: true,
    },
    {
      branch: 'dev',
      strategy: 'forward_migrate',
      fingerprintHash: DEV_HASH,
      matchesCanonical: false,
    },
    {
      branch: 'test',
      strategy: 'reset_from_parent',
      fingerprintHash: CANONICAL_HASH,
      matchesCanonical: true,
    },
    {
      branch: 'pprd',
      strategy: 'reset_from_parent',
      fingerprintHash: CANONICAL_HASH,
      matchesCanonical: true,
    },
  ],
}

/** Reverse a copy — used to prove input ordering does not leak into output. */
function reversed<T>(items: readonly T[]): T[] {
  return [...items].reverse()
}

const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

describe('report: deterministic rendering (task 9.2)', () => {
  it('renders byte-identical markdown for repeated calls on fixed input', () => {
    expect(Reporter.conformanceMarkdown(CONFORMANCE)).toBe(
      Reporter.conformanceMarkdown(CONFORMANCE),
    )
    expect(Reporter.rolloutMarkdown(ROLLOUT)).toBe(Reporter.rolloutMarkdown(ROLLOUT))
  })

  it('renders byte-identical json for repeated calls on fixed input', () => {
    expect(Reporter.conformanceJson(CONFORMANCE)).toBe(Reporter.conformanceJson(CONFORMANCE))
    expect(Reporter.rolloutJson(ROLLOUT)).toBe(Reporter.rolloutJson(ROLLOUT))
  })

  it('is invariant to branch order', () => {
    const flipped: ConformanceReport = {
      canonicalHash: CANONICAL_HASH,
      branches: reversed(CONFORMANCE.branches),
    }

    expect(Reporter.conformanceMarkdown(flipped)).toBe(Reporter.conformanceMarkdown(CONFORMANCE))
    expect(Reporter.conformanceJson(flipped)).toBe(Reporter.conformanceJson(CONFORMANCE))

    const flippedRollout: RolloutReport = {
      canonicalHash: CANONICAL_HASH,
      branches: reversed(ROLLOUT.branches),
    }
    expect(Reporter.rolloutMarkdown(flippedRollout)).toBe(Reporter.rolloutMarkdown(ROLLOUT))
    expect(Reporter.rolloutJson(flippedRollout)).toBe(Reporter.rolloutJson(ROLLOUT))
  })

  it('is invariant to diff entry and pre-check result order', () => {
    const shuffled: ConformanceReport = {
      canonicalHash: CANONICAL_HASH,
      branches: [
        {
          branch: 'prod',
          diff: prodDiff(reversed(DIFF_ENTRIES)),
          preChecks: reversed(PROD_BRANCH.preChecks),
        },
        DEV_BRANCH,
      ],
    }

    expect(Reporter.conformanceMarkdown(shuffled)).toBe(Reporter.conformanceMarkdown(CONFORMANCE))
    expect(Reporter.conformanceJson(shuffled)).toBe(Reporter.conformanceJson(CONFORMANCE))
  })

  it('is invariant to object key insertion order, including inside samples', () => {
    // Same logical report, every object literal written with different key order.
    const reordered: ConformanceReport = {
      branches: [
        {
          preChecks: [
            {
              violationCount: 2,
              passed: false,
              sample: [
                { customer_id: 'cust_missing_1', id: 'bk_1' },
                { id: 'bk_2', customer_id: 'cust_missing_2' },
              ],
              check: {
                description: BLOCKED_ORPHAN_FK.check.description,
                probeSql: BLOCKED_ORPHAN_FK.check.probeSql,
                kind: 'orphan_fk',
              },
            },
            PASSING_NULL_CHECK,
            BLOCKED_DUPLICATE_KEY,
          ],
          diff: prodDiff(),
          branch: 'prod',
        },
        DEV_BRANCH,
      ],
      canonicalHash: CANONICAL_HASH,
    }

    expect(Reporter.conformanceJson(reordered)).toBe(Reporter.conformanceJson(CONFORMANCE))
    expect(Reporter.conformanceMarkdown(reordered)).toBe(Reporter.conformanceMarkdown(CONFORMANCE))
  })

  it('reads no clock: output is timestamp-free unless generatedAt is injected', () => {
    expect(Reporter.conformanceMarkdown(CONFORMANCE)).not.toMatch(ISO_TIMESTAMP)
    expect(Reporter.conformanceJson(CONFORMANCE)).not.toMatch(ISO_TIMESTAMP)
    expect(Reporter.rolloutMarkdown(ROLLOUT)).not.toMatch(ISO_TIMESTAMP)
    expect(Reporter.rolloutJson(ROLLOUT)).not.toMatch(ISO_TIMESTAMP)

    const stamped = Reporter.conformanceMarkdown({
      ...CONFORMANCE,
      generatedAt: '2026-07-29T00:00:00.000Z',
    })
    expect(stamped).toContain('2026-07-29T00:00:00.000Z')
  })

  it('states the ratified data-loss tradeoff verbatim in every renderer', () => {
    expect(Reporter.conformanceMarkdown(CONFORMANCE)).toContain(RATIFIED_DATA_LOSS_NOTE)
    expect(Reporter.rolloutMarkdown(ROLLOUT)).toContain(RATIFIED_DATA_LOSS_NOTE)

    const conformance = JSON.parse(Reporter.conformanceJson(CONFORMANCE)) as { note: string }
    const rollout = JSON.parse(Reporter.rolloutJson(ROLLOUT)) as { note: string }
    expect(conformance.note).toBe(RATIFIED_DATA_LOSS_NOTE)
    expect(rollout.note).toBe(RATIFIED_DATA_LOSS_NOTE)

    // The note names reset_from_parent and protects prod/dev explicitly.
    expect(RATIFIED_DATA_LOSS_NOTE).toContain('reset_from_parent')
    expect(RATIFIED_DATA_LOSS_NOTE).toContain('`prod` and `dev` are never reset')
  })

  it('renders every discrepancy, grouped by status, with stable counts', () => {
    const markdown = Reporter.conformanceMarkdown(CONFORMANCE)

    expect(markdown).toContain('# Schema Drift Conformance Report')
    expect(markdown).toContain(`- Canonical fingerprint: \`${CANONICAL_HASH}\``)
    expect(markdown).toContain('## Branch: prod')
    expect(markdown).toContain('## Branch: dev')
    expect(markdown).toContain(`${DIFF_ENTRIES.length} structural discrepancies:`)
    expect(markdown).toContain('#### Missing on branch (3)')
    expect(markdown).toContain('#### Extra on branch (1)')
    expect(markdown).toContain('#### Divergent (1)')
    // A converged branch says so instead of listing discrepancies.
    expect(markdown).toContain('Identical to canonical — no structural discrepancies.')
    expect(markdown).toContain('All data pre-checks passed.')
  })

  it('reports only the blocked pre-checks, with counts and bounded samples', () => {
    const markdown = Reporter.conformanceMarkdown(CONFORMANCE)

    expect(markdown).toContain('2 blocked data pre-checks:')
    expect(markdown).toContain('**duplicate_key**')
    expect(markdown).toContain('**orphan_fk**')
    expect(markdown).toContain('Violations: 2')
    expect(markdown).toContain('cust_missing_1')
    // The passing check is never listed as blocked.
    expect(markdown).not.toContain('**existing_null**')
  })

  it('emits valid json with recursively sorted keys', () => {
    const json = Reporter.conformanceJson(CONFORMANCE)
    const parsed = JSON.parse(json) as Record<string, unknown>

    expect(Object.keys(parsed)).toEqual([...Object.keys(parsed)].sort())
    expect(parsed.canonicalHash).toBe(CANONICAL_HASH)
    expect(json.endsWith('\n')).toBe(true)
  })

  it('renders post-rollout divergence explicitly', () => {
    const markdown = Reporter.rolloutMarkdown(ROLLOUT)

    expect(markdown).toContain('# Schema Drift Rollout Report')
    expect(markdown).toContain('- All branches converged: no')
    expect(markdown).toContain('**prod** (forward_migrate): matches canonical')
    expect(markdown).toContain('**dev** (forward_migrate): DIVERGED')
    expect(markdown).toContain('**test** (reset_from_parent): matches canonical')
    expect(markdown).toContain('## Divergence')
    expect(markdown).toContain('do not match the canonical fingerprint: dev.')

    const parsed = JSON.parse(Reporter.rolloutJson(ROLLOUT)) as {
      converged: boolean
      divergedBranches: string[]
    }
    expect(parsed.converged).toBe(false)
    expect(parsed.divergedBranches).toEqual(['dev'])
  })

  it('reports a fully converged rollout without a divergence section', () => {
    const converged: RolloutReport = {
      canonicalHash: CANONICAL_HASH,
      branches: ROLLOUT.branches.map((b) => ({
        ...b,
        fingerprintHash: CANONICAL_HASH,
        matchesCanonical: true,
      })),
    }

    const markdown = Reporter.rolloutMarkdown(converged)
    expect(markdown).toContain('- All branches converged: yes')
    expect(markdown).not.toContain('## Divergence')
    expect(markdown).not.toContain('DIVERGED')
  })
})
