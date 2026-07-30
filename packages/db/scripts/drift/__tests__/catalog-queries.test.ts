/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/__tests__/catalog-queries.test
 * Scope        : Unit / snapshot tests — read-only catalog reader (task 2.2)
 *
 * Validates    : Requirements 2.1, 14.1
 *
 * Description  : Asserts the structural READ-ONLY guarantee of
 *                `catalog-queries.ts`: every statement the `CatalogReader`
 *                issues is a single `SELECT`, scoped to the `public` schema,
 *                and carries no write / DDL / data-mutation keyword. The
 *                guarantee is asserted STRUCTURALLY over the captured SQL —
 *                never by executing DDL — so the suite stays database-free
 *                (CI has no Neon branch) and can never touch a real branch.
 *
 * Responsibilities :
 * - Snapshot every emitted query (whitespace-normalized golden text)
 * - Assert exactly one statement per reader method, and that it is a `SELECT`
 * - Assert `public`-scoping on every query
 * - Assert no write keyword (INSERT/UPDATE/DELETE/DDL/...) appears anywhere
 * - Assert rows are returned verbatim (no normalization in this layer)
 *
 * Features / Functionality :
 * - A recording `SqlExecutor` captures the exact SQL text each method sends,
 *   which is the only way the module's private query constants are observable.
 *
 * Tech Stack   : Vitest
 * Layer        : Test
 *
 * Dependencies : vitest, ../catalog-queries, ../types
 *
 * Notes        : Zero I/O. No `drizzle-kit push`, no DDL, no database.
 ************************************************************/

import { describe, expect, it } from 'vitest'
import { createCatalogReader, type SqlExecutor } from '../catalog-queries'

// ─────────────────────────────────────────────────────────
// Recording executor — captures the exact SQL text of every issued statement.
// ─────────────────────────────────────────────────────────

type Recorder = { queries: string[]; exec: SqlExecutor }

function createRecorder(rows: unknown[] = []): Recorder {
  const queries: string[] = []
  const exec: SqlExecutor = <Row>(query: string): Promise<Row[]> => {
    queries.push(query)
    return Promise.resolve(rows as Row[])
  }
  return { queries, exec }
}

/** Collapse all whitespace runs so the golden snapshots survive re-indentation. */
function normalize(sql: string): string {
  return sql.trim().replace(/\s+/g, ' ')
}

const READER_METHODS = [
  'readTables',
  'readColumns',
  'readPrimaryKeys',
  'readUniques',
  'readForeignKeys',
  'readIndexes',
  'readEnums',
] as const

/** Capture the single query issued by one reader method. */
async function captureQuery(method: (typeof READER_METHODS)[number]): Promise<string> {
  const recorder = createRecorder()
  const reader = createCatalogReader(recorder.exec)
  await reader[method]()
  expect(recorder.queries).toHaveLength(1)
  return recorder.queries[0] ?? ''
}

async function captureAllQueries(): Promise<Record<string, string>> {
  const captured: Record<string, string> = {}
  for (const method of READER_METHODS) {
    captured[method] = await captureQuery(method)
  }
  return captured
}

// ─────────────────────────────────────────────────────────
// Golden query snapshots (whitespace-normalized). Any token change to a
// catalog query flips these, which is the point of the snapshot.
// ─────────────────────────────────────────────────────────

const GOLDEN_QUERIES: Readonly<Record<string, string>> = {
  readTables:
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' " +
    "AND table_type = 'BASE TABLE' ORDER BY table_name;",
  readColumns:
    'SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default, ' +
    "ordinal_position FROM information_schema.columns WHERE table_schema = 'public' " +
    'ORDER BY table_name, ordinal_position;',
  readPrimaryKeys:
    'SELECT tc.table_name, tc.constraint_type, tc.constraint_name, kcu.column_name, ' +
    'kcu.ordinal_position FROM information_schema.table_constraints tc ' +
    'JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name ' +
    "AND tc.table_schema = kcu.table_schema WHERE tc.table_schema = 'public' " +
    "AND tc.constraint_type = 'PRIMARY KEY' " +
    'ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;',
  readUniques:
    'SELECT tc.table_name, tc.constraint_type, tc.constraint_name, kcu.column_name, ' +
    'kcu.ordinal_position FROM information_schema.table_constraints tc ' +
    'JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name ' +
    "AND tc.table_schema = kcu.table_schema WHERE tc.table_schema = 'public' " +
    "AND tc.constraint_type = 'UNIQUE' " +
    'ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;',
  readForeignKeys:
    'SELECT con.conname, c.relname AS table_name, rc.relname AS ref_table, con.confdeltype, ' +
    'con.confupdtype, con.conkey, con.confkey FROM pg_constraint con ' +
    'JOIN pg_class c ON c.oid = con.conrelid JOIN pg_class rc ON rc.oid = con.confrelid ' +
    'JOIN pg_namespace n ON n.oid = c.relnamespace ' +
    "WHERE con.contype = 'f' AND n.nspname = 'public';",
  readIndexes:
    'SELECT t.relname AS table_name, i.relname AS index_name, ix.indisunique, ' +
    'am.amname AS method, pg_get_indexdef(ix.indexrelid) AS def, ' +
    'pg_get_expr(ix.indpred, ix.indrelid) AS predicate FROM pg_index ix ' +
    'JOIN pg_class i ON i.oid = ix.indexrelid JOIN pg_class t ON t.oid = ix.indrelid ' +
    'JOIN pg_am am ON am.oid = i.relam JOIN pg_namespace n ON n.oid = t.relnamespace ' +
    "WHERE n.nspname = 'public' AND NOT ix.indisprimary;",
  readEnums:
    'SELECT t.typname, e.enumlabel, e.enumsortorder FROM pg_type t ' +
    'JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace ' +
    "WHERE n.nspname = 'public' ORDER BY t.typname, e.enumsortorder;",
}

/**
 * Write / DDL keywords that must never appear in a catalog query. The audit
 * phase is strictly read-only (Req 2.1, 14.1) — this is the structural proof.
 */
const WRITE_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'MERGE',
  'COPY',
  'CREATE',
  'ALTER',
  'DROP',
  'GRANT',
  'REVOKE',
  'COMMENT',
  'REFRESH',
  'VACUUM',
  'ANALYZE',
  'LOCK',
  'SET ',
  'CALL',
  'DO ',
  'FOR UPDATE',
  'FOR SHARE',
]

describe('catalog-queries: read-only catalog reader (task 2.2)', () => {
  it('issues exactly one query per reader method and matches the golden snapshot', async () => {
    const captured = await captureAllQueries()

    for (const method of READER_METHODS) {
      expect(normalize(captured[method] ?? '')).toBe(GOLDEN_QUERIES[method])
    }
  })

  it('every query is a single SELECT statement', async () => {
    const captured = await captureAllQueries()

    for (const method of READER_METHODS) {
      const sql = normalize(captured[method] ?? '')
      expect(sql.startsWith('SELECT ')).toBe(true)
      // One trailing terminator at most, and no statement chaining.
      expect(sql.replace(/;$/, '').includes(';')).toBe(false)
      expect((sql.match(/\bSELECT\b/g) ?? []).length).toBe(1)
    }
  })

  it('every query is scoped to the public schema', async () => {
    const captured = await captureAllQueries()

    for (const method of READER_METHODS) {
      const sql = captured[method] ?? ''
      const scoped = sql.includes("table_schema = 'public'") || sql.includes("nspname = 'public'")
      expect(scoped).toBe(true)
    }
  })

  it('no query contains a write, DDL, or locking keyword', async () => {
    const captured = await captureAllQueries()

    for (const method of READER_METHODS) {
      const sql = (captured[method] ?? '').toUpperCase()
      for (const keyword of WRITE_KEYWORDS) {
        expect(sql).not.toContain(keyword)
      }
    }
  })

  it('never emits drizzle-kit push (the mechanism that caused the drift)', async () => {
    const captured = await captureAllQueries()

    for (const method of READER_METHODS) {
      expect(captured[method] ?? '').not.toContain('drizzle-kit')
      expect(captured[method] ?? '').not.toContain('push')
    }
  })

  it('returns executor rows verbatim, applying no normalization', async () => {
    const rows = [{ table_name: 'booking' }, { table_name: 'invoice' }]
    const recorder = createRecorder(rows)
    const reader = createCatalogReader(recorder.exec)

    await expect(reader.readTables()).resolves.toBe(rows)
  })

  it('issues no statement until a reader method is called', () => {
    const recorder = createRecorder()
    createCatalogReader(recorder.exec)

    expect(recorder.queries).toEqual([])
  })
})
