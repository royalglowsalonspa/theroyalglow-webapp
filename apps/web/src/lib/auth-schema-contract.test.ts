import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '@rgss/db/schema'
import { getAuthTables } from 'better-auth/db'
import { getTableColumns, is } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import {
  createAuthSchemaOptions as adminOptions,
  authDatabaseSchema as adminSchema,
} from '../../../admin/src/lib/auth-schema-options'
import {
  createAuthSchemaOptions as webOptions,
  authDatabaseSchema as webSchema,
} from './auth-schema-options'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

type ContractIndex = { fields: readonly string[]; unique: boolean }
type SnapshotTable = {
  columns: Record<string, { notNull: boolean; default?: unknown }>
  indexes: Record<
    string,
    {
      columns: { expression: string; isExpression: boolean }[]
      isUnique: boolean
      where?: string
    }
  >
  uniqueConstraints: Record<string, { columns: string[] }>
}

/** Read the final journalled schema, never CREATE statements from obsolete migrations. */
function latestSnapshot(): Record<string, SnapshotTable> {
  const directory = resolve(REPO_ROOT, 'packages/db/migrations/meta')
  const journal = JSON.parse(readFileSync(resolve(directory, '_journal.json'), 'utf8')) as {
    entries: { idx: number }[]
  }
  const latest = journal.entries.at(-1)
  if (!latest) throw new Error('No committed Drizzle migration snapshot')
  const file = `${String(latest.idx).padStart(4, '0')}_snapshot.json`
  const snapshot = JSON.parse(readFileSync(resolve(directory, file), 'utf8')) as {
    tables: Record<string, SnapshotTable>
  }
  return snapshot.tables
}

function drizzleTableFor(
  model: string,
  adapterSchema: Record<string, unknown>,
): PgTable | undefined {
  const candidate = adapterSchema[model]
  return is(candidate, PgTable) ? candidate : undefined
}

function drizzleIndexes(table: PgTable): ContractIndex[] {
  const config = getTableConfig(table)
  return [
    ...config.indexes
      .filter((index) => !index.config.where)
      .map(({ config: index }) => ({
        fields: index.columns.map((column) => ('name' in column ? (column.name ?? '') : '')),
        unique: index.unique,
      })),
    ...config.uniqueConstraints.map((constraint) => ({
      fields: constraint.columns.map((column) => column.name),
      unique: true,
    })),
    ...config.columns
      .filter((column) => column.isUnique || column.primary)
      .map((column) => ({
        fields: [column.name],
        unique: true,
      })),
  ]
}

function snapshotIndexes(table: SnapshotTable): ContractIndex[] {
  return [
    ...Object.values(table.indexes)
      .filter((index) => !index.where && index.columns.every((column) => !column.isExpression))
      .map((index) => ({
        fields: index.columns.map((column) => column.expression),
        unique: index.isUnique,
      })),
    ...Object.values(table.uniqueConstraints).map((constraint) => ({
      fields: constraint.columns,
      unique: true,
    })),
  ]
}

function covers(indexes: ContractIndex[], required: ContractIndex): boolean {
  return indexes.some(
    (index) =>
      (!required.unique || index.unique) &&
      index.fields.length === required.fields.length &&
      index.fields.every((field, position) => field === required.fields[position]),
  )
}

const snapshot = latestSnapshot()
const credentials = { clientId: 'schema-contract', clientSecret: 'schema-contract' }

// These factories are also spread into the real auth servers: no mirrored plugin
// list, DB connection, environment secret, or type-suppression cast is involved.
describe.each([
  ['web', webOptions(credentials), webSchema],
  ['admin', adminOptions(credentials), adminSchema],
] as const)('%s Better Auth schema contract', (_app, options, adapterSchema) => {
  const tables = getAuthTables(options)

  it('loads the core models and protects the application role from client input', () => {
    expect(Object.keys(tables)).toEqual(
      expect.arrayContaining(['user', 'session', 'account', 'verification']),
    )
    expect(tables.user?.fields.role?.input).toBe(false)
    expect(tables.user?.fields.role?.defaultValue).toBe('customer')
  })

  for (const [model, definition] of Object.entries(tables)) {
    describe(`model ${model}`, () => {
      it('has every required library field in Drizzle and the latest migration snapshot', () => {
        const table = drizzleTableFor(definition.modelName, adapterSchema)
        expect(table, `Add ${definition.modelName} to the Drizzle adapter schema`).toBeDefined()
        if (!table) return
        const config = getTableConfig(table)
        const committed = snapshot[`${config.schema ?? 'public'}.${config.name}`]
        expect(committed, `Generate a migration for ${model}`).toBeDefined()
        if (!committed) return
        const columns = getTableColumns(table)
        for (const [field, attribute] of Object.entries(definition.fields)) {
          if (!attribute.required) continue
          const column = columns[attribute.fieldName ?? field]
          expect(column, `${model}.${field} requires a Drizzle column`).toBeDefined()
          if (column)
            expect(
              committed.columns[column.name],
              `${model}.${field} requires a migration`,
            ).toBeDefined()
        }
      })

      it('has no mandatory column that the installed library cannot populate', () => {
        const table = drizzleTableFor(definition.modelName, adapterSchema)
        if (!table) return
        const config = getTableConfig(table)
        const committed = snapshot[`${config.schema ?? 'public'}.${config.name}`]
        if (!committed) return
        const supplied = new Set([
          'id',
          ...Object.entries(definition.fields).map(([key, field]) => field.fieldName ?? key),
        ])
        const columns = getTableColumns(table)
        const unsupported = Object.entries(columns)
          .filter(([key, column]) => column.notNull && !column.hasDefault && !supplied.has(key))
          .map(([key]) => key)
        expect(
          unsupported,
          `${model}: relax removed required fields with a forward migration`,
        ).toEqual([])
        const physicalFields = new Set(
          [...supplied].map((key) => columns[key]?.name).filter(Boolean),
        )
        const unsupportedSnapshot = Object.entries(committed.columns)
          .filter(
            ([key, column]) =>
              key !== 'id' &&
              column.notNull &&
              column.default === undefined &&
              !physicalFields.has(key),
          )
          .map(([key]) => key)
        expect(
          unsupportedSnapshot,
          `${model}: latest snapshot still requires a removed field`,
        ).toEqual([])
      })

      it('backs declared unique fields and compound indexes with current schema and snapshot indexes', () => {
        const table = drizzleTableFor(definition.modelName, adapterSchema)
        if (!table) return
        const config = getTableConfig(table)
        const committed = snapshot[`${config.schema ?? 'public'}.${config.name}`]
        if (!committed) return
        const columns = getTableColumns(table)
        const required: ContractIndex[] = [
          ...(definition.indexes ?? []).map((index) => ({
            fields: index.fields,
            unique: index.unique ?? false,
          })),
          ...Object.entries(definition.fields)
            .filter(([, field]) => field.unique)
            .map(([field]) => ({ fields: [field], unique: true })),
        ]
        for (const index of required) {
          const physical = {
            ...index,
            fields: index.fields.map(
              (field) => columns[definition.fields[field]?.fieldName ?? field]?.name ?? field,
            ),
          }
          const label = `${model}(${physical.fields.join(', ')})${index.unique ? ' UNIQUE' : ''}`
          expect(
            covers(drizzleIndexes(table), physical),
            `Missing current Drizzle index: ${label}`,
          ).toBe(true)
          expect(
            covers(snapshotIndexes(committed), physical),
            `Missing latest migration index: ${label}`,
          ).toBe(true)
        }
      })
    })
  }
})

describe('provider-based account identity regression', () => {
  it('keeps the legacy issuer nullable and replaces issuer uniqueness with provider identity', () => {
    const account = snapshot['public.account']
    expect(account).toBeDefined()
    if (!account) return
    expect(schema.account.issuer.notNull).toBe(false)
    expect(account.columns.issuer?.notNull).toBe(false)
    const providerKey = { fields: ['provider_id', 'account_id'], unique: true }
    const obsoleteKey = { fields: ['issuer', 'account_id'], unique: true }
    for (const indexes of [drizzleIndexes(schema.account), snapshotIndexes(account)]) {
      expect(covers(indexes, providerKey)).toBe(true)
      expect(covers(indexes, obsoleteKey)).toBe(false)
    }
  })

  it('does not accept uniqueness on a superset of the identity key', () => {
    expect(
      covers([{ fields: ['provider_id', 'account_id', 'user_id'], unique: true }], {
        fields: ['provider_id', 'account_id'],
        unique: true,
      }),
    ).toBe(false)
  })
})
