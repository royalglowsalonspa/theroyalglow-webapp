/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : live-payload (test support)
 * Scope        : CMS Integration — live-database test harness
 *
 * Description  : Shared harness for the CMS integration tests that need a REAL
 *                database. Loads `apps/cms/.env.local`, boots one Payload
 *                instance per test process, and exposes the postgres adapter's
 *                transaction API and raw-SQL surface behind explicit types.
 *
 * Responsibilities :
 * - Load apps/cms/.env.local into process.env (never overriding a real env var)
 * - Report whether a live database is reachable, so suites can SKIP in CI
 * - Boot (and memoise) a Payload instance via the Local API
 * - Expose adapter.drizzle / adapter.sessions / begin|rollbackTransaction typed
 *
 * Features / Functionality :
 * - isLiveDbAvailable() → guard for describe.skipIf(...)
 * - bootPayload() → memoised Payload instance
 * - pgAdapter(payload) → typed view of the postgres adapter internals
 * - queryRows(payload, sql) → parameterised raw-SQL rows
 *
 * Tech Stack   : Payload CMS v3, Drizzle ORM, PostgreSQL (Neon), Vitest
 * Layer        : CMS (Test support)
 *
 * Dependencies : node:fs, node:path, node:url, drizzle-orm, payload
 *
 * Notes        :
 * - CI has NO Neon branch and no `.env.local`, so `isLiveDbAvailable()` returns
 *   false there and the dependent suites skip cleanly instead of failing.
 * - WEB_APP_URL is blanked before boot so `revalidateHooks`' fire-and-forget
 *   ping no-ops: a test run must not POST revalidation requests at a real site.
 * - `.env.local` points at the `dev` Neon branch by convention. Every suite using
 *   this harness confines itself to clearly-prefixed throwaway ids, creates its
 *   rows with `isActive: false`, and deletes them again — so even a
 *   mis-pointed connection string cannot surface a test row to a customer.
 ************************************************************/
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SQL } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Payload } from 'payload'

const HERE = dirname(fileURLToPath(import.meta.url))

/** `apps/cms` root — resolved from this file, not from the Vitest cwd. */
export const CMS_ROOT = resolve(HERE, '../..')
/** The only env file `apps/cms` has; there is intentionally no `.env`. */
export const CMS_ENV_FILE = resolve(CMS_ROOT, '.env.local')

let envLoaded = false

/**
 * Load `apps/cms/.env.local` into `process.env`.
 *
 * Vitest runs from the repository ROOT and does not load app-level env files, so
 * this is done explicitly. An already-present variable is never overwritten, so
 * a value exported in the shell still wins.
 */
export function loadCmsEnv(): void {
  if (envLoaded) {
    return
  }
  envLoaded = true

  if (!existsSync(CMS_ENV_FILE)) {
    return
  }

  for (const line of readFileSync(CMS_ENV_FILE, 'utf8').split(/\r?\n/)) {
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
 * Used with `describe.skipIf(!isLiveDbAvailable())`. CI has neither `.env.local`
 * nor a `DATABASE_URL`, so the integration suites skip there rather than failing
 * the build.
 */
export function isLiveDbAvailable(): boolean {
  loadCmsEnv()
  return (process.env.DATABASE_URL ?? '') !== ''
}

let payloadPromise: Promise<Payload> | null = null

/**
 * Boot the Payload Local API against the configured database, once per process.
 *
 * The config is imported dynamically so a suite that skips never pays the cost
 * of loading it (or of connecting).
 */
export async function bootPayload(): Promise<Payload> {
  loadCmsEnv()

  // Neutralise the cache-revalidation ping BEFORE the config is read. The hook
  // no-ops when WEB_APP_URL is empty, which keeps a local test run from firing
  // dozens of POSTs at whatever site the env file points to.
  process.env.WEB_APP_URL = ''

  if (!payloadPromise) {
    payloadPromise = (async () => {
      const { getPayload } = await import('payload')
      const config = (await import('../payload.config')).default
      return getPayload({ config })
    })()
  }

  return payloadPromise
}

/**
 * The parts of `@payloadcms/db-postgres`'s adapter these tests need.
 *
 * Payload's public `DatabaseAdapter` type exposes none of this — the same gap
 * `txDb()` works around in `src/lib/sync-db.ts`. Declaring the shape here keeps
 * the cast in ONE place and keeps every call site typed instead of `any`.
 */
export type PostgresAdapterInternals = {
  /** Base connection pool handle — commits INDEPENDENTLY of any transaction. */
  drizzle: NodePgDatabase
  /** Transaction id → transaction-bound Drizzle handle. */
  sessions?: Record<string, { db: NodePgDatabase } | undefined>
  beginTransaction: () => Promise<string>
  commitTransaction: (id: string) => Promise<void>
  rollbackTransaction: (id: string) => Promise<void>
}

/** Typed view of the postgres adapter internals. */
export function pgAdapter(payload: Payload): PostgresAdapterInternals {
  return payload.db as unknown as PostgresAdapterInternals
}

/**
 * Run a parameterised raw SQL query on the BASE pool and return its rows.
 *
 * Always build the argument with Drizzle's `sql` template so values are bound as
 * parameters — never string-concatenated.
 */
export async function queryRows(payload: Payload, query: SQL): Promise<Record<string, unknown>[]> {
  const result = await pgAdapter(payload).drizzle.execute(query)
  return (result as unknown as { rows: Record<string, unknown>[] }).rows
}
