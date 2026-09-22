import { readFileSync } from 'node:fs'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { BasePayload } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { migrations } from '../../migrations'

type StorageColumn = { name: string; type: string; notNull: boolean; primaryKey: boolean }
type Snapshot = { tables: Record<string, { columns: Record<string, StorageColumn> }> }

async function buildMediaSchema(enableStorage: boolean) {
  // Import the real application config twice with explicit inert credentials.
  // This catches a missing alwaysInsertFields option in our config, not only
  // whether a separately constructed test plugin supports that option.
  vi.stubEnv('DATABASE_URL', 'postgresql://offline:offline@127.0.0.1:1/offline')
  vi.stubEnv('PAYLOAD_SECRET', 'offline-storage-schema-test-only')
  vi.stubEnv('PAYLOAD_PUBLIC_SERVER_URL', 'https://cms.example.test')
  vi.stubEnv('WEB_APP_URL', 'https://web.example.test')
  vi.stubEnv('RESEND_API_KEY', '')
  vi.stubEnv('R2_BUCKET_NAME', enableStorage ? 'offline-schema' : '')
  vi.stubEnv('R2_ENDPOINT', enableStorage ? 'https://r2.example.test' : '')
  vi.stubEnv('R2_ACCESS_KEY_ID', enableStorage ? 'offline' : '')
  vi.stubEnv('R2_SECRET_ACCESS_KEY', enableStorage ? 'offline' : '')
  vi.resetModules()
  const { default: configPromise } = await import('../../payload.config')
  const config = await configPromise
  config.telemetry = false
  config.typescript.autoGenerate = false
  const payload = new BasePayload()

  try {
    await payload.init({ config, disableDBConnect: true, disableOnInit: true })
    const media = payload.collections.media?.config
    if (!media?.upload) throw new Error('The media collection must enable uploads')
    expect(media.upload.adapter).toBe(enableStorage ? 's3' : undefined)
    const table = payload.db.tables.media
    if (!table) throw new Error('Missing CMS media table')
    return Object.fromEntries(
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
  } finally {
    await payload.destroy()
  }
}

describe('Payload storage schema compatibility', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('preserves committed storage columns with and without R2 credentials', async () => {
    const enabled = await buildMediaSchema(true)
    const disabled = await buildMediaSchema(false)
    expect(disabled).toEqual(enabled)

    const latestMigration = migrations.at(-1)
    if (!latestMigration) throw new Error('CMS migrations must include a schema snapshot')
    const snapshot: Snapshot = JSON.parse(
      readFileSync(
        new URL(`../../migrations/${latestMigration.name}.json`, import.meta.url),
        'utf8',
      ),
    )
    const committed = Object.fromEntries(
      Object.entries(snapshot.tables['cms.media']?.columns ?? {}).map(([key, column]) => [
        key,
        {
          name: column.name,
          type: column.type,
          notNull: column.notNull,
          primaryKey: column.primaryKey,
        },
      ]),
    )
    expect(enabled, 'Generate/review a CMS migration when storage plugin columns change').toEqual(
      committed,
    )
  }, 30_000)
})
