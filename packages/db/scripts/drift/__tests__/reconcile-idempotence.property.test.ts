/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/__tests__/reconcile-idempotence.property.test
 * Scope        : Property 5: Reconciliation idempotence
 *
 * Validates    : Requirements 6.1, 13.5
 *
 * Description  : fast-check + Vitest property test for the ordered reconciler
 *                (`packages/db/scripts/drift/reconcile.ts`). Asserts that for
 *                every plan `P` and branch `B`, `apply(apply(B, P), P)` has the
 *                same fingerprint as `apply(B, P)` — running the plan twice
 *                equals running it once. This is what makes a partially failed
 *                rollout safe to simply re-run (design Error Handling
 *                Scenario 4) instead of hand-repaired with `drizzle-kit push`.
 *
 * Responsibilities :
 * - Every emitted statement is guarded (`IF NOT EXISTS`, a catalog existence
 *   probe, a `duplicate_object` handler, an inherently idempotent
 *   `SET NOT NULL`) or inert (operator-confirm comments)
 * - Under a modeled `apply`, a second application changes nothing
 * - The plan is deterministic for a fixed diff
 * - `drizzle-kit push` is never emitted
 *
 * Features / Functionality :
 * - The modeled `apply` decides GUARDEDNESS from the emitted DDL text, not from
 *   the diff entry. An unguarded statement is therefore modeled as applying
 *   twice, which breaks the property — so a regression that dropped a guard is
 *   actually caught rather than assumed away.
 * - ≥100 runs per property (Requirement 13.9).
 *
 * Tech Stack   : Vitest + fast-check 4
 * Layer        : Test
 *
 * Dependencies : fast-check, vitest, ../reconcile, ../diff, ../fingerprint,
 *                ./drift-arbitraries
 *
 * Notes        : DB-free. No DDL is executed anywhere; `apply` is a pure model.
 *
 * Feature: schema-drift-remediation, Property 5: Reconciliation idempotence
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { SchemaDiffer } from '../diff'
import { Fingerprinter } from '../fingerprint'
import { Reconciler } from '../reconcile'
import type { DiffEntry, ReconcileStep, ReferentialAction } from '../types'
import {
  type ModelFk,
  type ModelIndex,
  modelPairArb,
  modelToFingerprint,
  type SchemaModel,
  sanitizeModel,
} from './drift-arbitraries'

const RUNS = { numRuns: 200 } as const

// ─────────────────────────────────────────────────────────
// DDL guard classification (derived from the emitted SQL text).
// ─────────────────────────────────────────────────────────

function executableLines(ddl: string): string[] {
  return ddl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('--'))
}

/** Inert: nothing executable (the operator-confirm, never-auto-applied steps). */
function isInertDdl(ddl: string): boolean {
  return executableLines(ddl).length === 0
}

function isIdempotentStatement(statement: string): boolean {
  if (/IF NOT EXISTS/i.test(statement)) return true
  // `ALTER COLUMN ... SET NOT NULL` is inherently idempotent in Postgres.
  if (/SET NOT NULL/i.test(statement)) return true
  // So are the column-DEFAULT corrections: `SET DEFAULT` / `DROP DEFAULT` are
  // ABSOLUTE assignments, so re-issuing one is a no-op. A single `ALTER TABLE`
  // may carry both a `SET NOT NULL` and a default action, so the whole
  // statement qualifies when every action is one of these.
  if (/ALTER COLUMN .+ (SET DEFAULT |DROP DEFAULT)/i.test(statement)) return true
  return false
}

/** True when re-running the statement(s) cannot duplicate or error. */
function isIdempotentDdl(ddl: string): boolean {
  if (isInertDdl(ddl)) return true
  const body = executableLines(ddl).join('\n')

  // A `DO $$ ... $$` block guarded by a catalog existence probe or a
  // duplicate_object exception handler.
  if (
    /^DO \$\$/i.test(body) &&
    (/IF NOT EXISTS\s*\(/i.test(body) || /EXCEPTION\s+WHEN\s+duplicate_object/i.test(body))
  ) {
    return true
  }

  return executableLines(ddl).every(isIdempotentStatement)
}

// ─────────────────────────────────────────────────────────
// Payload extraction from a `DiffEntry` (the fingerprint `*Fp` shapes).
// ─────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

function asEnum(payload: unknown): { name: string; labels: string[] } | null {
  if (isRecord(payload) && typeof payload.name === 'string' && isStringArray(payload.labels)) {
    return { name: payload.name, labels: payload.labels }
  }
  return null
}

function asColumn(
  payload: unknown,
): { name: string; type: string; nullable: boolean; default: string | null } | null {
  if (
    isRecord(payload) &&
    typeof payload.name === 'string' &&
    typeof payload.type === 'string' &&
    typeof payload.nullable === 'boolean' &&
    (payload.default === null || typeof payload.default === 'string')
  ) {
    return {
      name: payload.name,
      type: payload.type,
      nullable: payload.nullable,
      default: payload.default,
    }
  }
  return null
}

function asColumnList(payload: unknown): string[] | null {
  if (isStringArray(payload) && payload.length > 0) return payload
  if (isRecord(payload) && isStringArray(payload.columns) && payload.columns.length > 0) {
    return payload.columns
  }
  return null
}

function asFk(payload: unknown): ModelFk | null {
  if (
    isRecord(payload) &&
    isStringArray(payload.columns) &&
    typeof payload.refTable === 'string' &&
    isStringArray(payload.refColumns) &&
    typeof payload.onDelete === 'string' &&
    typeof payload.onUpdate === 'string'
  ) {
    return {
      columns: payload.columns,
      refTable: payload.refTable,
      refColumns: payload.refColumns,
      onDelete: payload.onDelete as ReferentialAction,
      onUpdate: payload.onUpdate as ReferentialAction,
    }
  }
  return null
}

function asIndex(payload: unknown): ModelIndex | null {
  if (
    isRecord(payload) &&
    isStringArray(payload.columns) &&
    typeof payload.unique === 'boolean' &&
    typeof payload.method === 'string' &&
    (payload.predicate === null || typeof payload.predicate === 'string')
  ) {
    return {
      columns: payload.columns,
      unique: payload.unique,
      predicate: payload.predicate,
      method: payload.method,
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────
// Modeled `apply` — interpret one step against a schema model.
//
// GUARDED statements are modeled as "add if absent" (matching `IF NOT EXISTS` /
// the catalog existence probe). UNGUARDED statements are modeled as applying
// unconditionally, which duplicates the object on a second run and breaks the
// property — exactly the failure a lost guard would cause on a real branch.
// ─────────────────────────────────────────────────────────

function indexSignature(index: ModelIndex): string {
  return `${[...index.columns].sort().join(',')}|${index.method}|${index.unique}|${index.predicate ?? ''}`
}

/** The identity the reconciler's FK existence probe matches on. */
function fkSignature(fk: ModelFk): string {
  return `${fk.columns.join(',')}|${fk.refTable}`
}

function withTable(
  model: SchemaModel,
  tableName: string,
  update: (table: SchemaModel['tables'][number]) => SchemaModel['tables'][number],
): SchemaModel {
  if (!model.tables.some((t) => t.name === tableName)) return model
  return {
    enums: model.enums,
    tables: model.tables.map((t) => (t.name === tableName ? update(t) : t)),
  }
}

function applyEntry(model: SchemaModel, entry: DiffEntry, guarded: boolean): SchemaModel {
  switch (entry.kind) {
    case 'enum': {
      const canonical = asEnum(entry.canonical)
      if (canonical === null) return model
      if (entry.status === 'missing_on_branch') {
        if (guarded && model.enums.some((e) => e.name === canonical.name)) return model
        return { enums: [...model.enums, { ...canonical }], tables: model.tables }
      }
      if (entry.status === 'divergent') {
        return {
          enums: model.enums.map((e) => {
            if (e.name !== canonical.name) return e
            const additions = guarded
              ? canonical.labels.filter((l) => !e.labels.includes(l))
              : canonical.labels
            return { ...e, labels: [...e.labels, ...additions] }
          }),
          tables: model.tables,
        }
      }
      return model
    }

    case 'column': {
      const canonical = asColumn(entry.canonical)
      if (canonical === null || entry.table === null) return model
      if (entry.status === 'missing_on_branch') {
        return withTable(model, entry.table, (table) => {
          if (guarded && table.columns.some((c) => c.name === canonical.name)) return table
          return { ...table, columns: [...table.columns, { ...canonical }] }
        })
      }
      if (entry.status === 'divergent') {
        // Two additive corrections are emitted, both absolute assignments: the
        // nullable -> NOT NULL tightening, and the column DEFAULT. Type
        // divergence is deliberately NOT modeled — the reconciler emits nothing
        // for it.
        const branch = asColumn(entry.branch)
        return withTable(model, entry.table, (table) => ({
          ...table,
          columns: table.columns.map((c) => {
            if (c.name !== canonical.name) return c
            const tightened = branch?.nullable === true && !canonical.nullable
            const defaultChanged = branch !== null && branch.default !== canonical.default
            return {
              ...c,
              nullable: tightened ? false : c.nullable,
              default: defaultChanged ? canonical.default : c.default,
            }
          }),
        }))
      }
      return model
    }

    case 'primaryKey': {
      if (entry.table === null || entry.status !== 'missing_on_branch') return model
      const columns = asColumnList(entry.canonical)
      if (columns === null) return model
      return withTable(model, entry.table, (table) => {
        if (guarded && table.primaryKey !== null) return table
        return { ...table, primaryKey: [...columns] }
      })
    }

    case 'unique': {
      if (entry.table === null || entry.status !== 'missing_on_branch') return model
      const columns = asColumnList(entry.canonical)
      if (columns === null) return model
      const sorted = [...columns].sort()
      const key = sorted.join(',')
      return withTable(model, entry.table, (table) => {
        if (guarded && table.uniques.some((u) => [...u].sort().join(',') === key)) return table
        return { ...table, uniques: [...table.uniques, sorted] }
      })
    }

    case 'index': {
      if (entry.table === null || entry.status !== 'missing_on_branch') return model
      const index = asIndex(entry.canonical)
      if (index === null) return model
      const signature = indexSignature(index)
      return withTable(model, entry.table, (table) => {
        if (guarded && table.indexes.some((i) => indexSignature(i) === signature)) return table
        return { ...table, indexes: [...table.indexes, { ...index }] }
      })
    }

    case 'foreignKey': {
      if (entry.table === null || entry.status !== 'missing_on_branch') return model
      const fk = asFk(entry.canonical)
      if (fk === null) return model
      const signature = fkSignature(fk)
      return withTable(model, entry.table, (table) => {
        if (guarded && table.foreignKeys.some((f) => fkSignature(f) === signature)) return table
        return { ...table, foreignKeys: [...table.foreignKeys, { ...fk }] }
      })
    }

    default:
      return model
  }
}

/** Apply an ordered plan to a branch model. Inert steps are skipped. */
function apply(branch: SchemaModel, plan: readonly ReconcileStep[]): SchemaModel {
  const ordered = [...plan].sort((a, b) => a.order - b.order)
  let model = branch
  for (const step of ordered) {
    if (isInertDdl(step.ddl)) continue
    model = applyEntry(model, step.diff, isIdempotentDdl(step.ddl))
  }
  return sanitizeModel(model)
}

function hashOf(model: SchemaModel): string {
  return Fingerprinter.hash(modelToFingerprint(model))
}

function planFor(canonical: SchemaModel, branch: SchemaModel): ReconcileStep[] {
  return Reconciler.plan(
    SchemaDiffer.diff(modelToFingerprint(canonical), modelToFingerprint(branch)),
  )
}

// Feature: schema-drift-remediation, Property 5: Reconciliation idempotence
describe('Property 5: Reconciliation idempotence', () => {
  it('apply(apply(B, P), P) has the same fingerprint as apply(B, P)', () => {
    fc.assert(
      fc.property(modelPairArb, ({ canonical, branch }) => {
        const plan = planFor(canonical, branch)

        const once = apply(branch, plan)
        const twice = apply(once, plan)

        expect(hashOf(twice)).toBe(hashOf(once))
      }),
      RUNS,
    )
  })

  it('stays idempotent for any number of re-runs', () => {
    fc.assert(
      fc.property(modelPairArb, fc.integer({ min: 2, max: 4 }), ({ canonical, branch }, runs) => {
        const plan = planFor(canonical, branch)

        const once = apply(branch, plan)
        let repeated = once
        for (let i = 0; i < runs; i++) repeated = apply(repeated, plan)

        expect(hashOf(repeated)).toBe(hashOf(once))
      }),
      RUNS,
    )
  })

  it('emits only guarded or inert statements', () => {
    fc.assert(
      fc.property(modelPairArb, ({ canonical, branch }) => {
        for (const step of planFor(canonical, branch)) {
          expect(isIdempotentDdl(step.ddl)).toBe(true)
        }
      }),
      RUNS,
    )
  })

  it('actually covers divergent column DEFAULT steps', () => {
    // The `change_default` mutation in `drift-arbitraries.ts` produces columns
    // whose DEFAULT diverges, so the generated plans exercise the column-DEFAULT
    // corrections the properties above assert idempotence for. Asserted rather
    // than assumed: without coverage the guardedness property would be vacuous
    // for this step class.
    const covered = fc
      .sample(modelPairArb, 300)
      .flatMap(({ canonical, branch }) => planFor(canonical, branch))
      .filter((step) => /ALTER COLUMN .+ (SET DEFAULT |DROP DEFAULT)/.test(step.ddl))

    expect(covered.length).toBeGreaterThan(0)
    for (const step of covered) {
      expect(isIdempotentDdl(step.ddl)).toBe(true)
      // A DEFAULT change needs no data pre-check; a co-occurring NOT NULL
      // tightening in the same statement does.
      if (!/SET NOT NULL/.test(step.ddl)) expect(step.preCheck).toBeNull()
    }
  })

  it('never emits drizzle-kit push (the mechanism that partial-applied)', () => {
    fc.assert(
      fc.property(modelPairArb, ({ canonical, branch }) => {
        for (const step of planFor(canonical, branch)) {
          expect(step.ddl).not.toContain('drizzle-kit')
          expect(step.ddl.toLowerCase()).not.toContain('push')
        }
      }),
      RUNS,
    )
  })

  it('is deterministic: the same diff always yields the same plan', () => {
    fc.assert(
      fc.property(modelPairArb, ({ canonical, branch }) => {
        expect(planFor(canonical, branch)).toEqual(planFor(canonical, branch))
      }),
      RUNS,
    )
  })
})
