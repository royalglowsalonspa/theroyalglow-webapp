import { expect, test } from 'bun:test'
import {
  productionConfig,
  stagingConfig,
  verifyProductionDatabase,
  verifyStagingDatabase,
} from './staging-config.mjs'

const source = Bun.file(new URL('../wrangler.jsonc', import.meta.url))
const template = Bun.JSONC.parse(await source.text())
const values = {
  INVOICE_STAGING_ACCOUNT_ID: '6493306f4e280b245bc0b862c64cd9ef',
  INVOICE_STAGING_D1_ID: '8245c807-92a8-4ce6-88ca-1564c7318638',
  INVOICE_STAGING_ACCESS_TEAM: 'royal-glow-fixture',
  INVOICE_STAGING_ACCESS_AUDIENCE: 'b'.repeat(64),
  INVOICE_STAGING_DEVELOPER_EMAIL: 'developer-fixture@gmail.com',
}
const productionValues = {
  INVOICE_PRODUCTION_ACCOUNT_ID: values.INVOICE_STAGING_ACCOUNT_ID,
  INVOICE_PRODUCTION_D1_ID: '392dcafc-dfc3-46a8-bc7a-5124f497ed71',
  INVOICE_PRODUCTION_ACCESS_TEAM: values.INVOICE_STAGING_ACCESS_TEAM,
  INVOICE_PRODUCTION_ACCESS_AUDIENCE: 'a'.repeat(64),
  INVOICE_PRODUCTION_DEVELOPER_EMAIL: values.INVOICE_STAGING_DEVELOPER_EMAIL,
}

test('generates an isolated Worker config with provider writes disabled', () => {
  const output = stagingConfig(template, values)
  expect(output).toMatchObject({
    name: 'rgss-invoice-staging',
    routes: [{ pattern: 'invoice-staging.theroyalglow.in', custom_domain: true }],
    workers_dev: false,
    preview_urls: false,
    d1_databases: [{ binding: 'DB', database_id: values.INVOICE_STAGING_D1_ID }],
    r2_buckets: [{ binding: 'FILES', bucket_name: 'rgss-invoice-staging' }],
    vars: {
      BILLING_SOURCE: 'staging',
      INVOICE_EMAIL_ENABLED: 'false',
      INVOICE_LEGACY_RESEND_ENABLED: 'false',
      ACCESS_POLICY_SYNC_ENABLED: 'false',
    },
  })
  expect(output.vars).not.toHaveProperty('BILLING_EVENT_SECRET')
})

test('rejects placeholder access settings and production or public bindings', () => {
  expect(() =>
    stagingConfig(template, { ...values, INVOICE_STAGING_ACCOUNT_ID: 'a'.repeat(32) }),
  ).toThrow('INVOICE_STAGING_ACCOUNT_ID')
  expect(() =>
    stagingConfig(template, {
      ...values,
      INVOICE_STAGING_D1_ID: '00000000-0000-0000-0000-000000000000',
    }),
  ).toThrow('INVOICE_STAGING_D1_ID')
  expect(() => stagingConfig(template, {})).toThrow('INVOICE_STAGING_ACCESS_AUDIENCE')
  expect(() => stagingConfig({ ...template, workers_dev: true }, values)).toThrow('workers_dev')
  expect(() =>
    stagingConfig({ ...template, routes: [{ pattern: 'invoice.theroyalglow.in' }] }, values),
  ).toThrow('routes')
  expect(() =>
    stagingConfig(
      { ...template, r2_buckets: [{ binding: 'FILES', bucket_name: 'rgss-invoices' }] },
      values,
    ),
  ).toThrow('r2_buckets')
  expect(() => stagingConfig({ ...template, migrations: [] }, values)).toThrow('SQLite')
})

test('rejects additional asset routing and provider bindings', () => {
  expect(() => stagingConfig({ ...template, assets: { directory: './public' } }, values)).toThrow(
    'assets',
  )
  expect(() => stagingConfig({ ...template, queues: { producers: [] } }, values)).toThrow('queues')
})

test('confirms the staged D1 ID from Cloudflare metadata before generating config', () => {
  const staging = {
    uuid: values.INVOICE_STAGING_D1_ID,
    name: 'rgss-invoice-staging',
  }
  const production = {
    uuid: '392dcafc-dfc3-46a8-bc7a-5124f497ed71',
    name: 'rgss-invoice-production',
  }
  expect(() => verifyStagingDatabase(staging.uuid, [production, staging])).not.toThrow()
  expect(() => verifyStagingDatabase(production.uuid, [production, staging])).toThrow(
    'INVOICE_STAGING_D1_ID',
  )
  expect(() => verifyStagingDatabase(staging.uuid, [])).toThrow('INVOICE_STAGING_D1_ID')
  expect(() =>
    verifyStagingDatabase(staging.uuid, [staging, { ...staging, uuid: production.uuid }]),
  ).toThrow('INVOICE_STAGING_D1_ID')
  expect(() => verifyStagingDatabase(staging.uuid, { error: 'Unauthorized' })).toThrow('metadata')
})

test('binds production to its own host, D1, R2, and Access audience with writes paused', () => {
  const output = productionConfig(template, { ...values, ...productionValues })
  expect(output).toMatchObject({
    name: 'rgss-invoice-production',
    routes: [{ pattern: 'invoice.theroyalglow.in', custom_domain: true }],
    workers_dev: false,
    preview_urls: false,
    d1_databases: [
      {
        binding: 'DB',
        database_name: 'rgss-invoice-production',
        database_id: productionValues.INVOICE_PRODUCTION_D1_ID,
      },
    ],
    r2_buckets: [{ binding: 'FILES', bucket_name: 'rgss-invoices' }],
    vars: {
      BILLING_SOURCE: 'production',
      ACCESS_AUDIENCE: productionValues.INVOICE_PRODUCTION_ACCESS_AUDIENCE,
      INVOICE_EMAIL_ENABLED: 'false',
      INVOICE_LEGACY_RESEND_ENABLED: 'false',
      ACCESS_POLICY_SYNC_ENABLED: 'false',
    },
  })
  expect(output.migrations).toEqual(template.migrations)
  expect(output.durable_objects).toEqual(template.durable_objects)
  expect(output.vars).not.toHaveProperty('BILLING_EVENT_SECRET')
  expect(() => productionConfig(template, values)).toThrow('INVOICE_PRODUCTION_ACCESS_AUDIENCE')
  expect(() =>
    productionConfig(template, {
      ...values,
      ...productionValues,
      INVOICE_PRODUCTION_ACCESS_AUDIENCE: values.INVOICE_STAGING_ACCESS_AUDIENCE,
    }),
  ).toThrow('must differ from the staging audience')
  expect(() => productionConfig({ ...template, preview_urls: true }, productionValues)).toThrow(
    'preview_urls',
  )
})

test('accepts only the verified production database name and ID for production', () => {
  const staging = { uuid: values.INVOICE_STAGING_D1_ID, name: 'rgss-invoice-staging' }
  const production = {
    uuid: productionValues.INVOICE_PRODUCTION_D1_ID,
    name: 'rgss-invoice-production',
  }
  expect(() => verifyProductionDatabase(production.uuid, [staging, production])).not.toThrow()
  expect(() => verifyProductionDatabase(staging.uuid, [staging, production])).toThrow(
    'INVOICE_PRODUCTION_D1_ID',
  )
  expect(() => verifyProductionDatabase(production.uuid, [staging])).toThrow(
    'INVOICE_PRODUCTION_D1_ID',
  )
})
