/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/canonical
 * Scope        : Schema Drift Remediation — canonical fingerprint derivation
 *
 * Description  : Derives the Canonical_Fingerprint from the Drizzle schema
 *                CODE (`packages/db/src/schema`) — never from a live branch.
 *                The Drizzle schema is materialized into an EMPTY, disposable
 *                target database, that database's catalog is read back through
 *                the read-only `CatalogReader`, and the rows are fingerprinted
 *                by the pure `Fingerprinter`. The result is the convergence
 *                target every branch (prod/dev/test/pprd) must equal.
 *
 * Responsibilities :
 * - deriveCanonicalFingerprint : code -> empty DB -> catalog -> fingerprint
 * - readCatalog                : read all catalog classes in parallel
 * - drizzleKitMaterializer     : default `export`-then-apply (push fallback)
 *
 * Features / Functionality :
 * - Empty-DB target is INJECTED via `targetUrl` (a Neon fork from neon-admin
 *   or any throwaway DB), so canonical is derived from code, not a live branch.
 * - Materialization prefers `drizzle-kit export --sql` (emit full DDL, then
 *   apply each statement over the unpooled connection), falling back to
 *   `drizzle-kit push` against the empty DB. Using push/export to BASELINE an
 *   empty throwaway DB is safe (no data, no drift risk); the spec only abandons
 *   push for RECONCILIATION of real branches.
 * - Every collaborator (reader, executor, materializer) is injectable so the
 *   runner and integration tests can drive this without spawning drizzle-kit.
 *
 * Tech Stack   : TypeScript (strict), Drizzle Kit, Neon serverless
 * Layer        : Data Access (control plane / derivation)
 *
 * Dependencies : ./types, ./fingerprint, ./catalog-queries
 *
 * Notes        : DDL execution MUST use an unpooled (direct) connection string
 *                (`DATABASE_URL_UNPOOLED` form). This module performs no live
 *                DB or drizzle-kit work at import time — it is invoked later by
 *                the runner / integration tests.
 *
 * _Requirements: 1.1, 1.2, 1.3_
 ************************************************************/

import { exec as execCb } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  type CatalogReader,
  createCatalogReader,
  neonExecutor,
  type SqlExecutor,
} from './catalog-queries'
import { Fingerprinter } from './fingerprint'
import type { CatalogRows, SchemaFingerprint } from './types'

const execAsync = promisify(execCb)

/** `packages/db` root, resolved from this file's location (scripts/drift). */
const DB_PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../')

/** Generous buffer for the emitted baseline DDL (full 38-table schema). */
const DEFAULT_MAX_BUFFER = 32 * 1024 * 1024

// ─────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────

/** Context handed to a {@link SchemaMaterializer}. */
export type MaterializeContext = {
  /** Unpooled (direct) connection string for the EMPTY target DB (DDL). */
  targetUrl: string
  /** Working directory drizzle-kit runs in (the `@rgss/db` package root). */
  projectDir: string
  /** Path to the `drizzle.config.ts` describing schema + dialect. */
  configPath: string
  /** Executor bound to `targetUrl`, used to apply emitted DDL statements. */
  exec: SqlExecutor
}

/**
 * Strategy that materializes the Drizzle schema CODE into the empty target DB.
 * Pure-interface so the runner / tests can substitute a no-spawn implementation.
 */
export type SchemaMaterializer = (ctx: MaterializeContext) => Promise<void>

/** Options for {@link deriveCanonicalFingerprint}. */
export type CanonicalDerivationOptions = {
  /**
   * Unpooled (direct) connection string for the EMPTY, disposable target DB.
   * Typically a freshly forked Neon branch (see `neon-admin.forkBranch`) or any
   * throwaway database. DDL requires the unpooled form.
   */
  targetUrl: string
  /** Override the drizzle-kit working directory (defaults to `@rgss/db` root). */
  projectDir?: string
  /** Override the drizzle config path (defaults to `<projectDir>/drizzle.config.ts`). */
  configPath?: string
  /** Inject a CatalogReader (defaults to a read-only reader over `targetUrl`). */
  reader?: CatalogReader
  /** Inject the DDL executor (defaults to a neon executor over `targetUrl`). */
  exec?: SqlExecutor
  /** Inject the materialization strategy (defaults to drizzle-kit export/push). */
  materialize?: SchemaMaterializer
}

/** The canonical fingerprint plus its content hash. */
export type CanonicalFingerprint = {
  fingerprint: SchemaFingerprint
  hash: string
}

// ─────────────────────────────────────────────────────────
// Catalog helper — reused by the runner for branch audits.
// ─────────────────────────────────────────────────────────

/**
 * Read every catalog object class from a {@link CatalogReader} in parallel into
 * a single {@link CatalogRows} bundle. Read-only: issues only the reader's
 * `SELECT` queries and performs no normalization (that is the fingerprinter's
 * job). Exported because the audit runner reuses it per branch.
 */
export async function readCatalog(reader: CatalogReader): Promise<CatalogRows> {
  const [tables, columns, primaryKeys, uniques, foreignKeys, indexes, enums] = await Promise.all([
    reader.readTables(),
    reader.readColumns(),
    reader.readPrimaryKeys(),
    reader.readUniques(),
    reader.readForeignKeys(),
    reader.readIndexes(),
    reader.readEnums(),
  ])
  return { tables, columns, primaryKeys, uniques, foreignKeys, indexes, enums }
}

// ─────────────────────────────────────────────────────────
// Canonical derivation
// ─────────────────────────────────────────────────────────

/**
 * Derive the Canonical_Fingerprint from the Drizzle schema CODE.
 *
 * Pipeline (design phase 1):
 *   1. Materialize the schema in `packages/db/src/schema` into the EMPTY target
 *      DB at `opts.targetUrl` (via `drizzle-kit export --sql` applied over the
 *      unpooled connection, or `drizzle-kit push` as a fallback).
 *   2. Read the resulting catalog read-only via the `CatalogReader`.
 *   3. Fingerprint the rows with the pure `Fingerprinter`.
 *
 * Returns both the `SchemaFingerprint` and its `sha256` hash. The hash is the
 * convergence target for all four branches and is never derived from a live
 * branch.
 */
export async function deriveCanonicalFingerprint(
  opts: CanonicalDerivationOptions,
): Promise<CanonicalFingerprint> {
  const projectDir = opts.projectDir ?? DB_PACKAGE_ROOT
  const configPath = opts.configPath ?? resolve(projectDir, 'drizzle.config.ts')
  const exec = opts.exec ?? neonExecutor(opts.targetUrl)
  const reader = opts.reader ?? createCatalogReader(exec)
  const materialize = opts.materialize ?? drizzleKitMaterializer

  // 1. Code -> empty DB.
  await materialize({ targetUrl: opts.targetUrl, projectDir, configPath, exec })

  // 2. Empty DB -> raw catalog rows (read-only).
  const rows = await readCatalog(reader)

  // 3. Rows -> normalized, order-independent fingerprint + hash.
  const fingerprint = Fingerprinter.build(rows)
  return { fingerprint, hash: Fingerprinter.hash(fingerprint) }
}

// ─────────────────────────────────────────────────────────
// Default materializer — drizzle-kit export (apply), push fallback.
// ─────────────────────────────────────────────────────────

/**
 * Default {@link SchemaMaterializer}.
 *
 * Prefers `drizzle-kit export --sql`: it emits the full canonical DDL for the
 * schema, which we split into statements and apply one-by-one over the unpooled
 * connection (neon-http has no interactive transactions, so statements run
 * independently and in order). If `export` is unavailable or yields no
 * statements, it falls back to `drizzle-kit push` against the empty target DB.
 *
 * Both paths are safe here precisely because the target is EMPTY — there is no
 * data and therefore no drift/data-loss risk. This is the one sanctioned use of
 * push/export; reconciliation of real branches never uses push.
 */
export const drizzleKitMaterializer: SchemaMaterializer = async (ctx) => {
  let ddl: string | null = null
  try {
    ddl = await exportSchemaDdl(ctx.projectDir, ctx.configPath)
  } catch {
    // `export` unsupported or failed — fall back to push against the empty DB.
    await pushSchema(ctx)
    return
  }

  const statements = splitSqlStatements(ddl)
  if (statements.length === 0) {
    await pushSchema(ctx)
    return
  }

  for (const statement of statements) {
    await ctx.exec(statement)
  }
}

/** Run `drizzle-kit export --sql` and return the emitted DDL from stdout. */
async function exportSchemaDdl(projectDir: string, configPath: string): Promise<string> {
  const { stdout } = await execAsync(`bunx drizzle-kit export --sql --config="${configPath}"`, {
    cwd: projectDir,
    maxBuffer: DEFAULT_MAX_BUFFER,
  })
  return stdout
}

/**
 * Fallback: `drizzle-kit push` directly against the empty target DB. The target
 * URL is injected as both pooled/unpooled env vars so drizzle.config resolves
 * the disposable DB rather than any ambient branch.
 */
async function pushSchema(ctx: MaterializeContext): Promise<void> {
  await execAsync(`bunx drizzle-kit push --force --config="${ctx.configPath}"`, {
    cwd: ctx.projectDir,
    maxBuffer: DEFAULT_MAX_BUFFER,
    env: {
      ...process.env,
      DATABASE_URL_UNPOOLED: ctx.targetUrl,
      DATABASE_URL: ctx.targetUrl,
    },
  })
}

// ─────────────────────────────────────────────────────────
// SQL statement splitting
// ─────────────────────────────────────────────────────────

/**
 * Split emitted DDL into individual executable statements. Prefers drizzle's
 * `--> statement-breakpoint` markers; otherwise splits on statement-terminating
 * semicolons at line ends. Full-line `--` comments are stripped and trailing
 * semicolons removed so each chunk is a single runnable statement.
 */
export function splitSqlStatements(sql: string): string[] {
  const byBreakpoint = sql.split('--> statement-breakpoint')
  const chunks = byBreakpoint.length > 1 ? byBreakpoint : sql.split(/;\s*(?:\r?\n|$)/)
  return chunks
    .map((chunk) => stripSqlComments(chunk).trim())
    .map((chunk) => chunk.replace(/;\s*$/, '').trim())
    .filter((chunk) => chunk.length > 0)
}

/** Drop full-line `--` comments while preserving statement content. */
function stripSqlComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
}
