/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-08-2026 & Updated - 04-08-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : live-db (test support)
 * Scope        : Data Access — live-database test harness
 *
 * Description  : Shared harness for the `packages/db` integration tests that need
 *                a REAL database. Loads `packages/db/.env` (the drizzle-kit env
 *                file, which points at the `dev` Neon branch) and reports whether
 *                a live connection is configured, so suites can SKIP in CI.
 *
 * Responsibilities :
 * - Load packages/db/.env into process.env (never overriding a real env var)
 * - Report whether a live database is reachable, so suites can SKIP in CI
 * - Expose a parameterised raw-SQL row reader for assertions
 *
 * Features / Functionality :
 * - isLiveDbAvailable() → guard for describe.skipIf(...)
 * - isNeonAdminAvailable() → stricter guard: live DB URL AND a NEON_API_KEY
 *   (required by the drift fork suites, which fork disposable Neon branches)
 * - queryRows(sql) → parameterised raw-SQL rows
 *
 * Tech Stack   : Drizzle ORM, Neon PostgreSQL, Vitest
 * Layer        : Data Access (Test support)
 *
 * Dependencies : node:fs, node:path, node:url, drizzle-orm, ../index
 *
 * Notes        :
 * - Mirrors apps/cms/src/test/live-payload.ts. CI has NO Neon branch and no
 *   `packages/db/.env`, so `isLiveDbAvailable()` returns false there and the
 *   dependent suites skip cleanly instead of failing the pipeline.
 * - `db` in ../index initialises `neon()` lazily on first property access, so
 *   loading the env file before the first query is sufficient.
 * - Every suite using this harness confines itself to clearly-prefixed throwaway
 *   ids and deletes them again, so a mis-pointed connection string cannot leave
 *   residue behind.
 ************************************************************/
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SQL } from 'drizzle-orm'
import { db } from '../index'

const HERE = dirname(fileURLToPath(import.meta.url))

/** `packages/db` root — resolved from this file, not from the Vitest cwd. */
export const DB_PACKAGE_ROOT = resolve(HERE, '../..')
/** The env file drizzle-kit already uses for migrations against `dev`. */
export const DB_ENV_FILE = resolve(DB_PACKAGE_ROOT, '.env')

let envLoaded = false

/**
 * Load `packages/db/.env` into `process.env`.
 *
 * Vitest runs from the repository ROOT and does not load package-level env
 * files, so this is done explicitly. An already-present variable is never
 * overwritten, so a value exported in the shell still wins.
 */
export function loadDbEnv(): void {
  if (envLoaded) {
    return
  }
  envLoaded = true

  if (!existsSync(DB_ENV_FILE)) {
    return
  }

  for (const line of readFileSync(DB_ENV_FILE, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) {
      continue
    }
    const key = match[1] as string
    let value = (match[2] ?? '').trim()
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    if (isQuoted) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

/**
 * Is a live database configured for this run?
 *
 * Used with `describe.skipIf(!isLiveDbAvailable())`. CI has neither the env file
 * nor a `DATABASE_URL`, so the integration suites skip there rather than failing
 * the build.
 */
export function isLiveDbAvailable(): boolean {
  loadDbEnv()
  return (process.env.DATABASE_URL ?? '') !== ''
}

/**
 * Is the Neon Management API usable for this run?
 *
 * Stricter than {@link isLiveDbAvailable}: the drift fork suites need BOTH a
 * live database URL and a `NEON_API_KEY` (to fork / delete disposable branches
 * through `scripts/drift/neon-admin.ts`). CI has neither, so those suites skip
 * there. The key itself is never read, logged, or returned by this helper.
 */
export function isNeonAdminAvailable(): boolean {
  loadDbEnv()
  return isLiveDbAvailable() && (process.env.NEON_API_KEY ?? '') !== ''
}

/**
 * Run a parameterised raw SQL query and return its rows.
 *
 * Always build the argument with Drizzle's `sql` template so values are bound as
 * parameters — never string-concatenated.
 */
export async function queryRows<T extends Record<string, unknown> = Record<string, unknown>>(
  query: SQL,
): Promise<T[]> {
  const result = await db.execute<T>(query)
  return result.rows as T[]
}

/** First row of a query, or null. */
export async function queryRow<T extends Record<string, unknown> = Record<string, unknown>>(
  query: SQL,
): Promise<T | null> {
  const rows = await queryRows<T>(query)
  return rows[0] ?? null
}
