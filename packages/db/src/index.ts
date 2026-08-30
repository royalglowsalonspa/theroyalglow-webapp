/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : index
 * Scope        : Data Access
 *
 * Description  : Database client initialization using Neon serverless driver
 *                with Drizzle ORM for edge-native PostgreSQL access.
 *
 * Responsibilities :
 * - Initialize Neon serverless HTTP connection
 * - Export configured Drizzle ORM database client instance
 *
 * Features / Functionality :
 * - Edge-compatible database access via neon-http driver
 * - Single db instance shared across all query modules
 *
 * Tech Stack   : TypeScript, Drizzle ORM, Neon PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : @neondatabase/serverless, drizzle-orm/neon-http
 *
 * Notes        : DATABASE_URL is validated at app startup via t3-env.
 *                This uses the pooled connection (pgBouncer) for app queries.
 ************************************************************/

import { neon, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

/**
 * Neon free-tier compute scales to zero after a few minutes idle. The first
 * query after that cold start can reject with `TypeError: fetch failed` before
 * the compute finishes waking — which previously surfaced as a failed OAuth
 * sign-in (the callback writes `session`/`account`/`verification` rows) and a
 * spinning "Sign in" button.
 *
 * `fetch` only throws for connection-level failures (no HTTP response was
 * received), which means the SQL never executed — so retrying is safe even for
 * writes. We retry a few transient failures with a short backoff and otherwise
 * pass straight through. HTTP error statuses are NOT thrown by fetch, so they
 * are never retried here.
 */
const baseFetch: typeof fetch = (...args) => fetch(...args)

neonConfig.fetchFunction = async (input: unknown, init: unknown): Promise<Response> => {
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await baseFetch(input as RequestInfo, init as RequestInit)
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)))
    }
  }
  throw lastError
}

/**
 * Lazy client initialization.
 *
 * `neon()` MUST NOT run at module load. Next.js `build` collects page data by
 * importing every route module, and OpenNext builds with `SKIP_ENV_VALIDATION=1`
 * and no `DATABASE_URL` in the build env. A module-level `neon(process.env.DATABASE_URL!)`
 * therefore threw `No database connection string was provided to `neon()`` during
 * `next build` (page-data collection for `/api/health`), failing the deploy
 * before the app was ever served. The lazy Proxy below is still required on
 * every platform: any build that collects page data without DATABASE_URL in the
 * environment hits the same failure.
 *
 * A Proxy defers `neon()` (and `drizzle()`) until an operational database
 * property is used at request time, when the running app has `DATABASE_URL`.
 * Optional Drizzle metadata inspection (`db._`) stays non-initializing because
 * libraries may probe it while constructing adapters during a build. The
 * exported `db` binding and its call-site API are unchanged, and the real
 * client is memoized after first use.
 */
type DrizzleClient = ReturnType<typeof drizzle>

let cachedDb: DrizzleClient | undefined

function getDb(): DrizzleClient {
  if (!cachedDb) {
    // biome-ignore lint/style/noNonNullAssertion: Required env var present at runtime (validated at app startup); deferred past build via this lazy init
    const sql = neon(process.env.DATABASE_URL!)
    cachedDb = drizzle(sql)
  }
  return cachedDb
}

export const db = new Proxy({} as DrizzleClient, {
  get(_target, prop, receiver) {
    // Better Auth 1.7.2 reads optional Drizzle metadata while constructing its
    // adapter. Return metadata only when a real client already exists; probing
    // it must not turn a DB-free Next.js build into a database initialization.
    if (prop === '_') {
      return cachedDb ? Reflect.get(cachedDb, prop, cachedDb) : undefined
    }
    return Reflect.get(getDb(), prop, receiver)
  },
  has(_target, prop) {
    if (prop === '_') {
      return cachedDb ? Reflect.has(cachedDb, prop) : false
    }
    return Reflect.has(getDb(), prop)
  },
}) as DrizzleClient
