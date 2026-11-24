/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp
 * Module Name  : db/scripts/set-role
 * Scope        : Dev utility — set a user's role by email, where one statement can
 *
 * Description  : Since multi-branch (migrations 0004–0006) a branch role is a
 *                relationship, not just a value: an Owner owns a branch, a
 *                Manager manages one, a Receptionist or Staff member works at
 *                one with an active staff profile, and the database rejects
 *                anything else. Only two changes are still one statement:
 *                - `customer`: return someone who holds no branch role;
 *                - `developer`: the first Developer on a database that has none.
 *                Everything else goes through the admin app or the runbook.
 *
 * Usage        : bun run packages/db/scripts/set-role.ts <email> <customer|developer>
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

const SINGLE_STATEMENT_ROLES = ['customer', 'developer']

const GUIDANCE: Record<string, string> = {
  owner:
    'The Owner of a branch is changed by the Developer in Users & Roles (admin.theroyalglow.in/users). On a database with no branches, run the seed with SEED_OWNER_EMAIL.',
  manager: "Choose the Manager in Users & Roles (the branch's Owner or the Developer).",
  receptionist: "Choose the Receptionist in Users & Roles (the branch's Owner or the Developer).",
  staff: 'Add Stylists and Therapists on the Staff page (Add staff).',
}

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
    console.error('Usage: bun run packages/db/scripts/set-role.ts <email> <customer|developer>')
    process.exit(1)
  }
  if (!SINGLE_STATEMENT_ROLES.includes(role)) {
    console.error(GUIDANCE[role] ?? `Invalid role "${role}". Valid here: customer, developer.`)
    process.exit(1)
  }

  const databaseUrl = loadDatabaseUrl()
  if (!databaseUrl) {
    console.error('DATABASE_URL not found in env or apps/*/.env.local.')
    process.exit(1)
  }

  const sql = neon(databaseUrl)
  if (role === 'developer') {
    const [existing] = (await sql`
      SELECT email FROM "user" WHERE role = 'developer' LIMIT 1
    `) as Array<{ email: string }>
    if (existing) {
      console.error(
        `${existing.email} is the Developer. Replace them with the runbook in knowledge-base/authentication.md: one transaction that demotes the current Developer, then promotes the new one.`,
      )
      process.exit(1)
    }
  }

  const rows = (await sql`
    UPDATE "user" SET role = ${role}, updated_at = now()
    WHERE lower(email) = lower(${email})
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
  // The database refuses a change that would break a branch relationship (for
  // example making a branch's Manager a customer); its message says which.
  console.error('Failed to set role:', err instanceof Error ? err.message : err)
  process.exit(1)
})
