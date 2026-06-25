/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp
 * Module Name  : db/scripts/backfill-roles
 * Scope        : One-off migration — default + backfill the user.role column
 *
 * Description  : Makes 'customer' the canonical default for user roles:
 *                1. Sets a DB-level DEFAULT 'customer' on user.role so every
 *                   new sign-up is a customer until the owner promotes them.
 *                2. Backfills any existing NULL roles to 'customer' so no
 *                   account is left role-less.
 *
 * Usage        : bun run packages/db/scripts/backfill-roles.ts
 *
 * Notes        : Idempotent — safe to run multiple times. Loads DATABASE_URL
 *                from env or apps/admin|web/.env.local (same loader style as
 *                set-role.ts). Uses the UNPOOLED url for DDL when available.
 ************************************************************/

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../../..')

function readEnvValue(keys: string[]): string | undefined {
  for (const key of keys) {
    if (process.env[key]) {
      return process.env[key]
    }
  }
  for (const rel of ['apps/admin/.env.local', 'apps/web/.env.local']) {
    const path = resolve(REPO_ROOT, rel)
    if (!existsSync(path)) {
      continue
    }
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      for (const key of keys) {
        const match = line.match(new RegExp(`^${key}=(.*)$`))
        if (match) {
          return match[1].trim().replace(/^["']|["']$/g, '')
        }
      }
    }
  }
  return undefined
}

async function main(): Promise<void> {
  // DDL prefers the unpooled (direct) connection; fall back to the pooled one.
  const databaseUrl = readEnvValue(['DATABASE_URL_UNPOOLED', 'DATABASE_URL'])
  if (!databaseUrl) {
    console.error('DATABASE_URL not found in env or apps/*/.env.local.')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  // 1. DB-level default so future inserts are customers by default.
  await sql`ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'customer'`
  console.log("OK  default set: user.role -> 'customer'")

  // 2. Backfill any role-less rows.
  const updated = (await sql`
    UPDATE "user" SET role = 'customer', updated_at = now()
    WHERE role IS NULL
    RETURNING email
  `) as Array<{ email: string }>

  console.log(`OK  backfilled ${updated.length} null role(s) to 'customer'`)
  for (const row of updated) {
    console.log(`      - ${row.email}`)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('Failed to backfill roles:', err)
  process.exit(1)
})
