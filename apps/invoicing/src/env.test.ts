import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('invoice storage environment', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('INVOICE_PDF_HMAC_SECRET', 'fixture')
    vi.stubEnv('R2_ENDPOINT', 'https://s3.example.invalid')
    vi.stubEnv('R2_ACCESS_KEY_ID', 'fixture')
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'fixture')
    vi.stubEnv('R2_INVOICE_ACCESS', undefined)
    vi.stubEnv('R2_PUBLIC_BASE_URL', 'https://legacy.example.invalid/')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('rejects a public renderer configuration for the dedicated bucket', async () => {
    vi.stubEnv('R2_BUCKET_NAME', 'rgss-invoices')
    await expect(import('./env')).rejects.toThrow('Set to private for the dedicated rgss-invoices')
  })

  it('accepts the dedicated bucket without a public base in private mode', async () => {
    vi.stubEnv('R2_BUCKET_NAME', 'rgss-invoices')
    vi.stubEnv('R2_INVOICE_ACCESS', 'private')
    vi.stubEnv('R2_PUBLIC_BASE_URL', '')
    const { env } = await import('./env')
    expect(env.R2_BUCKET_NAME).toBe('rgss-invoices')
    expect(env.R2_INVOICE_ACCESS).toBe('private')
    expect(env.R2_PUBLIC_BASE_URL).toBeUndefined()
  })

  it('preserves the existing public deployment contract for older buckets', async () => {
    vi.stubEnv('R2_BUCKET_NAME', 'legacy-invoice-storage')
    const { env } = await import('./env')
    expect(env.R2_INVOICE_ACCESS).toBe('public')
    expect(env.R2_PUBLIC_BASE_URL).toBe('https://legacy.example.invalid')
  })
})
