import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { oneTap, preserveAuthContext } = vi.hoisted(() => ({
  oneTap: vi.fn(async () => undefined),
  preserveAuthContext: vi.fn(),
}))

vi.mock('@/lib/auth-client', () => ({
  oneTap,
  useSession: () => ({ data: null, isPending: false }),
}))
vi.mock('@/lib/google-signin', () => ({ preserveAuthContext }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'production')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('Google One Tap', () => {
  it('leaves iOS on the explicit sign-in flow without starting an automatic prompt', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone)')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const { GoogleOneTap } = await import('./GoogleOneTap')

    render(<GoogleOneTap />)

    expect(oneTap).not.toHaveBeenCalled()
    expect(preserveAuthContext).not.toHaveBeenCalled()
  })

  it('waits for a visible page and attempts the prompt only once across remounts', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    oneTap.mockRejectedValueOnce(new Error('Google prompt unavailable'))
    const { GoogleOneTap } = await import('./GoogleOneTap')
    const first = render(<GoogleOneTap />)
    expect(oneTap).not.toHaveBeenCalled()

    visibility.mockReturnValue('visible')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    first.unmount()
    render(<GoogleOneTap />)

    expect(oneTap).toHaveBeenCalledTimes(1)
    expect(preserveAuthContext).toHaveBeenCalledTimes(1)
  })
})
