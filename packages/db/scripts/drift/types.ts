/************************************************************
 * Schema Drift Remediation — shared data models (pure types).
 *
 * Single source of truth for the drift tooling under
 * `packages/db/scripts/drift/`. No runtime, no I/O — types only.
 *
 * Mirrors the design "Data Models" section of
 * `.kiro/specs/schema-drift-remediation/design.md`.
 ************************************************************/

// ─────────────────────────────────────────────────────────
// Referential actions (FK ON DELETE / ON UPDATE)
// ─────────────────────────────────────────────────────────

export type ReferentialAction = 'cascade' | 'restrict' | 'set null' | 'set default' | 'no action'

// ─────────────────────────────────────────────────────────
// SchemaFingerprint — normalized, order-independent schema description.
// Equality of two fingerprints ⇔ schemas are structurally identical.
// ─────────────────────────────────────────────────────────

export type SchemaFingerprint = {
  enums: EnumFp[] // sorted by name
  tables: TableFp[] // sorted by name
  version: 1 // fingerprint format version
}

export type EnumFp = {
  name: string
  labels: string[] // ordinal order preserved (label order is significant)
}

export type TableFp = {
  name: string
  columns: ColumnFp[] // sorted by name
  primaryKey: string[] | null // ordered column list (key order significant)
  uniques: ConstraintFp[] // sorted by normalized member list
  foreignKeys: FkFp[] // sorted by (columns, refTable, refColumns)
  indexes: IndexFp[] // sorted by normalized definition
}

export type ColumnFp = {
  name: string
  type: string // normalized: 'integer','text','timestamptz', ...
  nullable: boolean
  default: string | null // normalized default expression, null if none
}

export type ConstraintFp = { name: string | null; columns: string[] }

export type FkFp = {
  columns: string[]
  refTable: string
  refColumns: string[]
  onDelete: ReferentialAction
  onUpdate: ReferentialAction
}

export type IndexFp = {
  columns: string[]
  unique: boolean
  predicate: string | null // normalized partial-index WHERE, null if full
  method: string // 'btree','gin', ...
}

// ─────────────────────────────────────────────────────────
// Raw catalog rows — plain rows from information_schema / pg_catalog.
// Returned by `catalog-queries` with NO normalization.
// ─────────────────────────────────────────────────────────

export type TableRow = {
  table_name: string
}

export type ColumnRow = {
  table_name: string
  column_name: string
  data_type: string
  udt_name: string
  is_nullable: 'YES' | 'NO'
  column_default: string | null
  ordinal_position: number
}

export type PkRow = {
  table_name: string
  constraint_type: 'PRIMARY KEY'
  constraint_name: string
  column_name: string
  ordinal_position: number
}

export type UniqueRow = {
  table_name: string
  constraint_type: 'UNIQUE'
  constraint_name: string
  column_name: string
  ordinal_position: number
}

export type FkRow = {
  conname: string
  table_name: string
  ref_table: string
  confdeltype: string // pg single-char action code (a/r/c/n/d)
  confupdtype: string // pg single-char action code (a/r/c/n/d)
  conkey: number[] // child column attnums (ordered)
  confkey: number[] // referenced column attnums (ordered)
}

export type IndexRow = {
  table_name: string
  index_name: string
  indisunique: boolean
  method: string // am.amname: 'btree','gin', ...
  def: string // pg_get_indexdef(...)
  predicate: string | null // pg_get_expr(indpred, indrelid), null if full
}

export type EnumRow = {
  typname: string
  enumlabel: string
  enumsortorder: number
}

/** All raw catalog rows for one branch, grouped by object class. */
export type CatalogRows = {
  tables: TableRow[]
  columns: ColumnRow[]
  primaryKeys: PkRow[]
  uniques: UniqueRow[]
  foreignKeys: FkRow[]
  indexes: IndexRow[]
  enums: EnumRow[]
}

// ─────────────────────────────────────────────────────────
// SchemaDiff — total, symmetric structural diff between two fingerprints.
// ─────────────────────────────────────────────────────────

export type DiffKind = 'enum' | 'column' | 'primaryKey' | 'unique' | 'foreignKey' | 'index'

export type DiffStatus = 'missing_on_branch' | 'extra_on_branch' | 'divergent'

export type DiffEntry = {
  kind: DiffKind
  table: string | null
  object: string // identifying member list / name
  status: DiffStatus
  canonical: unknown | null
  branch: unknown | null
}

export type SchemaDiff = {
  fromCanonicalHash: string
  toBranchHash: string
  objects: DiffEntry[]
  isIdentical: boolean // objects.length === 0
}

// ─────────────────────────────────────────────────────────
// Reconciliation plan + data pre-checks.
// ─────────────────────────────────────────────────────────

export type DataPreCheckKind = 'duplicate_key' | 'orphan_fk' | 'existing_null'

export type DataPreCheck = {
  kind: DataPreCheckKind
  probeSql: string // read-only; returns violating rows/groups
  description: string
}

export type PreCheckResult = {
  check: DataPreCheck
  passed: boolean // true == safe to apply DDL
  violationCount: number
  sample: unknown[] // first N violating rows for the report
}

export type ReconcileStep = {
  id: string
  diff: DiffEntry
  ddl: string // idempotent (IF NOT EXISTS / guarded)
  preCheck: DataPreCheck | null
  order: number // enums < columns < pk/unique < index < fk
}

// ─────────────────────────────────────────────────────────
// Neon branch identifier alias.
// ─────────────────────────────────────────────────────────

export type BranchId = string
