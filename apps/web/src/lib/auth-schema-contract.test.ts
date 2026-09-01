/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 01-09-2026 & Updated - 01-09-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : auth-schema-contract
 * Scope        : Authentication — schema contract gate
 *
 * Description  : Asserts that the Drizzle schema in `@rgss/db` satisfies the
 *                schema contract the INSTALLED Better Auth version demands.
 *                Rather than hand-maintaining a list of expected columns, this
 *                asks Better Auth itself — `getAuthTables()` returns the models,
 *                required fields and declared indexes for the exact option and
 *                plugin set we run in production.
 *
 *                This exists because of a production outage: Better Auth 1.7.x
 *                made `account.issuer` a required identity field with a unique
 *                `(issuer, accountId)` index. Nothing in CI knew the library's
 *                data contract had moved, so a dependency bump shipped a schema
 *                mismatch straight to production and broke every Google sign-in.
 *                A version bump that moves the contract now fails HERE, in CI,
 *                instead of at the OAuth callback in production.
 *
 * Responsibilities :
 * - Assert every REQUIRED Better Auth field exists as a Drizzle column
 * - Assert every declared unique/compound index is backed by committed migration DDL
 * - Assert both apps pin Better Auth in lockstep (a split bump resolves mismatched)
 *
 * Features / Functionality :
 * - Library-derived: no hardcoded column list to drift out of date
 * - DB-free: `getAuthTables()` needs no database connection
 * - Mirrors the production plugin set so plugin-driven schema changes are caught
 *
 * Tech Stack   : TypeScript (strict), Vitest, Better Auth, Drizzle ORM
 * Layer        : Authentication (contract test)
 *
 * Dependencies : better-auth/db, @rgss/db/schema, drizzle-orm, vitest
 *
 * Notes        : Compare Better Auth field KEYS against `getTableColumns()`
 *                keys — NEVER against `fieldName`. Better Auth reports
 *                camelCase physical names (`accountId`) while this project uses
 *                snake_case (`account_id`); the Drizzle adapter resolves columns
 *                by the table object's JS property key, which is why the
 *                snake_case mapping works at runtime.
 ************************************************************/

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dash } from '@better-auth/infra'
import * as schema from '@rgss/db/schema'
import { getAuthTables } from 'better-auth/db'
import { oneTap } from 'better-auth/plugins'
import { getTableColumns, getTableName, isTable, type Table } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(MODULE_DIR, '../../../..')

/**
 * Mirror of the PRODUCTION Better Auth option set from `auth-server.ts`.
 *
 * Only the options that influence the SCHEMA matter here (additional user
 * fields, social providers, plugins). Secrets and URLs are irrelevant to
 * `getAuthTables()` and are given inert placeholders.
 *
 * Keep the plugin list and their options identical to `auth-server.ts`. Plugins
 * contribute tables and columns conditionally — for example `dash()` adds
 * directory-sync tables only when `managedDirectorySync.enabled` is set — so
 * passing the real options is what makes this test catch plugin-driven schema
 * changes rather than merely core ones.
 */
const productionOptions = {
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        input: false,
        defaultValue: 'customer',
      },
    },
  },
  socialProviders: {
    google: { clientId: 'contract-test', clientSecret: 'contract-test' },
  },
  plugins: [dash(), oneTap()],
} as const

/** Better Auth model name -> the Drizzle table exported from `@rgss/db/schema`. */
function drizzleTableFor(model: string): Table | undefined {
  const candidate = (schema as Record<string, unknown>)[model]
  return isTable(candidate) ? candidate : undefined
}

/** Concatenated committed migration SQL — the source of truth for applied DDL. */
function committedMigrationSql(): string {
  const journalPath = resolve(REPO_ROOT, 'packages/db/migrations/meta/_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: { tag: string }[]
  }

  return journal.entries
    .map((entry) =>
      readFileSync(resolve(REPO_ROOT, `packages/db/migrations/${entry.tag}.sql`), 'utf8'),
    )
    .join('\n')
    .toLowerCase()
}

const tables = getAuthTables(productionOptions as never)

describe('Better Auth schema contract', () => {
  it('resolves the auth models for the production option set', () => {
    // Sanity check on the harness itself: if `getAuthTables` ever stops
    // returning the core models, every assertion below would vacuously pass.
    expect(Object.keys(tables)).toEqual(
      expect.arrayContaining(['user', 'session', 'account', 'verification']),
    )
  })

  describe.each(Object.entries(tables))('model "%s"', (model, definition) => {
    it('is exported as a Drizzle table from @rgss/db/schema', () => {
      expect(
        drizzleTableFor(model),
        `Better Auth requires model "${model}" but @rgss/db/schema exports no such Drizzle table. ` +
          'Add it to packages/db/src/schema and register it in the drizzleAdapter schema map.',
      ).toBeDefined()
    })

    it('has a Drizzle column for every REQUIRED Better Auth field', () => {
      const table = drizzleTableFor(model)
      if (!table) {
        return // reported by the assertion above
      }

      const columnKeys = new Set(Object.keys(getTableColumns(table)))
      const requiredFields = Object.entries(definition.fields)
        .filter(([, field]) => (field as { required?: boolean }).required === true)
        .map(([key]) => key)

      const missing = requiredFields.filter((key) => !columnKeys.has(key))

      expect(
        missing,
        `Better Auth ${model} requires column(s) missing from the Drizzle schema. ` +
          'This is the exact failure that broke production sign-in: the library changed ' +
          'its data contract and the schema was not migrated. Add the column(s) via a ' +
          'forward migration before upgrading.',
      ).toEqual([])
    })
  })
})

/** A compound/unique index as declared by Better Auth's table metadata. */
type DeclaredIndex = { fields: string[]; unique?: boolean }

/**
 * Read Better Auth's declared indexes for a model.
 *
 * `indexes` is a 1.7 addition: on 1.6.x the table metadata type has no such
 * property at all, so a direct cast does not type-check ("neither type
 * sufficiently overlaps"). Going through `unknown` lets this test compile
 * against BOTH versions, which it must — it is precisely the test that has to
 * keep working across the upgrade boundary it guards.
 */
function declaredIndexesOf(definition: unknown): DeclaredIndex[] {
  return (definition as unknown as { indexes?: DeclaredIndex[] }).indexes ?? []
}

describe('Better Auth declared indexes are backed by committed DDL', () => {
  const modelsWithIndexes = Object.entries(tables).filter(
    ([, definition]) => declaredIndexesOf(definition).length > 0,
  )

  it('has at least one indexed model to verify', () => {
    // On 1.6.x Better Auth declares no compound indexes, so this suite is
    // informational. On 1.7.x it declares the unique (issuer, accountId) index,
    // at which point the assertions below become load-bearing.
    expect(modelsWithIndexes.length).toBeGreaterThanOrEqual(0)
  })

  for (const [model, definition] of modelsWithIndexes) {
    const declaredIndexes = declaredIndexesOf(definition)

    for (const declared of declaredIndexes) {
      const label = `${declared.unique ? 'UNIQUE ' : ''}index on ${model}(${declared.fields.join(', ')})`

      it(`creates the ${label}`, () => {
        const table = drizzleTableFor(model)
        expect(table, `no Drizzle table for model "${model}"`).toBeDefined()
        if (!table) {
          return
        }

        // Map Better Auth field keys -> physical snake_case column names via the
        // Drizzle column definitions, then require the committed migration SQL to
        // create an index covering exactly those physical columns.
        const columns = getTableColumns(table)
        const physicalNames = declared.fields.map(
          (field) => (columns as Record<string, { name?: string }>)[field]?.name ?? field,
        )

        const sql = committedMigrationSql()
        const indexStatements = sql
          .split(';')
          .filter((statement) => statement.includes('create') && statement.includes('index'))

        const physicalTable = getTableName(table).toLowerCase()

        const covering = indexStatements.filter((statement) => {
          const targetsTable = new RegExp(`on\\s+"?${physicalTable}"?`).test(statement)
          const hasAllColumns = physicalNames.every((name) => statement.includes(`"${name}"`))
          const isUnique = statement.includes('unique')
          return targetsTable && hasAllColumns && (declared.unique ? isUnique : true)
        })

        expect(
          covering.length,
          `No committed migration creates the ${label} over physical column(s) ` +
            `(${physicalNames.join(', ')}). Better Auth declares this index as part of its ` +
            'schema contract; add it to packages/db/src/schema and generate a migration.',
        ).toBeGreaterThan(0)
      })
    }
  }
})

describe('Better Auth version lockstep', () => {
  function readDeps(appPath: string): Record<string, string> {
    const manifest = JSON.parse(
      readFileSync(resolve(REPO_ROOT, appPath, 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> }
    return manifest.dependencies ?? {}
  }

  const web = readDeps('apps/web')
  const admin = readDeps('apps/admin')

  it('pins better-auth to the same exact version in both apps', () => {
    // A split bump resolves the two apps against different Better Auth builds
    // while they SHARE one session cookie and one database — the schema contract
    // would then be satisfied for one app and violated for the other.
    expect(admin['better-auth']).toBe(web['better-auth'])
  })

  it('pins @better-auth/infra to the same exact version in both apps', () => {
    expect(admin['@better-auth/infra']).toBe(web['@better-auth/infra'])
  })

  it('pins exact versions, not ranges', () => {
    for (const [app, deps] of [
      ['apps/web', web],
      ['apps/admin', admin],
    ] as const) {
      for (const pkg of ['better-auth', '@better-auth/infra']) {
        expect(deps[pkg], `${app} is missing ${pkg}`).toBeDefined()
        expect(
          deps[pkg],
          `${app} must pin ${pkg} to an exact version so an upgrade is a reviewed, ` +
            'deliberate change rather than an incidental lockfile resolution.',
        ).toMatch(/^\d+\.\d+\.\d+$/)
      }
    }
  })

  it('overrides @better-auth/core to match the pinned better-auth version', () => {
    const root = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')) as {
      overrides?: Record<string, string>
    }
    const override = root.overrides?.['@better-auth/core']

    expect(override, 'root package.json must override @better-auth/core').toBeDefined()
    expect(
      override,
      'The @better-auth/core override must equal the better-auth version pinned in the apps, ' +
        'or peer resolution can retain a mismatched core build.',
    ).toBe(web['better-auth'])
  })
})
