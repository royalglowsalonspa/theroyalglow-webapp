// Wrapper around `payload migrate:create` that also fixes the generated
// migration's imports. Payload emits:
//   import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
// but MigrateUpArgs/MigrateDownArgs are TYPES — Node's ESM loader rejects them
// as runtime named exports when Payload runs the migration. We rewrite the
// import so the types are `import type` (erased at runtime) and `sql` stays a
// value import. Idempotent and safe to run repeatedly.
//
// Usage: bun run migrate:create <name>
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(here, '..', 'src', 'migrations')

const name = process.argv[2]
const args = ['migrate:create', ...(name ? [name] : [])]

const result = spawnSync('payload', args, { stdio: 'inherit', shell: true })
if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const BAD = "import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'"
const GOOD =
  "import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'\nimport { sql } from '@payloadcms/db-postgres'"

let fixed = 0
for (const file of readdirSync(migrationsDir)) {
  if (!file.endsWith('.ts')) continue
  const path = join(migrationsDir, file)
  const content = readFileSync(path, 'utf8')
  if (content.includes(BAD)) {
    writeFileSync(path, content.replace(BAD, GOOD))
    fixed += 1
  }
}
console.log(fixed > 0 ? `Fixed imports in ${fixed} migration file(s).` : 'No migration imports needed fixing.')
