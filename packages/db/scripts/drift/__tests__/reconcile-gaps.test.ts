/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-10-2026 & Updated - 04-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/__tests__/reconcile-gaps.test
 * Scope        : Unit tests — ungated unique index + unexpressed column DEFAULT
 *
 * Validates    : Requirements 5.1, 6.1, 6.2, 6.5
 *
 * Description  : Closes the two recorded planning-layer gaps in the drift
 *                tooling (tasks.md Notes, Findings 2 and 3):
 *
 *   FINDING 2 — an added UNIQUE INDEX carried NO bound `DataPreCheck`, so a plan
 *               could contain an ungated `CREATE UNIQUE INDEX` that real
 *               duplicate data would reject. A dropped UNIQUE constraint surfaces
 *               TWICE in the diff (constraint + backing unique index, since
 *               `catalog-queries.ts` `INDEXES_SQL` excludes only `indisprimary`),
 *               so the index half needs its own gate. It now carries a
 *               `duplicate_key` check, and for a PARTIAL (predicated) unique index
 *               the probe is scoped to the index predicate — otherwise duplicates
 *               outside the index's scope would block a safe step.
 *
 *   FINDING 3 — `Reconciler.plan` emitted NOTHING for a column whose DEFAULT
 *               diverges (its `divergent` branch only handled nullable -> NOT
 *               NULL), so an off-canonical branch could not be converged by the
 *               plan alone. It now emits ONE idempotent
 *               `ALTER TABLE ... ALTER COLUMN ... SET/DROP DEFAULT` step in the
 *               COLUMNS band, with the expression taken from the canonical
 *               fingerprint (never hard-coded) and NO data pre-check — a default
 *               change rewrites no rows and can violate no constraint.
 *
 * Responsibilities :
 * - An added UNIQUE index binds a `duplicate_key` check over its own columns
 * - A PARTIAL unique index's probe carries the index predicate
 * - A plain (non-unique) index still binds no check
 * - A divergent DEFAULT yields exactly ONE ordered, idempotent, ungated step
 * - `DROP DEFAULT` when canonical has none; `SET DEFAULT <canonical expr>` when it
 *   does; both derived from the fingerprint payload, for any column
 * - A column diverging in BOTH nullability and default stays ONE statement
 * - A nullability-only divergence is unchanged (no regression)
 * - No step emits data-mutation SQL or `drizzle-kit push`
 *
 * Tech Stack   : Vitest
 * Layer        : Test
 *
 * Dependencies : vitest, ../precheck, ../reconcile, ../types
 *
 * Notes        : DB-FREE and pure — `Reconciler.plan` / `PreChecker.plan` take a
 *                `SchemaDiff` and return data. Fixtures use real RGSS tables;
 *                pg_cron is RETIRED, so none reference `cron.schedule`.
 ************************************************************/

import { describe, expect, it } from 'vitest'
import { PreChecker } from '../precheck'
import { Reconciler } from '../reconcile'
import type { ColumnFp, DiffEntry, IndexFp, ReconcileStep, SchemaDiff } from '../types'

/** Dependency band the reconciler assigns to a column step. */
const COLUMN_ORDER = 1
/** Dependency band the reconciler assigns to an index step. */
const INDEX_ORDER = 3

function diffOf(objects: DiffEntry[]): SchemaDiff {
  return {
    fromCanonicalHash: 'canonical',
    toBranchHash: 'branch',
    objects,
    isIdentical: false,
  }
}

function planOne(entry: DiffEntry): ReconcileStep {
  const steps = Reconciler.plan(diffOf([entry]))
  expect(steps, `expected exactly one step for ${entry.kind}:${entry.object}`).toHaveLength(1)
  const step = steps[0]
  if (step === undefined) throw new Error('no step planned')
  return step
}

function indexEntry(table: string, index: IndexFp): DiffEntry {
  const scope = index.predicate === null ? '' : ` WHERE ${index.predicate}`
  return {
    kind: 'index',
    table,
    object: `${index.columns.join(', ')} [${index.method}]${scope}`,
    status: 'missing_on_branch',
    canonical: index,
    branch: null,
  }
}

function columnEntry(table: string, canonical: ColumnFp, branch: ColumnFp): DiffEntry {
  return {
    kind: 'column',
    table,
    object: canonical.name,
    status: 'divergent',
    canonical,
    branch,
  }
}

// ─────────────────────────────────────────────────────────
// FINDING 2 — an added UNIQUE INDEX is gated like a UNIQUE constraint.
// ─────────────────────────────────────────────────────────

describe('added unique index carries a bound duplicate_key pre-check (Finding 2)', () => {
  const uniqueIndex: IndexFp = {
    columns: ['booking_number'],
    unique: true,
    predicate: null,
    method: 'btree',
  }

  it('binds a duplicate_key check to the step, over the index columns', () => {
    const step = planOne(indexEntry('booking', uniqueIndex))

    expect(step.ddl).toContain('CREATE UNIQUE INDEX IF NOT EXISTS')
    expect(step.order).toBe(INDEX_ORDER)

    expect(step.preCheck).not.toBeNull()
    expect(step.preCheck?.kind).toBe('duplicate_key')
    expect(step.preCheck?.probeSql).toContain('"booking"')
    expect(step.preCheck?.probeSql).toContain('"booking_number"')
    expect(step.preCheck?.probeSql).toContain('HAVING COUNT(*) > 1')
    // Read-only: the gate must never mutate data to satisfy itself.
    expect(step.preCheck?.probeSql.trimStart().toUpperCase().startsWith('SELECT')).toBe(true)
  })

  it('binds the SAME check the pre-checker plans independently (Req 6.5)', () => {
    const entry = indexEntry('booking', uniqueIndex)
    const step = planOne(entry)

    expect(PreChecker.plan(diffOf([entry]))).toEqual([step.preCheck])
  })

  it('gates a COMPOSITE unique index over every one of its columns', () => {
    const step = planOne(
      indexEntry('offer_redemption', {
        columns: ['customer_id', 'redeemed_on'],
        unique: true,
        predicate: null,
        method: 'btree',
      }),
    )

    expect(step.preCheck?.kind).toBe('duplicate_key')
    expect(step.preCheck?.probeSql).toContain('"customer_id", "redeemed_on"')
  })

  it('scopes a PARTIAL unique index probe to the index predicate', () => {
    // `spa_membership`'s one-active-per-customer rule is a predicated unique
    // index: only rows WHERE status = 'active' are constrained, so only those
    // rows may be probed for duplicates.
    const predicate = "(status = 'active'::text)"
    const step = planOne(
      indexEntry('spa_membership', {
        columns: ['customer_id'],
        unique: true,
        predicate,
        method: 'btree',
      }),
    )

    expect(step.ddl).toContain(`WHERE ${predicate}`)
    expect(step.preCheck?.probeSql).toContain(`WHERE ${predicate}`)
    // The predicate precedes the grouping, so it filters rows rather than groups.
    const wherePos = step.preCheck?.probeSql.indexOf('WHERE') ?? -1
    const groupPos = step.preCheck?.probeSql.indexOf('GROUP BY') ?? -1
    expect(wherePos).toBeGreaterThan(0)
    expect(groupPos).toBeGreaterThan(wherePos)
  })

  it('binds no check to a plain (non-unique) index — no data can violate it', () => {
    const step = planOne(
      indexEntry('audit_log', {
        columns: ['entity_id', 'entity_type'],
        unique: false,
        predicate: null,
        method: 'btree',
      }),
    )

    expect(step.ddl).toContain('CREATE INDEX IF NOT EXISTS')
    expect(step.preCheck).toBeNull()
  })

  it('gates both halves when a dropped UNIQUE surfaces as constraint AND index', () => {
    // This is the real diff shape: `catalog-queries.ts` reports a unique
    // constraint's backing index as its own row, so the plan carries two steps.
    // BOTH must now be gated — the ungated `CREATE UNIQUE INDEX` was Finding 2.
    const steps = Reconciler.plan(
      diffOf([
        {
          kind: 'unique',
          table: 'booking',
          object: 'booking_number',
          status: 'missing_on_branch',
          canonical: { name: null, columns: ['booking_number'] },
          branch: null,
        },
        indexEntry('booking', uniqueIndex),
      ]),
    )

    expect(steps).toHaveLength(2)
    for (const step of steps) {
      expect(step.preCheck?.kind, step.id).toBe('duplicate_key')
    }
    // Ordering safety is preserved: the constraint band precedes the index band.
    expect(steps.map((step) => step.order)).toEqual([2, INDEX_ORDER])
  })
})

// ─────────────────────────────────────────────────────────
// FINDING 3 — a divergent column DEFAULT is expressed.
// ─────────────────────────────────────────────────────────

describe('divergent column DEFAULT yields one idempotent step (Finding 3)', () => {
  /** The real live drift: `public."user".role` lost `DEFAULT 'customer'`. */
  const canonicalRole: ColumnFp = {
    name: 'role',
    type: 'text',
    nullable: false,
    default: "'customer'::text",
  }
  const branchRole: ColumnFp = { ...canonicalRole, default: null }

  it('emits exactly one ordered, idempotent, ungated SET DEFAULT step', () => {
    const step = planOne(columnEntry('user', canonicalRole, branchRole))

    // Exactly one statement, in the COLUMNS band (Req 6.2).
    expect(step.order).toBe(COLUMN_ORDER)
    expect(step.ddl.split(';').filter((part) => part.trim().length > 0)).toHaveLength(1)
    expect(step.ddl).toBe(`ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'customer'::text;`)

    // Idempotent by construction: `SET DEFAULT` is an absolute assignment, so a
    // second application is a no-op (Req 6.1).
    expect(step.ddl).toContain('SET DEFAULT')
    expect(step.ddl).not.toContain('IF NOT EXISTS')

    // A DEFAULT change rewrites no rows and can violate no constraint, so it
    // needs no Data_Pre_Check.
    expect(step.preCheck).toBeNull()
    expect(PreChecker.plan(diffOf([columnEntry('user', canonicalRole, branchRole)]))).toEqual([])
  })

  it('derives the expression from the canonical fingerprint, not a hard-coded column', () => {
    // A completely different table/column/expression must work identically —
    // proof the fix is generic rather than a `user.role` special case.
    const canonical: ColumnFp = {
      name: 'total_paise',
      type: 'integer',
      nullable: false,
      default: '0',
    }
    const step = planOne(columnEntry('invoice', canonical, { ...canonical, default: '100' }))

    expect(step.ddl).toBe('ALTER TABLE "invoice" ALTER COLUMN "total_paise" SET DEFAULT 0;')
    expect(step.preCheck).toBeNull()
  })

  it('emits DROP DEFAULT when canonical has no default but the branch does', () => {
    const canonical: ColumnFp = {
      name: 'internal_note',
      type: 'text',
      nullable: true,
      default: null,
    }
    const step = planOne(columnEntry('booking', canonical, { ...canonical, default: "''::text" }))

    expect(step.ddl).toBe('ALTER TABLE "booking" ALTER COLUMN "internal_note" DROP DEFAULT;')
    expect(step.order).toBe(COLUMN_ORDER)
    expect(step.preCheck).toBeNull()
  })

  it('keeps a nullability-only divergence exactly as before (no regression)', () => {
    const canonical: ColumnFp = {
      name: 'branch_id',
      type: 'text',
      nullable: false,
      default: null,
    }
    const step = planOne(columnEntry('booking', canonical, { ...canonical, nullable: true }))

    expect(step.ddl).toBe('ALTER TABLE "booking" ALTER COLUMN "branch_id" SET NOT NULL;')
    // Tightening over existing data still needs its `existing_null` gate.
    expect(step.preCheck?.kind).toBe('existing_null')
  })

  it('combines a nullability AND default divergence into ONE statement', () => {
    // neon-http executes a single statement per call, so both corrections must
    // travel as one `ALTER TABLE` with two actions.
    const canonical: ColumnFp = {
      name: 'is_open',
      type: 'boolean',
      nullable: false,
      default: 'true',
    }
    const step = planOne(
      columnEntry('business_hour', canonical, {
        name: 'is_open',
        type: 'boolean',
        nullable: true,
        default: null,
      }),
    )

    expect(step.ddl).toBe(
      'ALTER TABLE "business_hour" ALTER COLUMN "is_open" SET NOT NULL, ALTER COLUMN "is_open" SET DEFAULT true;',
    )
    expect(step.ddl.split(';').filter((part) => part.trim().length > 0)).toHaveLength(1)
    expect(step.order).toBe(COLUMN_ORDER)
    // The tightening half still binds the existing-NULL gate.
    expect(step.preCheck?.kind).toBe('existing_null')
  })

  it('still emits nothing for a type-only divergence (out of additive scope)', () => {
    const canonical: ColumnFp = { name: 'amount', type: 'bigint', nullable: false, default: null }
    const steps = Reconciler.plan(
      diffOf([columnEntry('invoice', canonical, { ...canonical, type: 'integer' })]),
    )

    // A type change is a table rewrite, not an additive fix — reported, never
    // auto-applied.
    expect(steps).toEqual([])
  })

  it('emits no data-mutation SQL and never drizzle-kit push', () => {
    const steps = Reconciler.plan(
      diffOf([
        columnEntry('user', canonicalRole, branchRole),
        indexEntry('booking', {
          columns: ['booking_number'],
          unique: true,
          predicate: null,
          method: 'btree',
        }),
      ]),
    )

    expect(steps).toHaveLength(2)
    for (const step of steps) {
      const upper = step.ddl.toUpperCase()
      for (const keyword of ['INSERT', 'UPDATE ', 'DELETE', 'TRUNCATE', 'MERGE', 'COPY']) {
        expect(upper, step.id).not.toContain(keyword)
      }
      expect(step.ddl).not.toContain('drizzle-kit')
      expect(step.ddl.toLowerCase()).not.toContain('push')
    }
  })
})
