import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const schedule = vi.hoisted(() => vi.fn<(callback: () => Promise<void>) => void>())

vi.mock('next/server', () => ({ after: schedule }))

import { revalidateHooks } from '../revalidate'

const { afterChange, afterDelete } = revalidateHooks('offer')
const doc = { id: 'offer_1' }

beforeEach(() => {
  vi.stubEnv('WEB_APP_URL', 'https://web.example.test/')
  vi.stubEnv('REVALIDATE_SECRET', 'synthetic-test')
  schedule.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('CMS cache invalidation', () => {
  it('waits until the response before sending the cache refresh', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    const hook = afterChange[0]
    if (!hook) throw new Error('Missing cache refresh hook')
    expect(await hook({ doc } as Parameters<typeof hook>[0])).toBe(doc)
    expect(fetch).not.toHaveBeenCalled()
    await schedule.mock.calls[0]?.[0]()
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'https://web.example.test/api/revalidate',
      expect.objectContaining({
        body: JSON.stringify({ secret: 'synthetic-test', tag: 'offer' }),
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('reports a rejected refresh without failing the saved operation', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))
    const hook = afterDelete[0]
    if (!hook) throw new Error('Missing cache refresh hook')
    expect(await hook({ doc } as Parameters<typeof hook>[0])).toBe(doc)
    await schedule.mock.calls[0]?.[0]()
    expect(warn).toHaveBeenCalledWith('[revalidate] web app rejected the "offer" refresh (503)')
  })
})
