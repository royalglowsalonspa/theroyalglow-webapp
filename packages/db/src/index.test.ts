import { neonConfig } from '@neondatabase/serverless'
import { afterEach, expect, it, vi } from 'vitest'
import './index'

function query() {
  if (!neonConfig.fetchFunction) throw new Error('Missing Neon fetch configuration')
  return neonConfig.fetchFunction('https://isolated.example.invalid/sql', { method: 'POST' })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it.each(['ECONNRESET', 'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT', undefined])(
  'does not resend a request with an unknown result (%s)',
  async (code) => {
    const error = new TypeError('fetch failed', { cause: { code } })
    const fetcher = vi.fn().mockRejectedValue(error)
    vi.stubGlobal('fetch', fetcher)
    await expect(query()).rejects.toBe(error)
    expect(fetcher).toHaveBeenCalledTimes(1)
  },
)

it('retries an unestablished connection and returns the response', async () => {
  vi.useFakeTimers()
  const response = new Response(null, { status: 200 })
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(
      new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }),
    )
    .mockResolvedValueOnce(response)
  vi.stubGlobal('fetch', fetcher)
  const result = query()
  await vi.runAllTimersAsync()
  await expect(result).resolves.toBe(response)
  expect(fetcher).toHaveBeenCalledTimes(2)
})
