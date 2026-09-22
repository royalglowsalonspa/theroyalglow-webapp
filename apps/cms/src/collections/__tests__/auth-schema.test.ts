import { readFileSync } from 'node:fs'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { BasePayload, buildConfig } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrations } from '../../migrations'
import { Users } from '../Users'

type SnapshotColumn = {
  name: string
  type: string
  notNull: boolean
  primaryKey: boolean
}

type Snapshot = {
  tables: Record<string, { columns: Record<string, SnapshotColumn> }>
}

describe('Payload auth schema compatibility', () => {
  const payload = new BasePayload()

  beforeAll(async () => {
    // Use Payload's real schema builder with the application's Users collection.
    // No server, database connection, email, telemetry, or generated file writes.
    const config = await buildConfig({
      secret: 'offline-auth-schema-test-only',
      admin: { user: Users.slug },
      collections: [Users],
      db: postgresAdapter({
        schemaName: 'cms',
        push: false,
        pool: { connectionString: 'postgresql://offline:offline@127.0.0.1:1/offline' },
      }),
      telemetry: false,
      typescript: { autoGenerate: false },
      logger: { options: { level: 'silent' } },
    })
    await payload.init({ config, disableDBConnect: true, disableOnInit: true })
  })

  afterAll(async () => {
    await payload.destroy()
  })

  it('keeps installed Payload auth columns in the latest committed migration snapshot', () => {
    const latestMigration = migrations.at(-1)
    if (!latestMigration) throw new Error('CMS migrations must include a schema snapshot')
    // This is a generated, checked-in Payload snapshot, not external request data.
    const snapshot: Snapshot = JSON.parse(
      readFileSync(
        new URL(`../../migrations/${latestMigration.name}.json`, import.meta.url),
        'utf8',
      ),
    )
    const authTables = Object.entries(payload.db.tables).filter(
      ([name]) => name === 'users' || name.startsWith('users_'),
    )
    expect(authTables.length).toBeGreaterThan(0)

    for (const [name, table] of authTables) {
      const currentColumns = Object.fromEntries(
        getTableConfig(table).columns.map((column) => [
          column.name,
          {
            name: column.name,
            type: column.getSQLType(),
            notNull: column.notNull,
            primaryKey: column.primary,
          },
        ]),
      )
      const committedColumns = Object.fromEntries(
        Object.entries(snapshot.tables[`cms.${name}`]?.columns ?? {}).map(([key, column]) => [
          key,
          {
            name: column.name,
            type: column.type,
            notNull: column.notNull,
            primaryKey: column.primaryKey,
          },
        ]),
      )
      expect(
        currentColumns,
        `Payload auth schema changed in cms.${name}; generate/review a CMS migration and regenerate types before upgrading`,
      ).toEqual(committedColumns)
    }
  })

  it('retains password-reset throttling without requiring a backfill for existing users', () => {
    const users = payload.collections.users?.config
    if (!users?.auth) throw new Error('The CMS users collection must enable authentication')
    expect(users.auth.forgotPassword?.minRequestInterval).toBeGreaterThan(0)

    const table = payload.db.tables.users
    if (!table) throw new Error('Missing CMS users table')
    const requestedAt = getTableConfig(table).columns.find(
      (column) => column.name === 'reset_password_requested_at',
    )
    expect(requestedAt?.getSQLType()).toBe('timestamp(3) with time zone')
    expect(requestedAt?.notNull).toBe(false)
  })
})
