/************************************************************
 * Schema Drift Remediation — data pre-checks.
 *
 * For each additive constraint in a `SchemaDiff`, derive the read-only
 * data-conformance predicate that must hold before the constraint can be
 * added, and (task 5.2) evaluate it against branch data.
 *
 * `plan` is PURE: no I/O. It maps a diff to the set of `DataPreCheck`
 * probes (read-only SQL + human description) needed to gate reconciliation.
 *
 * Mirrors design "Component 4: precheck", the `DataPreCheck` /
 * `PreCheckResult` data models, and Property 4 (pre-check soundness) of
 * `.kiro/specs/schema-drift-remediation/design.md`.
 *
 * _Requirements: 5.1, 5.2, 5.3_
 ************************************************************/

import type { DataPreCheck, DiffEntry, PreCheckResult, SchemaDiff } from './types'

// ─────────────────────────────────────────────────────────
// Probe reader — the read-only execution surface used by `evaluate`
// (implemented in task 5.2). Returns the raw violating rows/groups.
// ─────────────────────────────────────────────────────────

export interface ProbeReader {
  /** Execute read-only probe SQL and return the violating rows/groups. */
  query(sql: string): Promise<unknown[]>
}

// ─────────────────────────────────────────────────────────
// Identifier quoting — schema identifiers come from our own catalog (not
// user input), but we still double-quote and escape embedded quotes so the
// generated SQL is safe and handles any casing/reserved words.
// ─────────────────────────────────────────────────────────

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function quoteColumns(columns: readonly string[]): string {
  return columns.map(quoteIdent).join(', ')
}

// ─────────────────────────────────────────────────────────
// Defensive payload extractors — `DiffEntry.canonical` / `.branch` are typed
// `unknown` (the producing `diff` module embeds the fingerprint `*Fp` shapes).
// These guards pull the fields each check needs without assuming `any`.
// ─────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

/**
 * Extract a column-name list from a diff payload. Handles a `ConstraintFp` /
 * `FkFp` shape (`{ columns: string[] }`) and a bare PK column list
 * (`string[]`). Returns an empty list when no columns can be resolved.
 */
function extractColumns(payload: unknown): string[] {
  if (isStringArray(payload)) return payload
  if (isRecord(payload) && isStringArray(payload.columns)) return payload.columns
  return []
}

type FkPayload = {
  columns: string[]
  refTable: string
  refColumns: string[]
}

/** Extract the `{ columns, refTable, refColumns }` shape of an `FkFp` payload. */
function extractFk(payload: unknown): FkPayload | null {
  if (
    isRecord(payload) &&
    isStringArray(payload.columns) &&
    typeof payload.refTable === 'string' &&
    isStringArray(payload.refColumns) &&
    payload.columns.length > 0 &&
    payload.refColumns.length > 0
  ) {
    return {
      columns: payload.columns,
      refColumns: payload.refColumns,
      refTable: payload.refTable,
    }
  }
  return null
}

type UniqueIndexPayload = { columns: string[]; predicate: string | null }

/**
 * Extract the `{ columns, predicate }` shape of a UNIQUE `IndexFp` payload.
 * Returns `null` for a non-unique index — a plain index cannot be violated by
 * existing data, so it needs no pre-check.
 *
 * A dropped UNIQUE constraint surfaces TWICE in the diff (once as the
 * constraint, once as its backing unique index, because `catalog-queries.ts`
 * `INDEXES_SQL` only excludes `indisprimary`), so the index half must be gated
 * exactly like the constraint half or the plan would carry an UNGATED
 * `CREATE UNIQUE INDEX` that real duplicate data would reject.
 */
function extractUniqueIndex(payload: unknown): UniqueIndexPayload | null {
  if (
    isRecord(payload) &&
    payload.unique === true &&
    isStringArray(payload.columns) &&
    payload.columns.length > 0 &&
    (payload.predicate === null || typeof payload.predicate === 'string')
  ) {
    return { columns: payload.columns, predicate: payload.predicate }
  }
  return null
}

/** Extract a single column name + nullability from a `ColumnFp` payload. */
function extractColumn(payload: unknown): { name: string; nullable: boolean } | null {
  if (
    isRecord(payload) &&
    typeof payload.name === 'string' &&
    typeof payload.nullable === 'boolean'
  ) {
    return { name: payload.name, nullable: payload.nullable }
  }
  return null
}

// ─────────────────────────────────────────────────────────
// Probe SQL builders — all strictly read-only `SELECT`s.
// ─────────────────────────────────────────────────────────

/**
 * Duplicate-key probe: groups rows by the key columns and returns any group
 * with more than one member — the rows that would violate a new UNIQUE / PK
 * (or a new UNIQUE INDEX).
 *
 * `predicate` carries a partial (predicated) UNIQUE INDEX's normalized
 * `WHERE` expression. A partial unique index only constrains the rows that
 * satisfy its predicate, so the probe MUST be restricted the same way —
 * otherwise duplicates outside the index's scope would be reported as
 * violations and a safe step would be blocked. Full indexes and constraints
 * pass `null` and group over the whole table.
 */
function buildDuplicateKeySql(
  table: string,
  columns: readonly string[],
  predicate: string | null = null,
): string {
  const cols = quoteColumns(columns)
  const where = predicate === null ? '' : ` WHERE ${predicate}`
  return `SELECT ${cols}, COUNT(*) AS count FROM ${quoteIdent(table)}${where} GROUP BY ${cols} HAVING COUNT(*) > 1`
}

/**
 * Orphan-FK probe: child rows whose (fully non-NULL) foreign-key value has no
 * matching parent row. NULL FK columns are allowed under MATCH SIMPLE, so a
 * row is only an orphan when every FK column is set yet no parent matches.
 */
function buildOrphanFkSql(childTable: string, fk: FkPayload): string {
  const joinPredicate = fk.columns
    .map((col, i) => {
      const refCol = fk.refColumns[i]
      if (refCol === undefined) {
        throw new Error(`FK column/refColumn arity mismatch on ${childTable}.${col}`)
      }
      return `c.${quoteIdent(col)} = p.${quoteIdent(refCol)}`
    })
    .join(' AND ')
  // No parent matched: the LEFT JOIN leaves the parent's first ref column NULL.
  const firstRefColumn = fk.refColumns[0]
  if (firstRefColumn === undefined) {
    throw new Error(`FK on ${childTable} has no reference columns`)
  }
  const noMatch = `p.${quoteIdent(firstRefColumn)} IS NULL`
  // FK actually set: every child FK column is non-NULL.
  const fkSet = fk.columns.map((col) => `c.${quoteIdent(col)} IS NOT NULL`).join(' AND ')
  return (
    `SELECT c.* FROM ${quoteIdent(childTable)} c ` +
    `LEFT JOIN ${quoteIdent(fk.refTable)} p ON ${joinPredicate} ` +
    `WHERE ${noMatch} AND ${fkSet}`
  )
}

/**
 * Existing-NULL probe: counts rows where the column is NULL — the rows that
 * would block adding a NOT NULL constraint to that column.
 */
function buildExistingNullSql(table: string, column: string): string {
  return `SELECT COUNT(*) AS count FROM ${quoteIdent(table)} WHERE ${quoteIdent(column)} IS NULL`
}

// ─────────────────────────────────────────────────────────
// Per-entry check derivation.
// ─────────────────────────────────────────────────────────

/**
 * Derive the `DataPreCheck` for a single additive diff entry, or `null` when
 * the entry needs no data pre-check (e.g. an additive but nullable column, or
 * a non-additive / unresolvable entry).
 */
function checkForEntry(entry: DiffEntry): DataPreCheck | null {
  if (entry.table === null) return null

  const table = entry.table

  // UNIQUE / PRIMARY KEY add -> duplicate-key check.
  if (
    entry.status === 'missing_on_branch' &&
    (entry.kind === 'unique' || entry.kind === 'primaryKey')
  ) {
    const columns = extractColumns(entry.canonical)
    if (columns.length === 0) return null
    const label = entry.kind === 'primaryKey' ? 'PRIMARY KEY' : 'UNIQUE'
    return {
      description: `Detect duplicate ${label} groups on ${table}(${columns.join(', ')}) before adding the constraint`,
      kind: 'duplicate_key',
      probeSql: buildDuplicateKeySql(table, columns),
    }
  }

  // UNIQUE INDEX add -> duplicate-key check (same guarantee as a UNIQUE
  // constraint: a `CREATE UNIQUE INDEX` fails on duplicate rows exactly as
  // `ADD CONSTRAINT ... UNIQUE` does). A PARTIAL unique index is handled by
  // scoping the probe to its predicate, so the check matches what Postgres
  // would actually enforce. Non-unique indexes get no check — no data can
  // violate them.
  if (entry.status === 'missing_on_branch' && entry.kind === 'index') {
    const idx = extractUniqueIndex(entry.canonical)
    if (idx === null) return null
    const scope = idx.predicate === null ? '' : ` WHERE ${idx.predicate}`
    return {
      description: `Detect duplicate UNIQUE INDEX groups on ${table}(${idx.columns.join(', ')})${scope} before creating the index`,
      kind: 'duplicate_key',
      probeSql: buildDuplicateKeySql(table, idx.columns, idx.predicate),
    }
  }

  // FOREIGN KEY add -> orphan-FK check.
  if (entry.status === 'missing_on_branch' && entry.kind === 'foreignKey') {
    const fk = extractFk(entry.canonical)
    if (fk === null) return null
    return {
      description: `Detect orphaned rows on ${table}(${fk.columns.join(', ')}) with no matching ${fk.refTable}(${fk.refColumns.join(', ')}) before adding the foreign key`,
      kind: 'orphan_fk',
      probeSql: buildOrphanFkSql(table, fk),
    }
  }

  // NOT NULL add -> existing-NULL check. Two cases:
  //   1. an added non-nullable column (missing_on_branch, canonical non-null)
  //   2. a divergent column nullable on branch but non-nullable in canonical
  if (entry.kind === 'column') {
    const canonical = extractColumn(entry.canonical)
    if (canonical === null || canonical.nullable) return null

    if (entry.status === 'missing_on_branch') {
      return {
        description: `Detect existing NULLs in ${table}.${canonical.name} before adding the NOT NULL column constraint`,
        kind: 'existing_null',
        probeSql: buildExistingNullSql(table, canonical.name),
      }
    }

    if (entry.status === 'divergent') {
      const branch = extractColumn(entry.branch)
      // Only an additive tightening (branch nullable -> canonical non-null).
      //
      // A divergent column DEFAULT needs NO data pre-check: `ALTER COLUMN ...
      // SET/DROP DEFAULT` only changes the expression applied to FUTURE
      // inserts, never rewrites existing rows, and cannot violate any
      // constraint — so no read-only probe could report a violation for it.
      if (branch?.nullable) {
        return {
          description: `Detect existing NULLs in ${table}.${canonical.name} before tightening the column to NOT NULL`,
          kind: 'existing_null',
          probeSql: buildExistingNullSql(table, canonical.name),
        }
      }
    }
  }

  return null
}

// ─────────────────────────────────────────────────────────
// PreChecker public surface.
// ─────────────────────────────────────────────────────────

/**
 * PURE: derive the read-only `DataPreCheck` predicates required to safely
 * apply the additive constraints in `diff`. Emits a `duplicate_key` check per
 * added UNIQUE/PK and per added UNIQUE INDEX (predicate-scoped when the index
 * is partial), an `orphan_fk` check per added FK, and an `existing_null` check
 * per added/tightened NOT NULL column. A divergent column DEFAULT needs none
 * (it rewrites no rows and can violate nothing). No I/O.
 */
function plan(diff: SchemaDiff): DataPreCheck[] {
  const checks: DataPreCheck[] = []
  for (const entry of diff.objects) {
    const check = checkForEntry(entry)
    if (check !== null) checks.push(check)
  }
  return checks
}

// Bound on the number of violating rows retained in a `PreCheckResult.sample`.
// Keeps the report readable and memory-bounded for large violation sets.
const SAMPLE_LIMIT = 20

/**
 * Coerce a pg `COUNT(*)` value to a number. pg returns `bigint` counts as
 * strings (e.g. `'5'`), so accept both `number` and `string`. Any other shape
 * yields `NaN`, which the caller treats as a fail-closed signal (never a
 * silent zero) so an unverifiable count cannot green-light a constraint.
 */
function coerceCount(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  return Number.NaN
}

/**
 * I/O: run a single check's read-only probe SQL and classify the result.
 *
 * Soundness (Property 4 / Req 5.7): a violation is reported iff one exists;
 * the probe is strictly read-only — `evaluate` NEVER mutates branch data.
 *
 * - `duplicate_key` / `orphan_fk`: each returned row is a violation. The
 *   `violationCount` is the row count and `passed` holds iff there are none.
 * - `existing_null`: the probe returns a single `COUNT(*)` row; the count is
 *   the `violationCount` (coerced from pg's string-typed bigint) and `passed`
 *   holds iff the count is zero. An unparseable count fails closed (`passed`
 *   stays false) so we never green-light a constraint we could not verify.
 */
async function evaluate(check: DataPreCheck, reader: ProbeReader): Promise<PreCheckResult> {
  const rows = await reader.query(check.probeSql)

  if (check.kind === 'existing_null') {
    const first = rows[0]
    const count = isRecord(first) ? coerceCount(first.count) : Number.NaN
    const passed = count === 0
    return {
      check,
      passed,
      sample: passed ? [] : rows.slice(0, SAMPLE_LIMIT),
      violationCount: Number.isNaN(count) ? rows.length : count,
    }
  }

  // duplicate_key / orphan_fk: each returned row is a distinct violation.
  return {
    check,
    passed: rows.length === 0,
    sample: rows.slice(0, SAMPLE_LIMIT),
    violationCount: rows.length,
  }
}

export const PreChecker = {
  evaluate,
  plan,
}
