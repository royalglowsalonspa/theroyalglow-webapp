/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drizzle.config
 * Scope        : Database Configuration
 *
 * Description  : Drizzle Kit configuration for schema introspection, migration
 *                generation, and migration execution against PostgreSQL.
 *
 * Responsibilities :
 * - Point Drizzle Kit to the schema entry file
 * - Configure migration output directory
 * - Set PostgreSQL dialect and connection credentials
 *
 * Features / Functionality :
 * - Prefers unpooled (direct) connection for migration safety
 * - Falls back to pooled connection if unpooled is unavailable
 * - Migrations output to ./migrations/ for version control
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-kit
 *
 * Notes        : Run migrations via: bunx drizzle-kit generate && bunx drizzle-kit migrate
 ************************************************************/

import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Prefer unpooled (direct) connection for migrations, fall back to pooled
    // biome-ignore lint/style/noNonNullAssertion: Required at migration time
    url: (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)!,
  },
})
