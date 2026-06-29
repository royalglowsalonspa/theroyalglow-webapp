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

// biome-ignore lint/style/noNonNullAssertion: Required env var validated at app startup
const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql)
