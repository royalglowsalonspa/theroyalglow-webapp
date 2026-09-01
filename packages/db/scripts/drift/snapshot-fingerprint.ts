/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/snapshot-fingerprint
 * Scope        : Schema Drift Remediation — DB-free canonical reference
 *
 * Description  : Derives a deterministic `SchemaFingerprint` from the COMMITTED
 *                Drizzle snapshot JSON (`packages/db/migrations/meta/
 *                <NNNN>_snapshot.json`, drizzle pg snapshot format v7) WITHOUT a
 *                live database. CI has no Neon branch available, so the live
 *                catalog derivation in `canonical.ts` cannot run there; this
 *                module reads only committed files and produces a stable hash.
 *
 *                The snapshot index is resolved from the migration journal so the
 *                fingerprint always tracks the LATEST migration. See
 *                `resolveLatestSnapshotPath` for why pinning to `0000` would
 *                silently break the gate once a second migration exists.
 *
 *                The snapshot is mapped into the SAME normalized
 *                `SchemaFingerprint` structure the catalog `Fingerprinter`
 *                produces, and the hash is computed with the shared
 *                `Fingerprinter.serialize` / `Fingerprinter.hash`. Because the
 *                snapshot spellings (e.g. `timestamp with time zone`) and the
 *                live-catalog spellings (`timestamptz`) differ, exact
 *                cross-source hash-equality with `canonical.ts` is NOT claimed.
 *
 *                AUTHORITATIVE REFERENCE: the snapshot-derived fingerprint is
 *                the committed source of truth for the DB-free CI drift gate. It
 *                changes if and only if the committed snapshot changes — which
 *                only happens via `drizzle-kit generate` after an intentional
 *                schema edit (followed by regenerating the reference artifact).
 *
 * Responsibilities :
 * - snapshotToFingerprint    : drizzle snapshot object -> SchemaFingerprint
 * - deriveSnapshotFingerprint: read committed snapshot file -> fingerprint+hash
 *
 * Tech Stack   : TypeScript (strict), Node fs (read-only)
 * Layer        : Data Access (control plane / derivation, DB-free)
 *
 * Dependencies : ./types, ./fingerprint
 *
 * Notes        : PURE w.r.t. the DB — performs NO database or network I/O. The
 *                only side effect is a synchronous read of a committed file.
 *
 * _Requirements: 12.4, 12.5_
 ************************************************************/

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Fingerprinter } from './fingerprint'
import type {
  ColumnFp,
  ConstraintFp,
  EnumFp,
  FkFp,
  IndexFp,
  ReferentialAction,
  SchemaFingerprint,
  TableFp,
} from './types'

// ─────────────────────────────────────────────────────────
// Committed snapshot location.
//
// Resolved from this file (scripts/drift) -> migrations/meta/<NNNN>_snapshot.json.
//
// IMPORTANT: this MUST track the LATEST snapshot, not `0000_snapshot.json`.
// `drizzle-kit generate` writes a NEW `<NNNN>_snapshot.json` per migration and
// does NOT rewrite earlier ones. Pinning to `0000` was correct only while the
// baseline was the sole migration; from the second migration onward it would
// freeze the drift reference at the baseline schema, so the CI drift gate would
// keep passing while the real schema moved — a silent false pass. The authoritative
// snapshot index is therefore read from the migration journal.
// ─────────────────────────────────────────────────────────

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

/** Directory holding the drizzle migration journal and per-migration snapshots. */
export const MIGRATIONS_META_DIR = resolve(MODULE_DIR, '../../migrations/meta')

/** Path to the drizzle migration journal that records every applied migration. */
export const JOURNAL_PATH = resolve(MIGRATIONS_META_DIR, '_journal.json')

/** Minimal structural typing for the drizzle migration journal (format v7). */
type DrizzleJournal = {
  entries?: { idx?: number; tag?: string }[]
}

/**
 * Resolve the path of the LATEST committed drizzle snapshot by reading the
 * migration journal and selecting its highest `idx` entry.
 *
 * Drizzle names snapshots `<idx zero-padded to 4>_snapshot.json`, matching the
 * migration tag prefix (e.g. journal idx `1` for tag `0001_add_account_issuer`
 * pairs with `0001_snapshot.json`).
 *
 * @throws when the journal is missing, malformed, or records no entries — the
 *   drift gate must fail loudly rather than silently fall back to a stale
 *   snapshot.
 */
export function resolveLatestSnapshotPath(): string {
  let journal: DrizzleJournal
  try {
    journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as DrizzleJournal
  } catch (cause) {
    throw new Error(
      `Unable to read the drizzle migration journal at ${JOURNAL_PATH}. ` +
        'The DB-free drift gate cannot determine the canonical snapshot without it.',
      { cause },
    )
  }

  const indices = (journal.entries ?? [])
    .map((entry) => entry.idx)
    .filter((idx): idx is number => typeof idx === 'number' && Number.isInteger(idx) && idx >= 0)

  if (indices.length === 0) {
    throw new Error(
      `The drizzle migration journal at ${JOURNAL_PATH} records no migration entries. ` +
        'Run `bun run generate` to create the baseline migration before deriving a fingerprint.',
    )
  }

  const latestIdx = Math.max(...indices)
  return resolve(MIGRATIONS_META_DIR, `${String(latestIdx).padStart(4, '0')}_snapshot.json`)
}

// ─────────────────────────────────────────────────────────
// Drizzle pg snapshot (format v7) — minimal structural typing.
//
// Only the fields that carry structural meaning are modeled; everything else
// in the snapshot (ids, `policies`, `checkConstraints`, `_meta`, ...) is
// intentionally ignored so it never influences the fingerprint.
// ─────────────────────────────────────────────────────────

export type SnapshotColumn = {
  name: string
  type: string
  typeSchema?: string
  primaryKey?: boolean
  notNull?: boolean
  default?: string | number | boolean | null
}

export type SnapshotIndexColumn = {
  expression: string
  isExpression: boolean
}

export type SnapshotIndex = {
  name: string
  columns: SnapshotIndexColumn[]
  isUnique: boolean
  where?: string
  method: string
}

export type SnapshotForeignKey = {
  name: string
  tableFrom: string
  tableTo: string
  columnsFrom: string[]
  columnsTo: string[]
  onDelete?: string
  onUpdate?: string
}

export type SnapshotCompositePk = {
  name: string
  columns: string[]
}

export type SnapshotUnique = {
  name: string
  columns: string[]
  nullsNotDistinct?: boolean
}

export type SnapshotTable = {
  name: string
  schema: string
  columns: Record<string, SnapshotColumn>
  indexes: Record<string, SnapshotIndex>
  foreignKeys: Record<string, SnapshotForeignKey>
  compositePrimaryKeys: Record<string, SnapshotCompositePk>
  uniqueConstraints: Record<string, SnapshotUnique>
}

export type SnapshotEnum = {
  name: string
  schema: string
  values: string[]
}

export type DrizzleSnapshot = {
  version: string
  dialect: string
  tables: Record<string, SnapshotTable>
  enums: Record<string, SnapshotEnum>
}

// ─────────────────────────────────────────────────────────
// Normalization — collapse snapshot spellings to a single canonical form so
// the fingerprint is stable across cosmetically-different but identical schema.
// ─────────────────────────────────────────────────────────

const SNAPSHOT_TYPE_MAP: Readonly<Record<string, string>> = {
  'timestamp with time zone': 'timestamptz',
  'timestamp without time zone': 'timestamp',
  'time with time zone': 'timetz',
  'time without time zone': 'time',
  'character varying': 'varchar',
  character: 'char',
}

/**
 * Normalize a snapshot column type. Enum-typed columns carry the enum's name
 * (e.g. `booking_status`) and are passed through unchanged; built-in types are
 * collapsed to a single canonical spelling.
 */
function normalizeType(type: string): string {
  const lower = type.trim().toLowerCase()
  return SNAPSHOT_TYPE_MAP[lower] ?? lower
}

/** Normalize a default expression: stringify, trim, collapse whitespace runs. */
function normalizeDefault(raw: string | number | boolean | null | undefined): string | null {
  if (raw === undefined || raw === null) return null
  const collapsed = String(raw).trim().replace(/\s+/g, ' ')
  return collapsed === '' ? null : collapsed
}

const FK_ACTIONS: ReadonlySet<string> = new Set([
  'cascade',
  'restrict',
  'set null',
  'set default',
  'no action',
])

/** Normalize a snapshot FK action; unknown / missing actions become `no action`. */
function normalizeFkAction(action: string | undefined): ReferentialAction {
  if (action === undefined) return 'no action'
  const lower = action.trim().toLowerCase()
  return (FK_ACTIONS.has(lower) ? lower : 'no action') as ReferentialAction
}

/** Normalize a partial-index predicate: trim + collapse whitespace, null if full. */
function normalizePredicate(predicate: string | undefined): string | null {
  if (predicate === undefined) return null
  const collapsed = predicate.trim().replace(/\s+/g, ' ')
  return collapsed === '' ? null : collapsed
}

// ─────────────────────────────────────────────────────────
// Stable, name-based ordering (mirrors `fingerprint.ts`).
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

function buildColumns(columns: Record<string, SnapshotColumn>): ColumnFp[] {
  return Object.values(columns)
    .map<ColumnFp>((col) => ({
      name: col.name,
      type: normalizeType(col.type),
      nullable: col.notNull !== true,
      default: normalizeDefault(col.default),
    }))
    .sort((a, b) => byString(a.name, b.name))
}

/**
 * Resolve the primary key. A composite PK is recorded under
 * `compositePrimaryKeys` (its column order is significant). A single-column PK
 * is flagged inline via `column.primaryKey === true`.
 */
function buildPrimaryKey(table: SnapshotTable): string[] | null {
  const composite = Object.values(table.compositePrimaryKeys)
  const firstComposite = composite[0]
  if (firstComposite !== undefined) {
    // Column order within a composite PK is semantically significant.
    return [...firstComposite.columns]
  }
  const inlinePk = Object.values(table.columns)
    .filter((col) => col.primaryKey === true)
    .map((col) => col.name)
  return inlinePk.length > 0 ? inlinePk : null
}

function buildUniques(uniques: Record<string, SnapshotUnique>): ConstraintFp[] {
  return Object.values(uniques)
    .map<ConstraintFp>((uc) => ({
      // Unique member order is NOT significant -> sort by name. The constraint
      // name is retained for readability but excluded from structural equality
      // by `Fingerprinter.serialize`.
      name: uc.name,
      columns: sortedCopy(uc.columns),
    }))
    .sort((a, b) => byString(a.columns.join(','), b.columns.join(',')))
}

function buildForeignKeys(fks: Record<string, SnapshotForeignKey>): FkFp[] {
  return Object.values(fks)
    .map<FkFp>((fk) => ({
      // columnsFrom <-> columnsTo pairing is positional -> order preserved.
      columns: [...fk.columnsFrom],
      refTable: fk.tableTo,
      refColumns: [...fk.columnsTo],
      onDelete: normalizeFkAction(fk.onDelete),
      onUpdate: normalizeFkAction(fk.onUpdate),
    }))
    .sort((a, b) =>
      byString(
        `${a.columns.join(',')}|${a.refTable}|${a.refColumns.join(',')}`,
        `${b.columns.join(',')}|${b.refTable}|${b.refColumns.join(',')}`,
      ),
    )
}

function buildIndexes(indexes: Record<string, SnapshotIndex>): IndexFp[] {
  return Object.values(indexes)
    .map<IndexFp>((idx) => ({
      // Index members are sorted by expression per the normalization rules.
      columns: sortedCopy(idx.columns.map((c) => c.expression.trim())),
      unique: idx.isUnique,
      predicate: normalizePredicate(idx.where),
      method: idx.method,
    }))
    .sort((a, b) =>
      byString(
        `${a.columns.join(',')}|${a.method}|${a.unique}|${a.predicate ?? ''}`,
        `${b.columns.join(',')}|${b.method}|${b.unique}|${b.predicate ?? ''}`,
      ),
    )
}

function buildEnums(enums: Record<string, SnapshotEnum>): EnumFp[] {
  return Object.values(enums)
    .map<EnumFp>((en) => ({
      // Enum label order is semantically significant -> preserved as authored.
      name: en.name,
      labels: [...en.values],
    }))
    .sort((a, b) => byString(a.name, b.name))
}

// ─────────────────────────────────────────────────────────
// Public surface.
// ─────────────────────────────────────────────────────────

/**
 * Map a parsed drizzle snapshot into a normalized, order-independent
 * `SchemaFingerprint` with the SAME shape the catalog `Fingerprinter` produces.
 * Tables/columns/uniques/fks/indexes/enums are sorted by name; ordinal order is
 * preserved for PK columns, FK column<->refColumn pairings, and enum labels.
 */
export function snapshotToFingerprint(snapshot: DrizzleSnapshot): SchemaFingerprint {
  const tables: TableFp[] = Object.values(snapshot.tables)
    .map<TableFp>((table) => ({
      name: table.name,
      columns: buildColumns(table.columns),
      primaryKey: buildPrimaryKey(table),
      uniques: buildUniques(table.uniqueConstraints),
      foreignKeys: buildForeignKeys(table.foreignKeys),
      indexes: buildIndexes(table.indexes),
    }))
    .sort((a, b) => byString(a.name, b.name))

  return {
    enums: buildEnums(snapshot.enums),
    tables,
    version: 1,
  }
}

/** The snapshot-derived canonical reference fingerprint plus its content hash. */
export type SnapshotFingerprint = {
  fingerprint: SchemaFingerprint
  hash: string
}

/**
 * Read the committed drizzle snapshot (DB-free) and derive its
 * `SchemaFingerprint` + `sha256` hash via the shared `Fingerprinter`. This is
 * the authoritative committed reference for the CI drift gate — no database
 * required.
 *
 * @param snapshotPath Optional override; defaults to the LATEST committed
 *   snapshot, resolved from the migration journal via
 *   {@link resolveLatestSnapshotPath}.
 */
export function deriveSnapshotFingerprint(snapshotPath?: string): SnapshotFingerprint {
  const raw = readFileSync(snapshotPath ?? resolveLatestSnapshotPath(), 'utf8')
  const snapshot = JSON.parse(raw) as DrizzleSnapshot
  const fingerprint = snapshotToFingerprint(snapshot)
  return { fingerprint, hash: Fingerprinter.hash(fingerprint) }
}
