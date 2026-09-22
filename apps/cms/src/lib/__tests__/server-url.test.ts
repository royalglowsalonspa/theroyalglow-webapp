import { describe, expect, it, vi } from 'vitest'
import { resolveServerURL } from '../server-url'

describe('resolveServerURL', () => {
  it('returns the configured origin untouched', () => {
    const warn = vi.fn()
    const url = resolveServerURL(
      { PAYLOAD_PUBLIC_SERVER_URL: 'https://cms.theroyalglow.in', NODE_ENV: 'production' },
      warn,
    )
    expect(url).toBe('https://cms.theroyalglow.in')
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns in production when the trusted origin is missing', () => {
    const warn = vi.fn()
    expect(resolveServerURL({ NODE_ENV: 'production' }, warn)).toBe('')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('PAYLOAD_PUBLIC_SERVER_URL is empty in production')
  })

  it('treats an explicitly empty value as missing', () => {
    const warn = vi.fn()
    expect(resolveServerURL({ PAYLOAD_PUBLIC_SERVER_URL: '', NODE_ENV: 'production' }, warn)).toBe(
      '',
    )
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('stays silent outside production so local and CI runs are unaffected', () => {
    for (const NODE_ENV of ['development', 'test', undefined] as const) {
      const warn = vi.fn()
      expect(resolveServerURL({ ...(NODE_ENV ? { NODE_ENV } : {}) }, warn)).toBe('')
      expect(warn, `NODE_ENV=${NODE_ENV}`).not.toHaveBeenCalled()
    }
  })
})
