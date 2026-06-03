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

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

// biome-ignore lint/style/noNonNullAssertion: Required env var validated at app startup
const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql)
