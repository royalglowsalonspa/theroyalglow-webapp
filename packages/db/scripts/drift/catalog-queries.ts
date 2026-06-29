/************************************************************
 * Schema Drift Remediation — read-only catalog reader.
 *
 * Component 2 (`catalog-queries`) of the drift tooling.
 * Holds the exact read-only SQL that extracts schema structure from
 * `information_schema` / `pg_catalog`, scoped to the `public` schema.
 *
 * Read-only by construction: every statement is a `SELECT`. Safe to run
 * against `prod`. Returns plain rows with NO normalization — normalizing
 * is the fingerprinter's job (Component 1).
 *
 * Mirrors the design "Components and Interfaces → Component 2" and
 * "Data Models → Catalog query shapes" sections of
 * `.kiro/specs/schema-drift-remediation/design.md`.
 *
 * neon-http note: no interactive transactions. These are independent,
 * parameterless `SELECT` statements executed via a `SqlExecutor` adapter,
 * so they need none.
 ************************************************************/

import { neon } from '@neondatabase/serverless'
import type { ColumnRow, EnumRow, FkRow, IndexRow, PkRow, TableRow, UniqueRow } from './types'

// ─────────────────────────────────────────────────────────
// CatalogReader — one read-only query per object class.
// ─────────────────────────────────────────────────────────

export type CatalogReader = {
  readTables(): Promise<TableRow[]>
  readColumns(): Promise<ColumnRow[]> // type, nullability, default
  readPrimaryKeys(): Promise<PkRow[]>
  readUniques(): Promise<UniqueRow[]>
  readForeignKeys(): Promise<FkRow[]> // incl. on_delete / on_update
  readIndexes(): Promise<IndexRow[]> // incl. partial predicate, uniqueness, method
  readEnums(): Promise<EnumRow[]> // type name + ordered labels
}

/**
 * Minimal SQL execution port: takes a parameterless raw `SELECT` and returns
 * the resulting rows. Decouples the reader from any concrete driver so it is
 * trivially testable and works with either a neon `sql` executor or a
 * Drizzle/neon-http client wrapper.
 */
export type SqlExecutor = <Row>(query: string) => Promise<Row[]>

// ─────────────────────────────────────────────────────────
// Catalog query shapes (read-only) — verbatim from the design,
// scoped to `table_schema = 'public'` / `n.nspname = 'public'`.
// ─────────────────────────────────────────────────────────

const TABLES_SQL = `
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
`

const COLUMNS_SQL = `
SELECT table_name, column_name, data_type, udt_name,
       is_nullable, column_default, ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
`

const PRIMARY_KEYS_SQL = `
SELECT tc.table_name, tc.constraint_type, tc.constraint_name,
       kcu.column_name, kcu.ordinal_position
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'PRIMARY KEY'
ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;
`

const UNIQUES_SQL = `
SELECT tc.table_name, tc.constraint_type, tc.constraint_name,
       kcu.column_name, kcu.ordinal_position
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'UNIQUE'
ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;
`

const FOREIGN_KEYS_SQL = `
SELECT con.conname, c.relname AS table_name, rc.relname AS ref_table,
       con.confdeltype, con.confupdtype,
       con.conkey, con.confkey
FROM pg_constraint con
JOIN pg_class c   ON c.oid  = con.conrelid
JOIN pg_class rc  ON rc.oid = con.confrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE con.contype = 'f' AND n.nspname = 'public';
`

const INDEXES_SQL = `
SELECT t.relname AS table_name, i.relname AS index_name,
       ix.indisunique, am.amname AS method,
       pg_get_indexdef(ix.indexrelid) AS def,
       pg_get_expr(ix.indpred, ix.indrelid) AS predicate
FROM pg_index ix
JOIN pg_class i  ON i.oid = ix.indexrelid
JOIN pg_class t  ON t.oid = ix.indrelid
JOIN pg_am am    ON am.oid = i.relam
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public' AND NOT ix.indisprimary;
`

const ENUMS_SQL = `
SELECT t.typname, e.enumlabel, e.enumsortorder
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
ORDER BY t.typname, e.enumsortorder;
`

// ─────────────────────────────────────────────────────────
// Factory — build a CatalogReader over a SqlExecutor.
// ─────────────────────────────────────────────────────────

/**
 * Build a read-only `CatalogReader` over any `SqlExecutor`.
 *
 * Every method issues a single parameterless `SELECT` and returns the raw
 * rows unchanged. No write statements are ever emitted.
 */
export function createCatalogReader(exec: SqlExecutor): CatalogReader {
  return {
    readTables: () => exec<TableRow>(TABLES_SQL),
    readColumns: () => exec<ColumnRow>(COLUMNS_SQL),
    readPrimaryKeys: () => exec<PkRow>(PRIMARY_KEYS_SQL),
    readUniques: () => exec<UniqueRow>(UNIQUES_SQL),
    readForeignKeys: () => exec<FkRow>(FOREIGN_KEYS_SQL),
    readIndexes: () => exec<IndexRow>(INDEXES_SQL),
    readEnums: () => exec<EnumRow>(ENUMS_SQL),
  }
}

/**
 * Adapt a Neon serverless connection string into a `SqlExecutor`.
 *
 * Uses the neon `sql.query(text)` form to run a plain, parameterless raw
 * `SELECT` and receive the row array directly. (Neon serverless v1 removed the
 * ordinary-string call form `sql(text)` — it is now a runtime + type error;
 * only the template tag and the `query()` / `unsafe()` methods are valid.)
 * Matches the `@rgss/db` neon-http client pattern (`neon(url)`); pass the
 * unpooled `DATABASE_URL_UNPOOLED` form when a direct connection is required.
 */
export function neonExecutor(connectionString: string): SqlExecutor {
  const sql = neon(connectionString)
  return <Row>(query: string) => sql.query(query) as Promise<Row[]>
}

/**
 * Convenience: build a `CatalogReader` directly from a Neon connection string.
 */
export function createNeonCatalogReader(connectionString: string): CatalogReader {
  return createCatalogReader(neonExecutor(connectionString))
}
