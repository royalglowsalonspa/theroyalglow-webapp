import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { track } from '@/lib/analytics/events'
import { CONSENT_STORAGE_KEY, rejectNonEssential, setConsent } from '@/lib/consent/consent'
import { Analytics } from './Analytics'

const { downloadPostHog, sdk } = vi.hoisted(() => ({
  downloadPostHog: Promise.withResolvers<void>(),
  sdk: {
    init: vi.fn(),
    capture: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
  },
}))

vi.mock('posthog-js', async () => {
  await downloadPostHog.promise
  return { default: sdk }
})

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  delete window.posthog
  delete window.clarity
  delete window.fbq
  delete window._fbq
  for (const script of document.querySelectorAll(
    'script[src*="facebook.net"], script[src*="clarity.ms"]',
  )) {
    script.remove()
  }
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('analytics consent', () => {
  it('opts out initialized providers and immediately blocks first-party capture on withdrawal', () => {
    const clarity = vi.fn()
    const fbq = vi.fn()
    window.posthog = sdk
    window.clarity = clarity
    window.fbq = fbq
    setConsent({ analytics: true, marketing: true })
    render(<Analytics />)

    track('booking_started')
    expect(sdk.capture).toHaveBeenCalledOnce()
    expect(fbq).toHaveBeenCalledWith('trackCustom', 'booking_started', undefined)

    act(() => {
      rejectNonEssential()
    })
    expect(sdk.opt_out_capturing).toHaveBeenCalledOnce()
    expect(clarity).toHaveBeenCalledWith('stop')
    expect(clarity).toHaveBeenCalledWith('consentv2', {
      analytics_Storage: 'granted',
      ad_Storage: 'denied',
    })
    expect(clarity).toHaveBeenLastCalledWith('stop')
    expect(fbq).toHaveBeenLastCalledWith('consent', 'revoke')
    track('offer_clicked')
    expect(sdk.capture).toHaveBeenCalledOnce()
    expect(fbq).toHaveBeenLastCalledWith('consent', 'revoke')
  })

  it('discards queued grants and events if another tab withdraws consent before tags load', () => {
    vi.stubEnv('NEXT_PUBLIC_CLARITY_ID', 'test-project')
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', 'test-pixel')
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '')
    setConsent({ analytics: true, marketing: true })
    render(<Analytics />)
    track('Lead')

    const value = JSON.stringify({ decided: true, analytics: false, marketing: false })
    act(() => {
      localStorage.setItem(CONSENT_STORAGE_KEY, value)
      window.dispatchEvent(
        new StorageEvent('storage', { key: CONSENT_STORAGE_KEY, newValue: value }),
      )
    })

    expect(window.clarity?.q).toEqual([['stop']])
    expect(window.fbq).toHaveProperty('queue', [
      ['consent', 'revoke'],
      ['init', 'test-pixel'],
    ])
  })

  it('never initializes PostHog when withdrawal wins a race with the SDK import', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test')
    setConsent({ analytics: true })
    render(<Analytics />)
    expect(sdk.init).not.toHaveBeenCalled()

    act(() => {
      rejectNonEssential()
    })
    await act(async () => {
      downloadPostHog.resolve()
      await vi.dynamicImportSettled()
    })

    expect(sdk.init).not.toHaveBeenCalled()
  })
})
