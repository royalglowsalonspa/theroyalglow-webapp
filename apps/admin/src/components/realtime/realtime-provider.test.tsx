import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AblyRealtimeOptions } from '@/lib/realtime/client'
import { RealtimeProvider, useRealtime } from './realtime-provider'

const { captureOptions, channel, close } = vi.hoisted(() => ({
  captureOptions: vi.fn<(options: AblyRealtimeOptions) => void>(),
  channel: vi.fn(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() })),
  close: vi.fn(),
}))

vi.mock('@/lib/realtime/client', () => ({
  loadAblyRealtime: async () =>
    class {
      connection = { on: vi.fn(), off: vi.fn() }
      channels = { get: channel }
      close = close

      constructor(options: AblyRealtimeOptions) {
        captureOptions(options)
      }
    },
}))

function ConnectionStatus() {
  return (
    <div role="status" aria-label="Realtime connection">
      {useRealtime()?.status}
    </div>
  )
}

async function requestToken(response: Response) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  render(
    <RealtimeProvider branchId="test-branch">
      <ConnectionStatus />
    </RealtimeProvider>,
  )
  await waitFor(() => expect(captureOptions).toHaveBeenCalledOnce())
  const options = captureOptions.mock.calls[0]?.[0]
  if (!options) throw new Error('Expected the realtime client to request authorization')
  return await act(
    () =>
      new Promise<{ error: unknown; token: unknown }>((resolve) => {
        options.authCallback({}, (error, token) => resolve({ error, token }))
      }),
  )
}

describe('realtime token requests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_ABLY_KEY', 'enabled')
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it.each([401, 403, 503])(
    'closes the connection when the token endpoint returns %i',
    async (status) => {
      const { error, token } = await requestToken(new Response(null, { status }))

      expect(error).toEqual(new Error(`token route ${status}`))
      expect(token).toBeNull()
      expect(close).toHaveBeenCalledOnce()
      expect(screen.getByRole('status', { name: 'Realtime connection' })).toHaveTextContent(
        'unavailable',
      )

      act(() => {
        window.dispatchEvent(new Event('offline'))
        window.dispatchEvent(new Event('online'))
      })

      expect(screen.getByRole('status', { name: 'Realtime connection' })).toHaveTextContent(
        'unavailable',
      )
      expect(channel).not.toHaveBeenCalled()
    },
  )

  it('lets the client retry a transient rate limit', async () => {
    const { error, token } = await requestToken(new Response(null, { status: 429 }))

    expect(error).toEqual(new Error('token route 429'))
    expect(token).toBeNull()
    expect(close).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(new Event('offline'))
      window.dispatchEvent(new Event('online'))
    })

    expect(screen.getByRole('status', { name: 'Realtime connection' })).toHaveTextContent(
      'disconnected',
    )
    expect(channel).toHaveBeenCalledWith('admin:bookings:test-branch')
  })

  it('returns a replacement token to a session that retains access', async () => {
    await expect(
      requestToken(Response.json({ success: true, data: 'replacement-token' })),
    ).resolves.toEqual({ error: null, token: 'replacement-token' })
    expect(close).not.toHaveBeenCalled()
  })
})
