import { afterEach, describe, expect, it, vi } from 'vitest'
import { readRehearsalConfig, rehearsalAblyKey, rehearsalDatabaseUrl } from './rehearsal-config'

const stage = 'rehearsal-multi-branch'
const neonHost = 'ep-rehearsal-fixture.c-2.ap-southeast-1.aws.neon.tech'
const cert = 'arn:aws:acm:us-east-1:012345678901:certificate/00000000-0000-0000-0000-000000000001'
const inputs = {
  REHEARSAL_DOMAIN: 'staging.example.com',
  REHEARSAL_CERTIFICATE_ARN: cert,
  REHEARSAL_NEON_HOST: neonHost,
  REHEARSAL_ABLY_APP_ID: 'staging-app',
  PRODUCTION_ABLY_APP_ID: 'production-app',
  REHEARSAL_QSTASH_URL: 'https://qstash-eu-central-1.upstash.io',
  REHEARSAL_CMS_ORIGIN: 'https://cms.staging.example.com',
  REHEARSAL_INVOICING_ORIGIN: 'https://invoice.staging.example.com',
  REHEARSAL_R2_PUBLIC_ORIGIN: 'https://media.staging.example.com',
  REHEARSAL_R2_ENDPOINT: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
  REHEARSAL_R2_BUCKET: 'staging-assets',
  R2_BUCKET_NAME: 'production-assets',
  REHEARSAL_VAPID_PUBLIC_KEY: 'fixture-public-vapid',
  REHEARSAL_POSTHOG_KEY: 'phc_fixture',
  REHEARSAL_POSTHOG_HOST: 'https://eu.i.posthog.com',
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('isolated rehearsal settings', () => {
  it('only reads rehearsal settings for an explicitly named stage', () => {
    expect(readRehearsalConfig('production', {})).toBeUndefined()
    expect(readRehearsalConfig('dev', {})).toBeUndefined()
    expect(() => readRehearsalConfig('rehearsal', inputs)).toThrow('named rehearsal-*')
    expect(() => readRehearsalConfig(stage, {})).toThrow('REHEARSAL_DOMAIN')
    expect(readRehearsalConfig(stage, inputs)).toMatchObject({
      web: { hostname: 'web.staging.example.com', origin: 'https://web.staging.example.com', cert },
      admin: { origin: 'https://admin.staging.example.com', cert },
      cookieDomain: '.staging.example.com',
      contactEmail: 'rehearsal@staging.example.com',
    })
  })

  it.each([
    ['REHEARSAL_DOMAIN', 'preview.theroyalglow.in'],
    ['REHEARSAL_CERTIFICATE_ARN', cert.replace('us-east-1', 'ap-southeast-1')],
    ['REHEARSAL_NEON_HOST', neonHost.replace('.', '-pooler.')],
    ['REHEARSAL_ABLY_APP_ID', inputs.PRODUCTION_ABLY_APP_ID],
    ['REHEARSAL_R2_BUCKET', inputs.R2_BUCKET_NAME],
    ['REHEARSAL_CMS_ORIGIN', 'https://cms.theroyalglow.in'],
    ['REHEARSAL_INVOICING_ORIGIN', 'http://invoice.staging.example.com'],
    ['REHEARSAL_R2_PUBLIC_ORIGIN', 'https://media.staging.example.com/?token=fixture'],
  ])('rejects an invalid or production value for %s', (name, value) => {
    expect(() => readRehearsalConfig(stage, { ...inputs, [name]: value })).toThrow(name)
  })

  it('checks provider identities without returning secret values in errors', () => {
    const pooled = `postgresql://fixture:secret@${neonHost.replace('.', '-pooler.')}/test?sslmode=require`
    expect(rehearsalDatabaseUrl(pooled, neonHost, false)).toBe(pooled)
    expect(new URL(rehearsalDatabaseUrl(pooled, neonHost, true)).hostname).toBe(neonHost)
    expect(() =>
      rehearsalDatabaseUrl(pooled, neonHost.replace('rehearsal', 'other'), false),
    ).toThrow(/^The rehearsal database secret does not match REHEARSAL_NEON_HOST$/)
    expect(rehearsalAblyKey('staging-app.fixture:secret', 'staging-app')).toBe(
      'staging-app.fixture:secret',
    )
    expect(() => rehearsalAblyKey('production-app.fixture:secret', 'staging-app')).toThrow(
      /^The rehearsal Ably secret does not match REHEARSAL_ABLY_APP_ID$/,
    )
  })
})

it('uses independent rehearsal settings and preserves production domains and secrets', async () => {
  for (const [name, value] of Object.entries(inputs)) vi.stubEnv(name, value)
  vi.stubEnv('DATABASE_URL_UNPOOLED', 'postgresql://production.invalid/db')

  const sites = new Map<string, unknown>()
  const secrets = new Set<string>()
  const dns = vi.fn(() => ({ fixture: 'production DNS' }))
  vi.stubGlobal('$config', (config: unknown) => config)
  vi.stubGlobal('$app', { stage })
  vi.stubGlobal('sst', {
    Secret: class {
      readonly value: string | { apply: (convert: (input: string) => unknown) => unknown }

      constructor(name: string) {
        secrets.add(name)
        const values: Record<string, string> = {
          RehearsalDatabaseUrl: `postgresql://fixture@${neonHost.replace('.', '-pooler.')}/test`,
          RehearsalAblyPrivateKey: 'staging-app.fixture:synthetic',
        }
        const value = values[name]
        this.value = value ? { apply: (convert) => convert(value) } : 'synthetic'
      }
    },
    cloudflare: { dns },
    aws: {
      Nextjs: class {
        readonly url = 'https://fixture.example.com'

        constructor(name: string, options: unknown) {
          sites.set(name, options)
        }
      },
    },
  })

  const { default: sstConfig } = await import('../../sst.config')
  expect(await sstConfig.app({ stage })).toMatchObject({
    providers: { aws: { region: 'ap-southeast-1' } },
  })
  await sstConfig.run?.()
  expect(dns).not.toHaveBeenCalled()
  expect(secrets.size).toBeGreaterThan(0)
  expect([...secrets].every((name) => name.startsWith('Rehearsal'))).toBe(true)
  expect(sites.get('Web')).toMatchObject({
    domain: { name: 'web.staging.example.com', dns: false, cert },
    environment: {
      BETTER_AUTH_URL: 'https://web.staging.example.com',
      COOKIE_DOMAIN: '.staging.example.com',
      NEXT_PUBLIC_ADMIN_URL: 'https://admin.staging.example.com',
      NEXT_PUBLIC_CMS_URL: inputs.REHEARSAL_CMS_ORIGIN,
      CONTACT_INBOX_EMAIL: 'rehearsal@staging.example.com',
      R2_BUCKET_NAME: 'staging-assets',
    },
  })
  expect(sites.get('Admin')).toMatchObject({
    domain: { name: 'admin.staging.example.com', dns: false, cert },
    environment: {
      BETTER_AUTH_URL: 'https://admin.staging.example.com',
      COOKIE_DOMAIN: '.staging.example.com',
      NEXT_PUBLIC_WEB_ORIGIN: 'https://web.staging.example.com',
      DATABASE_URL_UNPOOLED: `postgresql://fixture@${neonHost}/test`,
      ABLY_PRIVATE_KEY: 'staging-app.fixture:synthetic',
      QSTASH_URL: inputs.REHEARSAL_QSTASH_URL,
      INVOICING_SERVICE_URL: inputs.REHEARSAL_INVOICING_ORIGIN,
    },
  })

  sites.clear()
  secrets.clear()
  vi.stubGlobal('$app', { stage: 'production' })
  await sstConfig.run?.()
  expect(dns).toHaveBeenCalledOnce()
  expect(secrets).toContain('DatabaseUrl')
  expect(secrets).not.toContain('RehearsalDatabaseUrl')
  expect(sites.get('Web')).toMatchObject({
    domain: { name: 'theroyalglow.in', redirects: ['www.theroyalglow.in'] },
    environment: {
      BETTER_AUTH_URL: 'https://theroyalglow.in',
      R2_BUCKET_NAME: 'production-assets',
    },
  })
  expect(sites.get('Admin')).toMatchObject({
    domain: { name: 'admin.theroyalglow.in' },
    environment: { BETTER_AUTH_URL: 'https://admin.theroyalglow.in' },
  })
})
