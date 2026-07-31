/************************************************************
 * Schema Drift Remediation — ordered, idempotent reconciler.
 *
 * Turns a `SchemaDiff` into an ordered, idempotent `ReconcileStep[]` plan of
 * corrective DDL that pulls a branch toward the canonical schema.
 *
 * PURE: no I/O. Deterministic — same diff always yields the same plan.
 *
 * Design contract (see `.kiro/specs/schema-drift-remediation/design.md`,
 * "Component 5: reconcile", the `ReconcileStep` data model, Properties 5 & 7,
 * Error Handling Scenario 2):
 *   - Emit guarded, idempotent corrective DDL for `missing_on_branch` objects
 *     (Property 5: applying the plan twice == once). Every statement is guarded
 *     by `IF NOT EXISTS` or a catalog existence probe.
 *   - Order steps via `step.order` so dependencies always exist first
 *     (Property 7): enums(0) -> columns(1) -> pk/unique(2) -> indexes(3) -> fks(4).
 *   - NEVER emit `drizzle-kit push` (it partial-applied; that is why this module
 *     exists).
 *   - Bind each step to its `DataPreCheck` (the SAME check `precheck.plan` would
 *     generate) so DDL is gated and skippable on a data violation. That includes
 *     an added UNIQUE INDEX, which is gated by a `duplicate_key` check exactly
 *     like an added UNIQUE constraint (its backing index surfaces as its own
 *     diff entry, so it must carry its own gate).
 *   - `divergent` columns are corrected additively: a nullable -> NOT NULL
 *     tightening AND a differing column DEFAULT (`SET DEFAULT` / `DROP DEFAULT`,
 *     derived from the canonical fingerprint, needing no data pre-check).
 *   - `divergent` PRIMARY KEY redefinition is modeled as drop-then-add gated by
 *     an explicit pre-check and FLAGGED `-- OPERATOR-CONFIRM:` — never
 *     auto-applied (the statements are emitted commented out).
 *   - This is an ADDITIVE reconciliation: `extra_on_branch` objects are reported
 *     elsewhere but never dropped here (safe, non-destructive).
 *
 * _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
 ************************************************************/

import { createHash } from 'node:crypto'
import { PreChecker } from './precheck'
import type { DataPreCheck, DiffEntry, ReconcileStep, ReferentialAction, SchemaDiff } from './types'

// ─────────────────────────────────────────────────────────
// Step ordering — dependency layers (Property 7).
// ─────────────────────────────────────────────────────────

const ORDER = {
  enum: 0,
  column: 1,
  pkUnique: 2,
  index: 3,
  foreignKey: 4,
} as const

// Postgres identifier length limit; names are truncated + hashed past this.
const PG_NAME_MAX = 63

// ─────────────────────────────────────────────────────────
// Identifier / literal quoting. Schema identifiers come from our own catalog
// (not user input) but are still double-quoted + escaped so generated SQL is
// safe and handles any casing / reserved words. String literals are single-
// quoted with doubled embedded quotes.
// ─────────────────────────────────────────────────────────

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function quoteColumns(columns: readonly string[]): string {
  return columns.map(quoteIdent).join(', ')
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** A `name[]` array literal of column names, used inside catalog probes. */
function nameArrayLiteral(columns: readonly string[]): string {
  return `ARRAY[${columns.map(quoteLiteral).join(', ')}]::name[]`
}

/**
 * Build a deterministic, collision-resistant identifier <= 63 chars. When the
 * readable base fits it is used verbatim; otherwise it is truncated and a short
 * content hash is appended so distinct objects keep distinct names (important
 * for partial indexes that share a column list but differ by predicate).
 */
function boundedName(base: string, entropy: string): string {
  if (base.length <= PG_NAME_MAX) return base
  const suffix = createHash('sha256').update(`${base}|${entropy}`).digest('hex').slice(0, 8)
  return `${base.slice(0, PG_NAME_MAX - suffix.length - 1)}_${suffix}`
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Stable, human-readable step id derived from the diff entry identity. */
function stepId(entry: DiffEntry): string {
  return slugify(`${entry.kind}-${entry.table ?? 'schema'}-${entry.object}-${entry.status}`)
}

// ─────────────────────────────────────────────────────────
// Referential action -> SQL clause.
// ─────────────────────────────────────────────────────────

const FK_ACTION_SQL: Readonly<Record<ReferentialAction, string>> = {
  'no action': 'NO ACTION',
  restrict: 'RESTRICT',
  cascade: 'CASCADE',
  'set null': 'SET NULL',
  'set default': 'SET DEFAULT',
}

// ─────────────────────────────────────────────────────────
// Defensive payload extractors — `DiffEntry.canonical` / `.branch` are typed
// `unknown` (the `diff` module embeds the fingerprint `*Fp` shapes). These
// guards pull each shape without resorting to `any`.
// ─────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

type EnumPayload = { name: string; labels: string[] }

function extractEnum(payload: unknown): EnumPayload | null {
  if (isRecord(payload) && typeof payload.name === 'string' && isStringArray(payload.labels)) {
    return { name: payload.name, labels: payload.labels }
  }
  return null
}

type ColumnPayload = { name: string; type: string; nullable: boolean; default: string | null }

function extractColumn(payload: unknown): ColumnPayload | null {
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

/** PK payload is a bare ordered column list (`string[]`). */
function extractColumnList(payload: unknown): string[] | null {
  if (isStringArray(payload) && payload.length > 0) return payload
  if (isRecord(payload) && isStringArray(payload.columns) && payload.columns.length > 0) {
    return payload.columns
  }
  return null
}

type FkPayload = {
  columns: string[]
  refTable: string
  refColumns: string[]
  onDelete: ReferentialAction
  onUpdate: ReferentialAction
}

function isReferentialAction(value: unknown): value is ReferentialAction {
  return typeof value === 'string' && value in FK_ACTION_SQL
}

function extractFk(payload: unknown): FkPayload | null {
  if (
    isRecord(payload) &&
    isStringArray(payload.columns) &&
    typeof payload.refTable === 'string' &&
    isStringArray(payload.refColumns) &&
    isReferentialAction(payload.onDelete) &&
    isReferentialAction(payload.onUpdate) &&
    payload.columns.length > 0 &&
    payload.columns.length === payload.refColumns.length
  ) {
    return {
      columns: payload.columns,
      refTable: payload.refTable,
      refColumns: payload.refColumns,
      onDelete: payload.onDelete,
      onUpdate: payload.onUpdate,
    }
  }
  return null
}

type IndexPayload = {
  columns: string[]
  unique: boolean
  predicate: string | null
  method: string
}

function extractIndex(payload: unknown): IndexPayload | null {
  if (
    isRecord(payload) &&
    isStringArray(payload.columns) &&
    typeof payload.unique === 'boolean' &&
    typeof payload.method === 'string' &&
    (payload.predicate === null || typeof payload.predicate === 'string') &&
    payload.columns.length > 0
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
// Pre-check binding — reuse `PreChecker.plan` so each step's `preCheck` is
// byte-identical to what the precheck module would independently generate for
// the same object. We run it over a single-entry diff and take the first
// (and only) derived check.
// ─────────────────────────────────────────────────────────

function preCheckFor(entry: DiffEntry): DataPreCheck | null {
  const singleton: SchemaDiff = {
    fromCanonicalHash: '',
    toBranchHash: '',
    objects: [entry],
    isIdentical: false,
  }
  return PreChecker.plan(singleton)[0] ?? null
}

// ─────────────────────────────────────────────────────────
// Catalog existence probes (used to make non-`IF NOT EXISTS` DDL idempotent).
// ─────────────────────────────────────────────────────────

const NL = '\n'

function pkExistsProbe(table: string): string {
  return [
    'SELECT 1 FROM pg_constraint con',
    'JOIN pg_class c ON c.oid = con.conrelid',
    'JOIN pg_namespace n ON n.oid = c.relnamespace',
    `WHERE n.nspname = 'public' AND c.relname = ${quoteLiteral(table)} AND con.contype = 'p'`,
  ].join(` ${NL}      `)
}

function uniqueExistsProbe(table: string, sortedColumns: readonly string[]): string {
  return [
    'SELECT 1 FROM pg_constraint con',
    'JOIN pg_class c ON c.oid = con.conrelid',
    'JOIN pg_namespace n ON n.oid = c.relnamespace',
    `WHERE n.nspname = 'public' AND c.relname = ${quoteLiteral(table)} AND con.contype = 'u'`,
    '  AND (',
    '    SELECT array_agg(a.attname ORDER BY a.attname)',
    '    FROM unnest(con.conkey) AS k(attnum)',
    '    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum',
    `  ) = ${nameArrayLiteral(sortedColumns)}`,
  ].join(` ${NL}      `)
}

function fkExistsProbe(table: string, refTable: string, orderedColumns: readonly string[]): string {
  return [
    'SELECT 1 FROM pg_constraint con',
    'JOIN pg_class c ON c.oid = con.conrelid',
    'JOIN pg_class rc ON rc.oid = con.confrelid',
    'JOIN pg_namespace n ON n.oid = c.relnamespace',
    `WHERE n.nspname = 'public' AND c.relname = ${quoteLiteral(table)}`,
    `  AND rc.relname = ${quoteLiteral(refTable)} AND con.contype = 'f'`,
    '  AND (',
    '    SELECT array_agg(a.attname ORDER BY k.ord)',
    '    FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)',
    '    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum',
    `  ) = ${nameArrayLiteral(orderedColumns)}`,
  ].join(` ${NL}      `)
}

function guardedDo(probe: string, body: string): string {
  return `DO $$ BEGIN${NL}  IF NOT EXISTS (${NL}      ${probe}${NL}  ) THEN${NL}    ${body}${NL}  END IF;${NL}END $$;`
}

// ─────────────────────────────────────────────────────────
// DDL builders per object kind. Each returns the corrective DDL string, or
// null when the entry needs no executable step (e.g. unresolved payload or a
// divergence outside the additive scope).
// ─────────────────────────────────────────────────────────

function enumDdl(entry: DiffEntry): string | null {
  // Missing enum type: create it, swallowing a concurrent duplicate so the
  // step is idempotent.
  if (entry.status === 'missing_on_branch') {
    const e = extractEnum(entry.canonical)
    if (e === null) return null
    const labels = e.labels.map(quoteLiteral).join(', ')
    return [
      'DO $$ BEGIN',
      `  CREATE TYPE ${quoteIdent(e.name)} AS ENUM (${labels});`,
      'EXCEPTION WHEN duplicate_object THEN null;',
      'END $$;',
    ].join(NL)
  }

  // Divergent enum: additively add any canonical labels missing on the branch
  // (`ADD VALUE IF NOT EXISTS` is idempotent). Label removals/reorders are not
  // additive and are reported, not auto-applied.
  if (entry.status === 'divergent') {
    const canonical = extractEnum(entry.canonical)
    const branch = extractEnum(entry.branch)
    if (canonical === null || branch === null) return null
    const branchLabels = new Set(branch.labels)
    const missing = canonical.labels.filter((l) => !branchLabels.has(l))
    if (missing.length === 0) return null
    return missing
      .map(
        (label) =>
          `ALTER TYPE ${quoteIdent(canonical.name)} ADD VALUE IF NOT EXISTS ${quoteLiteral(label)};`,
      )
      .join(NL)
  }

  return null
}

function columnDdl(entry: DiffEntry): string | null {
  const canonical = extractColumn(entry.canonical)
  if (canonical === null || entry.table === null) return null
  const table = quoteIdent(entry.table)
  const col = quoteIdent(canonical.name)

  // Missing column: additive `ADD COLUMN IF NOT EXISTS`, faithfully carrying
  // the canonical type, NOT NULL flag, and default expression.
  if (entry.status === 'missing_on_branch') {
    const parts = [`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${canonical.type}`]
    if (canonical.default !== null) parts.push(`DEFAULT ${canonical.default}`)
    if (!canonical.nullable) parts.push('NOT NULL')
    return `${parts.join(' ')};`
  }

  // Divergent column: the additive tightening (branch nullable -> canonical
  // NOT NULL) and the column DEFAULT are auto-corrected. Both are ABSOLUTE
  // assignments in Postgres and therefore inherently idempotent (Req 6.1): a
  // second `SET NOT NULL` / `SET DEFAULT` / `DROP DEFAULT` is a no-op, so no
  // `IF NOT EXISTS` guard is available or needed.
  //
  // A DEFAULT change needs NO data pre-check: it only changes the expression
  // applied to FUTURE inserts, never rewrites existing rows, and cannot violate
  // a constraint — so `preCheckFor` correctly binds `null` for a default-only
  // divergence. The expression is taken verbatim from the CANONICAL fingerprint
  // (already normalized by `fingerprint.ts`); no column or value is hard-coded.
  //
  // A type divergence stays out of scope (a rewrite, not an additive fix) and is
  // reported rather than auto-applied.
  if (entry.status === 'divergent') {
    const branch = extractColumn(entry.branch)
    if (branch === null) return null

    // Multiple actions in ONE `ALTER TABLE` statement: neon-http has no
    // interactive transactions and executes a single statement per call, so a
    // column that diverges in BOTH nullability and default must still be one
    // statement.
    const actions: string[] = []
    if (branch.nullable && !canonical.nullable) {
      actions.push(`ALTER COLUMN ${col} SET NOT NULL`)
    }
    if (canonical.default !== branch.default) {
      actions.push(
        canonical.default === null
          ? `ALTER COLUMN ${col} DROP DEFAULT`
          : `ALTER COLUMN ${col} SET DEFAULT ${canonical.default}`,
      )
    }
    if (actions.length === 0) return null
    return `ALTER TABLE ${table} ${actions.join(', ')};`
  }

  return null
}

function primaryKeyDdl(entry: DiffEntry): string | null {
  if (entry.table === null) return null
  const table = quoteIdent(entry.table)

  // Missing PK: add it, guarded by a catalog probe (PK has no native
  // IF NOT EXISTS; a table has at most one PK so contype='p' existence suffices).
  if (entry.status === 'missing_on_branch') {
    const columns = extractColumnList(entry.canonical)
    if (columns === null) return null
    const body = `ALTER TABLE ${table} ADD PRIMARY KEY (${quoteColumns(columns)});`
    return guardedDo(pkExistsProbe(entry.table), body)
  }

  // Divergent PK: a redefinition on in-use key columns. Modeled as drop-then-add
  // gated by an explicit duplicate_key pre-check and FLAGGED operator-confirmed.
  // The statements are emitted COMMENTED OUT so they never auto-apply
  // (Requirement 6.6 / Error Handling Scenario 2).
  if (entry.status === 'divergent') {
    const columns = extractColumnList(entry.canonical)
    if (columns === null) return null
    return [
      `-- OPERATOR-CONFIRM: PRIMARY KEY on ${table} diverges from canonical and requires redefinition.`,
      '-- Redefining a PRIMARY KEY drops and re-adds the constraint on in-use key columns and is',
      '-- NOT applied automatically. Review the bound duplicate_key pre-check, then run manually:',
      `--   ALTER TABLE ${table} DROP CONSTRAINT <existing_primary_key_name>;`,
      `--   ALTER TABLE ${table} ADD PRIMARY KEY (${quoteColumns(columns)});`,
    ].join(NL)
  }

  return null
}

function uniqueDdl(entry: DiffEntry): string | null {
  if (entry.status !== 'missing_on_branch' || entry.table === null) return null
  const columns = extractColumnList(entry.canonical)
  if (columns === null) return null
  // Unique member order is insignificant -> sort for a stable name and probe.
  const sorted = [...columns].sort()
  const name = boundedName(`${entry.table}_${sorted.join('_')}_key`, 'unique')
  const body = `ALTER TABLE ${quoteIdent(entry.table)} ADD CONSTRAINT ${quoteIdent(name)} UNIQUE (${quoteColumns(sorted)});`
  return guardedDo(uniqueExistsProbe(entry.table, sorted), body)
}

function indexDdl(entry: DiffEntry): string | null {
  if (entry.status !== 'missing_on_branch' || entry.table === null) return null
  const idx = extractIndex(entry.canonical)
  if (idx === null) return null
  const unique = idx.unique ? 'UNIQUE ' : ''
  const name = boundedName(
    `${entry.table}_${idx.columns.join('_')}_${idx.unique ? 'uniq' : 'idx'}`,
    `${idx.method}|${idx.predicate ?? ''}`,
  )
  const where = idx.predicate === null ? '' : ` WHERE ${idx.predicate}`
  return `CREATE ${unique}INDEX IF NOT EXISTS ${quoteIdent(name)} ON ${quoteIdent(entry.table)} USING ${idx.method} (${quoteColumns(idx.columns)})${where};`
}

function foreignKeyDdl(entry: DiffEntry): string | null {
  if (entry.status !== 'missing_on_branch' || entry.table === null) return null
  const fk = extractFk(entry.canonical)
  if (fk === null) return null
  const name = boundedName(`${entry.table}_${fk.columns.join('_')}_fkey`, fk.refTable)
  const body =
    `ALTER TABLE ${quoteIdent(entry.table)} ADD CONSTRAINT ${quoteIdent(name)} ` +
    `FOREIGN KEY (${quoteColumns(fk.columns)}) ` +
    `REFERENCES ${quoteIdent(fk.refTable)} (${quoteColumns(fk.refColumns)}) ` +
    `ON DELETE ${FK_ACTION_SQL[fk.onDelete]} ON UPDATE ${FK_ACTION_SQL[fk.onUpdate]};`
  return guardedDo(fkExistsProbe(entry.table, fk.refTable, fk.columns), body)
}

// ─────────────────────────────────────────────────────────
// Per-entry step construction.
// ─────────────────────────────────────────────────────────

function buildStep(entry: DiffEntry): ReconcileStep | null {
  let ddl: string | null = null
  let order: number

  switch (entry.kind) {
    case 'enum':
      ddl = enumDdl(entry)
      order = ORDER.enum
      break
    case 'column':
      ddl = columnDdl(entry)
      order = ORDER.column
      break
    case 'primaryKey':
      ddl = primaryKeyDdl(entry)
      order = ORDER.pkUnique
      break
    case 'unique':
      ddl = uniqueDdl(entry)
      order = ORDER.pkUnique
      break
    case 'index':
      ddl = indexDdl(entry)
      order = ORDER.index
      break
    case 'foreignKey':
      ddl = foreignKeyDdl(entry)
      order = ORDER.foreignKey
      break
    default:
      return null
  }

  if (ddl === null) return null

  // Bind the pre-check. For the operator-confirmed PK redefinition, gate with
  // the explicit duplicate_key check the precheck module emits for that PK's
  // columns (derived by probing as if the PK were being added).
  const preCheckSource: DiffEntry =
    entry.kind === 'primaryKey' && entry.status === 'divergent'
      ? { ...entry, status: 'missing_on_branch' }
      : entry

  return {
    id: stepId(entry),
    diff: entry,
    ddl,
    preCheck: preCheckFor(preCheckSource),
    order,
  }
}

// ─────────────────────────────────────────────────────────
// Reconciler public surface.
// ─────────────────────────────────────────────────────────

/**
 * PURE: turn a `SchemaDiff` into an ordered, idempotent reconciliation plan.
 *
 * Emits guarded, idempotent corrective DDL for `missing_on_branch` objects and
 * additive enum-label / NOT NULL / column-DEFAULT corrections; models divergent PRIMARY KEY
 * redefinition as an operator-confirmed (commented, never auto-applied)
 * drop-then-add; and leaves `extra_on_branch` objects untouched (additive-only,
 * non-destructive). Steps are ordered enums -> columns -> pk/unique -> indexes
 * -> foreign keys via `step.order` (Property 7) and bound to the `DataPreCheck`
 * the precheck module would generate (Requirement 6.5). Never emits
 * `drizzle-kit push`.
 */
function plan(diff: SchemaDiff): ReconcileStep[] {
  const steps: ReconcileStep[] = []
  for (const entry of diff.objects) {
    const step = buildStep(entry)
    if (step !== null) steps.push(step)
  }
  // Stable ordering: primary by dependency layer, secondary by id.
  return steps.sort((a, b) =>
    a.order !== b.order ? a.order - b.order : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )
}

export const Reconciler = {
  plan,
}
