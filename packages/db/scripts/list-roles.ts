/************************************************************
 * Dev utility — list users + roles by email. Temporary; safe to delete.
 * Usage: bun run packages/db/scripts/list-roles.ts
 ************************************************************/
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

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

const sql = neon(loadDatabaseUrl() as string)
const rows = (await sql`SELECT email, role FROM "user" ORDER BY role NULLS FIRST`) as Array<{
  email: string
  role: string | null
}>
for (const r of rows) {
  console.log(`${(r.role ?? '(none)').padEnd(14)} ${r.email}`)
}
process.exit(0)
