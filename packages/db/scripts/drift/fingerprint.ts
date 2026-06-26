/************************************************************
 * Schema Drift Remediation — pure fingerprinter.
 *
 * Computes a deterministic, order-independent structural fingerprint of a
 * schema from raw catalog rows, plus stable serialization and hashing.
 *
 * PURE: no I/O. Same rows in any order -> identical fingerprint/hash.
 *
 * Mirrors design "Component 1: fingerprint" and the
 * "Validation / normalization rules" of
 * `.kiro/specs/schema-drift-remediation/design.md`.
 *
 * _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
 ************************************************************/

import { createHash } from 'node:crypto'
import type {
  CatalogRows,
  ColumnFp,
  ColumnRow,
  ConstraintFp,
  EnumFp,
  FkFp,
  FkRow,
  IndexFp,
  IndexRow,
  ReferentialAction,
  SchemaFingerprint,
  TableFp,
} from './types'

// ─────────────────────────────────────────────────────────
// Exclusions — environment-specific noise that must not count as schema.
//
// pg_cron stores its scheduling state in the `cron` schema (tables `job` /
// `job_run_details`). Catalog queries are `public`-scoped so these normally
// never appear, but we defensively drop them if they ever leak into `public`
// so drift in pg_cron bookkeeping never registers as a structural difference.
// ─────────────────────────────────────────────────────────

const PG_CRON_TABLES: ReadonlySet<string> = new Set(['job', 'job_run_details'])

// ─────────────────────────────────────────────────────────
// Type normalization — collapse pg type-spelling variants to one canonical form.
// ─────────────────────────────────────────────────────────

const UDT_TYPE_MAP: Readonly<Record<string, string>> = {
  int2: 'smallint',
  int4: 'integer',
  int8: 'bigint',
  serial: 'integer',
  serial4: 'integer',
  serial8: 'bigint',
  float4: 'real',
  float8: 'double precision',
  bool: 'boolean',
  bpchar: 'char',
  varchar: 'varchar',
  timestamptz: 'timestamptz',
  timestamp: 'timestamp',
  timetz: 'timetz',
  time: 'time',
  date: 'date',
  numeric: 'numeric',
  text: 'text',
  uuid: 'uuid',
  jsonb: 'jsonb',
  json: 'json',
  bytea: 'bytea',
}

/**
 * Normalize a column type to a single canonical spelling using `udt_name`
 * (e.g. `int4`->`integer`, `timestamptz` canonical, `_int4`->`integer[]`).
 * User-defined enum types (`data_type === 'USER-DEFINED'`) keep their type name.
 */
function normalizeType(udtName: string): string {
  let udt = udtName
  let suffix = ''
  // pg array types are prefixed with `_` (e.g. `_int4` === `integer[]`).
  if (udt.startsWith('_')) {
    udt = udt.slice(1)
    suffix = '[]'
  }
  const mapped = UDT_TYPE_MAP[udt] ?? udt
  return `${mapped}${suffix}`
}

/**
 * Normalize a default expression: trim, collapse whitespace runs, and unify
 * cast type-spelling so semantically identical defaults compare equal.
 */
function normalizeDefault(raw: string | null): string | null {
  if (raw === null) return null
  const collapsed = raw.trim().replace(/\s+/g, ' ')
  if (collapsed === '') return null
  return collapsed
    .replace(/::character varying/g, '::varchar')
    .replace(/::timestamp with time zone/g, '::timestamptz')
    .replace(/::timestamp without time zone/g, '::timestamp')
    .replace(/::time with time zone/g, '::timetz')
    .replace(/::time without time zone/g, '::time')
    .replace(/::bpchar/g, '::char')
}

// ─────────────────────────────────────────────────────────
// Referential action codes (pg single-char) -> ReferentialAction.
// ─────────────────────────────────────────────────────────

const FK_ACTION_MAP: Readonly<Record<string, ReferentialAction>> = {
  a: 'no action',
  r: 'restrict',
  c: 'cascade',
  n: 'set null',
  d: 'set default',
}

function normalizeFkAction(code: string): ReferentialAction {
  return FK_ACTION_MAP[code] ?? 'no action'
}

// ─────────────────────────────────────────────────────────
// Index column-list parsing from pg_get_indexdef output.
// ─────────────────────────────────────────────────────────

/**
 * Extract the index member list from a `pg_get_indexdef` definition, taking the
 * first top-level parenthesized group and splitting on top-level commas. Sort
 * direction / NULLS ordering / opclass modifiers are stripped per member.
 */
function parseIndexColumns(def: string): string[] {
  const start = def.indexOf('(')
  if (start === -1) return []
  let depth = 0
  let end = -1
  for (let i = start; i < def.length; i++) {
    const ch = def[i]
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end === -1) return []

  const inner = def.slice(start + 1, end)
  const parts: string[] = []
  let buf = ''
  let nested = 0
  for (const ch of inner) {
    if (ch === '(') nested++
    else if (ch === ')') nested--
    if (ch === ',' && nested === 0) {
      parts.push(buf)
      buf = ''
    } else {
      buf += ch
    }
  }
  if (buf.trim() !== '') parts.push(buf)

  return parts.map(normalizeIndexMember).filter((m) => m !== '')
}

function normalizeIndexMember(member: string): string {
  return member
    .trim()
    .replace(/\s+(ASC|DESC)\b/gi, '')
    .replace(/\s+NULLS\s+(FIRST|LAST)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizePredicate(predicate: string | null): string | null {
  if (predicate === null) return null
  const collapsed = predicate.trim().replace(/\s+/g, ' ')
  return collapsed === '' ? null : collapsed
}

// ─────────────────────────────────────────────────────────
// Sorting helpers — stable, name-based ordering.
// ─────────────────────────────────────────────────────────

function byString(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function sortedCopy(values: readonly string[]): string[] {
  return [...values].sort(byString)
}

// ─────────────────────────────────────────────────────────
// Per-object builders.
// ─────────────────────────────────────────────────────────

function buildEnums(rows: CatalogRows['enums']): EnumFp[] {
  const byName = new Map<string, { order: number; label: string }[]>()
  for (const row of rows) {
    const list = byName.get(row.typname) ?? []
    list.push({ order: row.enumsortorder, label: row.enumlabel })
    byName.set(row.typname, list)
  }

  const enums: EnumFp[] = []
  for (const [name, labels] of byName) {
    // Enum label order is semantically significant -> preserve ordinal order.
    const ordered = [...labels].sort((a, b) => a.order - b.order).map((l) => l.label)
    enums.push({ name, labels: ordered })
  }
  return enums.sort((a, b) => byString(a.name, b.name))
}

function buildColumns(rows: ColumnRow[]): ColumnFp[] {
  return rows
    .map<ColumnFp>((row) => ({
      name: row.column_name,
      type: normalizeType(row.udt_name),
      nullable: row.is_nullable === 'YES',
      default: normalizeDefault(row.column_default),
    }))
    .sort((a, b) => byString(a.name, b.name))
}

function buildPrimaryKey(rows: CatalogRows['primaryKeys']): string[] | null {
  if (rows.length === 0) return null
  // PK column order is semantically significant -> preserve ordinal order.
  return [...rows].sort((a, b) => a.ordinal_position - b.ordinal_position).map((r) => r.column_name)
}

function buildUniques(rows: CatalogRows['uniques']): ConstraintFp[] {
  const byConstraint = new Map<string, string[]>()
  for (const row of rows) {
    const cols = byConstraint.get(row.constraint_name) ?? []
    cols.push(row.column_name)
    byConstraint.set(row.constraint_name, cols)
  }

  const uniques: ConstraintFp[] = []
  for (const [name, cols] of byConstraint) {
    // Unique member order is NOT significant -> sort by name. Constraint name
    // is retained for report readability but excluded from structural equality
    // (see `serialize`).
    uniques.push({ name, columns: sortedCopy(cols) })
  }
  return uniques.sort((a, b) => byString(a.columns.join(','), b.columns.join(',')))
}

function buildForeignKeys(rows: FkRow[], attnumByTable: Map<string, Map<number, string>>): FkFp[] {
  const fks: FkFp[] = []
  for (const row of rows) {
    const childMap = attnumByTable.get(row.table_name) ?? new Map<number, string>()
    const refMap = attnumByTable.get(row.ref_table) ?? new Map<number, string>()

    // conkey<->confkey pairing is positional/significant -> preserve order.
    const columns = row.conkey.map((attnum) => childMap.get(attnum) ?? `att:${attnum}`)
    const refColumns = row.confkey.map((attnum) => refMap.get(attnum) ?? `att:${attnum}`)

    fks.push({
      columns,
      refTable: row.ref_table,
      refColumns,
      onDelete: normalizeFkAction(row.confdeltype),
      onUpdate: normalizeFkAction(row.confupdtype),
    })
  }
  return fks.sort((a, b) =>
    byString(
      `${a.columns.join(',')}|${a.refTable}|${a.refColumns.join(',')}`,
      `${b.columns.join(',')}|${b.refTable}|${b.refColumns.join(',')}`,
    ),
  )
}

function buildIndexes(rows: IndexRow[]): IndexFp[] {
  return rows
    .map<IndexFp>((row) => ({
      // Index members are sorted by name per the normalization rules.
      columns: sortedCopy(parseIndexColumns(row.def)),
      unique: row.indisunique,
      predicate: normalizePredicate(row.predicate),
      method: row.method,
    }))
    .sort((a, b) =>
      byString(
        `${a.columns.join(',')}|${a.method}|${a.unique}|${a.predicate ?? ''}`,
        `${b.columns.join(',')}|${b.method}|${b.unique}|${b.predicate ?? ''}`,
      ),
    )
}

/**
 * Build an attnum -> column-name map per table. `information_schema.columns`
 * `ordinal_position` equals the `pg_attribute.attnum` for live (non-dropped)
 * columns, so FK `conkey`/`confkey` attnums resolve through it.
 */
function buildAttnumIndex(columns: ColumnRow[]): Map<string, Map<number, string>> {
  const byTable = new Map<string, Map<number, string>>()
  for (const col of columns) {
    const map = byTable.get(col.table_name) ?? new Map<number, string>()
    map.set(col.ordinal_position, col.column_name)
    byTable.set(col.table_name, map)
  }
  return byTable
}

// ─────────────────────────────────────────────────────────
// Fingerprinter public surface.
// ─────────────────────────────────────────────────────────

/**
 * Build a normalized, order-independent `SchemaFingerprint` from raw catalog
 * rows. Tables/columns/constraints/index-members are sorted by name; ordinal
 * order is preserved for PK columns, FK column<->refColumn pairings, and enum
 * labels. Constraint names, OIDs, comment timestamps, and pg_cron rows are
 * excluded from the structure.
 */
function build(rows: CatalogRows): SchemaFingerprint {
  const attnumByTable = buildAttnumIndex(rows.columns)

  const tableNames = rows.tables
    .map((t) => t.table_name)
    .filter((name) => !PG_CRON_TABLES.has(name))

  const tables: TableFp[] = tableNames
    .map<TableFp>((name) => ({
      name,
      columns: buildColumns(rows.columns.filter((c) => c.table_name === name)),
      primaryKey: buildPrimaryKey(rows.primaryKeys.filter((p) => p.table_name === name)),
      uniques: buildUniques(rows.uniques.filter((u) => u.table_name === name)),
      foreignKeys: buildForeignKeys(
        rows.foreignKeys.filter((f) => f.table_name === name),
        attnumByTable,
      ),
      indexes: buildIndexes(rows.indexes.filter((i) => i.table_name === name)),
    }))
    .sort((a, b) => byString(a.name, b.name))

  return {
    enums: buildEnums(rows.enums),
    tables,
    version: 1,
  }
}

/**
 * Stable canonical-JSON serialization with deterministic, recursively sorted
 * object keys. Constraint names are stripped here so structural identity —
 * never auto-generated naming — drives equality and hashing.
 */
function serialize(fp: SchemaFingerprint): string {
  const canonical = {
    enums: fp.enums.map((e) => ({ labels: e.labels, name: e.name })),
    tables: fp.tables.map((t) => ({
      columns: t.columns.map((c) => ({
        default: c.default,
        name: c.name,
        nullable: c.nullable,
        type: c.type,
      })),
      foreignKeys: t.foreignKeys.map((f) => ({
        columns: f.columns,
        onDelete: f.onDelete,
        onUpdate: f.onUpdate,
        refColumns: f.refColumns,
        refTable: f.refTable,
      })),
      indexes: t.indexes.map((i) => ({
        columns: i.columns,
        method: i.method,
        predicate: i.predicate,
        unique: i.unique,
      })),
      name: t.name,
      // Constraint names excluded from structural equality.
      primaryKey: t.primaryKey,
      uniques: t.uniques.map((u) => ({ columns: u.columns })),
    })),
    version: fp.version,
  }
  return stableStringify(canonical)
}

/** sha256 of the stable serialization. */
function hash(fp: SchemaFingerprint): string {
  return createHash('sha256').update(serialize(fp)).digest('hex')
}

/**
 * Deterministic JSON stringify with recursively sorted object keys. Arrays
 * preserve order (callers pre-sort where order is insignificant; PK/FK/enum
 * ordering is intentionally preserved).
 */
function stableStringify(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort(byString)
    const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

export const Fingerprinter = {
  build,
  hash,
  serialize,
}
