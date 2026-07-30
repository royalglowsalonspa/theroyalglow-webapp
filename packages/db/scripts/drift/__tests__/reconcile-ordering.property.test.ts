/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/__tests__/reconcile-ordering.property.test
 * Scope        : Property 7: Ordering safety
 *
 * Validates    : Requirements 6.3, 13.6
 *
 * Description  : fast-check + Vitest property test asserting that applying a
 *                reconciliation plan in `step.order` NEVER references an object
 *                before it exists. Concretely: for every step `S` and every
 *                object `O` that `S` depends on, no step that creates `O` may
 *                run at or after `S` — a foreign key can never precede the
 *                column or referenced key it needs, and an enum-typed column
 *                can never precede its `CREATE TYPE`.
 *
 *                `neon-http` has no interactive transactions, so the plan is a
 *                sequence of independent ordered statements — a mis-ordered plan
 *                would fail mid-way and partial-apply, which is precisely the
 *                failure mode this spec remediates.
 *
 * Responsibilities :
 * - Plan array is emitted already sorted non-decreasing by `step.order`
 * - `step.order` matches its dependency layer:
 *   enums(0) -> columns(1) -> pk/unique(2) -> indexes(3) -> foreign keys(4)
 * - No step depends on an object a later (or equal-order) step creates
 * - Foreign keys specifically follow their child columns, referenced columns,
 *   and the referenced primary key / unique constraint
 * - Ties within a layer break deterministically by step id
 *
 * Features / Functionality :
 * - Dependencies are derived from the diff payloads, independently of
 *   reconcile.ts internals.
 * - ≥100 runs per property (Requirement 13.9).
 *
 * Tech Stack   : Vitest + fast-check 4
 * Layer        : Test
 *
 * Dependencies : fast-check, vitest, ../reconcile, ../diff, ./drift-arbitraries
 *
 * Notes        : DB-free. No DDL is executed.
 *
 * Feature: schema-drift-remediation, Property 7: Ordering safety
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { SchemaDiffer } from '../diff'
import { Reconciler } from '../reconcile'
import type { DiffKind, ReconcileStep, SchemaFingerprint } from '../types'
import { modelPairArb, modelToFingerprint } from './drift-arbitraries'

const RUNS = { numRuns: 200 } as const

/** Dependency layer per object kind (design "Component 5: reconcile"). */
const EXPECTED_ORDER: Readonly<Record<DiffKind, number>> = {
  enum: 0,
  column: 1,
  primaryKey: 2,
  unique: 2,
  index: 3,
  foreignKey: 4,
}

// ─────────────────────────────────────────────────────────
// Object keys — the vocabulary of "what a step creates" and "what it needs".
// ─────────────────────────────────────────────────────────

function enumKey(name: string): string {
  return `enum:${name}`
}

function tableKey(table: string): string {
  return `table:${table}`
}

function columnKey(table: string, column: string): string {
  return `col:${table}.${column}`
}

/** A PK / UNIQUE key on a table — what a foreign key must reference. */
function referencedKey(table: string, columns: readonly string[]): string {
  return `key:${table}:${[...columns].sort().join(',')}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

function columnListOf(payload: unknown): string[] {
  if (isStringArray(payload)) return payload
  if (isRecord(payload) && isStringArray(payload.columns)) return payload.columns
  return []
}

// ─────────────────────────────────────────────────────────
// What each step CREATES.
// ─────────────────────────────────────────────────────────

function createdObjects(step: ReconcileStep): string[] {
  const entry = step.diff
  if (entry.status !== 'missing_on_branch') return []

  switch (entry.kind) {
    case 'enum': {
      const name = isRecord(entry.canonical) ? entry.canonical.name : null
      return typeof name === 'string' ? [enumKey(name)] : []
    }
    case 'column': {
      const name = isRecord(entry.canonical) ? entry.canonical.name : null
      if (entry.table === null || typeof name !== 'string') return []
      return [columnKey(entry.table, name)]
    }
    case 'primaryKey':
    case 'unique': {
      if (entry.table === null) return []
      const columns = columnListOf(entry.canonical)
      return columns.length === 0 ? [] : [referencedKey(entry.table, columns)]
    }
    default:
      // Indexes and foreign keys are leaves: nothing depends on them.
      return []
  }
}

// ─────────────────────────────────────────────────────────
// What each step DEPENDS ON.
// ─────────────────────────────────────────────────────────

function requiredObjects(step: ReconcileStep, enumNames: ReadonlySet<string>): string[] {
  const entry = step.diff
  const table = entry.table

  switch (entry.kind) {
    case 'enum':
      return []

    case 'column': {
      if (table === null) return []
      const required = [tableKey(table)]
      const type = isRecord(entry.canonical) ? entry.canonical.type : null
      if (typeof type === 'string') {
        const baseType = type.endsWith('[]') ? type.slice(0, -2) : type
        // An enum-typed column needs its `CREATE TYPE` to have run first.
        if (enumNames.has(baseType)) required.push(enumKey(baseType))
      }
      return required
    }

    case 'primaryKey':
    case 'unique':
    case 'index': {
      if (table === null) return []
      return [tableKey(table), ...columnListOf(entry.canonical).map((c) => columnKey(table, c))]
    }

    case 'foreignKey': {
      if (table === null || !isRecord(entry.canonical)) return []
      const payload = entry.canonical
      const columns = isStringArray(payload.columns) ? payload.columns : []
      const refTable = typeof payload.refTable === 'string' ? payload.refTable : null
      const refColumns = isStringArray(payload.refColumns) ? payload.refColumns : []
      const required = [tableKey(table), ...columns.map((c) => columnKey(table, c))]
      if (refTable !== null) {
        required.push(tableKey(refTable))
        required.push(...refColumns.map((c) => columnKey(refTable, c)))
        if (refColumns.length > 0) required.push(referencedKey(refTable, refColumns))
      }
      return required
    }

    default:
      return []
  }
}

/** Map every object key to the orders of the steps that create it. */
function creationOrders(plan: readonly ReconcileStep[]): Map<string, number[]> {
  const orders = new Map<string, number[]>()
  for (const step of plan) {
    for (const key of createdObjects(step)) {
      const list = orders.get(key) ?? []
      list.push(step.order)
      orders.set(key, list)
    }
  }
  return orders
}

function planFor(canonical: SchemaFingerprint, branch: SchemaFingerprint): ReconcileStep[] {
  return Reconciler.plan(SchemaDiffer.diff(canonical, branch))
}

const planPairArb = modelPairArb.map(({ canonical, branch }) => {
  const canonicalFp = modelToFingerprint(canonical)
  const branchFp = modelToFingerprint(branch)
  return {
    plan: planFor(canonicalFp, branchFp),
    enumNames: new Set(canonicalFp.enums.map((e) => e.name)),
  }
})

// Feature: schema-drift-remediation, Property 7: Ordering safety
describe('Property 7: Ordering safety', () => {
  it('never depends on an object created by a later or equal-order step', () => {
    fc.assert(
      fc.property(planPairArb, ({ plan, enumNames }) => {
        const orders = creationOrders(plan)

        for (const step of plan) {
          for (const key of requiredObjects(step, enumNames)) {
            for (const createdAt of orders.get(key) ?? []) {
              // Strictly earlier: applying in `step.order` must find it present.
              expect(createdAt).toBeLessThan(step.order)
            }
          }
        }
      }),
      RUNS,
    )
  })

  it('assigns each step the order of its dependency layer', () => {
    fc.assert(
      fc.property(planPairArb, ({ plan }) => {
        for (const step of plan) {
          expect(step.order).toBe(EXPECTED_ORDER[step.diff.kind])
        }
      }),
      RUNS,
    )
  })

  it('emits the plan already sorted by order, ties broken by id', () => {
    fc.assert(
      fc.property(planPairArb, ({ plan }) => {
        for (let i = 1; i < plan.length; i++) {
          const previous = plan[i - 1]
          const current = plan[i]
          if (previous === undefined || current === undefined) continue
          expect(previous.order).toBeLessThanOrEqual(current.order)
          if (previous.order === current.order) {
            expect(previous.id <= current.id).toBe(true)
          }
        }
      }),
      RUNS,
    )
  })

  it('places every foreign key after all enum, column, and key steps', () => {
    fc.assert(
      fc.property(planPairArb, ({ plan }) => {
        const fkOrders = plan.filter((s) => s.diff.kind === 'foreignKey').map((s) => s.order)
        if (fkOrders.length === 0) return

        const earliestFk = Math.min(...fkOrders)
        const prerequisiteKinds: DiffKind[] = ['enum', 'column', 'primaryKey', 'unique']

        for (const step of plan) {
          if (prerequisiteKinds.includes(step.diff.kind)) {
            expect(step.order).toBeLessThan(earliestFk)
          }
        }
      }),
      RUNS,
    )
  })

  it('orders enums before columns before keys before indexes before foreign keys', () => {
    fc.assert(
      fc.property(planPairArb, ({ plan }) => {
        const layerOf = (kind: DiffKind): number => EXPECTED_ORDER[kind]

        for (const step of plan) {
          const layer = layerOf(step.diff.kind)
          // No step of a later layer may appear before a step of an earlier one.
          const laterLayerBefore = plan
            .slice(0, plan.indexOf(step))
            .some((s) => layerOf(s.diff.kind) > layer)
          expect(laterLayerBefore).toBe(false)
        }
      }),
      RUNS,
    )
  })
})
