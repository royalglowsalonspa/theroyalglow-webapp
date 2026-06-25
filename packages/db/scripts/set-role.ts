/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp
 * Module Name  : db/scripts/set-role
 * Scope        : Dev utility — assign an RBAC role to a user by email
 *
 * Description  : Sets the `role` on a user row by email so that account can
 *                access the admin portal (admin.theroyalglow.in) at the right
 *                level. Use after a user has signed in once on the web app
 *                (which registers their row in Neon).
 *
 * Usage        : bun run packages/db/scripts/set-role.ts <email> <role>
 *                  valid roles: customer | staff | receptionist | manager |
 *                               owner | developer
 *
 * Notes        : Lives inside packages/db so `@neondatabase/serverless`
 *                resolves. Loads DATABASE_URL from apps/admin/.env.local
 *                (falls back to apps/web/.env.local) when not already set.
 *                Uses a parameterised neon query (no SQL injection).
 ************************************************************/

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const VALID_ROLES = ['customer', 'staff', 'receptionist', 'manager', 'owner', 'developer']

// Repo root = three levels up from this file (packages/db/scripts).
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../../..')

function loadDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }
  for (const rel of ['apps/admin/.env.local', 'apps/web/.env.local']) {
    const path = resolve(REPO_ROOT, rel)
    if (!existsSync(path)) {
      continue
    }
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^DATABASE_URL=(.*)$/)
      if (match) {
        return match[1].trim().replace(/^["']|["']$/g, '')
      }
    }
  }
  return undefined
}

async function main(): Promise<void> {
  const email = process.argv[2]
  const role = process.argv[3]

  if (!email || !role) {
    console.error('Usage: bun run packages/db/scripts/set-role.ts <email> <role>')
    console.error(`  valid roles: ${VALID_ROLES.join(', ')}`)
    process.exit(1)
  }
  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role "${role}". Valid: ${VALID_ROLES.join(', ')}`)
    process.exit(1)
  }

  const databaseUrl = loadDatabaseUrl()
  if (!databaseUrl) {
    console.error('DATABASE_URL not found in env or apps/*/.env.local.')
    process.exit(1)
  }

  const sql = neon(databaseUrl)
  const rows = (await sql`
    UPDATE "user" SET role = ${role}, updated_at = now()
    WHERE email = ${email}
    RETURNING email, role
  `) as Array<{ email: string; role: string }>

  if (rows.length === 0) {
    console.error(
      `No user found with email "${email}". Have them sign in on http://localhost:3000 first, then re-run.`,
    )
    process.exit(1)
  }

  console.log(`OK  ${rows[0].email}  ->  role: ${rows[0].role}`)
  process.exit(0)
}

main().catch((err) => {
  console.error('Failed to set role:', err)
  process.exit(1)
})
