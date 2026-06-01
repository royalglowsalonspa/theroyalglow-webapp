'use client'

import { CONSENT_EVENT, getConsent } from '@/lib/consent/consent'
import { useEffect } from 'react'

/**
 * Consent-gated, key-guarded analytics loader.
 *
 * Mounted once in the root layout. On mount and on every `CONSENT_EVENT` it
 * re-reads consent and (re)evaluates whether to load each provider:
 *   - PostHog  → analytics consent + `NEXT_PUBLIC_POSTHOG_KEY`
 *   - Microsoft Clarity → analytics consent + `NEXT_PUBLIC_CLARITY_ID`
 *   - Meta Pixel → marketing consent + `NEXT_PUBLIC_META_PIXEL_ID`
 *
 * Every provider is double-gated (consent AND a configured key), loaded at
 * most once, and every path is wrapped so analytics can never throw into the
 * app. Renders no visible UI.
 */

/** Minimal shape of the `posthog-js` default export we depend on. */
type PostHogLike = {
  init: (key: string, options?: Record<string, unknown>) => void
  capture: (event: string, props?: Record<string, unknown>) => void
}

type PostHogModule = {
  default?: PostHogLike
} & Partial<PostHogLike>

type FbqFn = (...args: unknown[]) => void

type FbqInstance = FbqFn & {
  callMethod?: (...args: unknown[]) => void
  queue: unknown[]
  push: FbqFn
  loaded: boolean
  version: string
}

type ClarityFn = (...args: unknown[]) => void

type ClarityInstance = ClarityFn & {
  q: unknown[]
}

// `window.posthog` and `window.fbq` are already declared in `lib/analytics/events.ts`.
// Only augment the additional `_fbq` alias the Meta Pixel bootstrap sets and the
// `clarity` queue shim, to avoid a conflicting re-declaration of the existing
// `posthog`/`fbq` properties.
declare global {
  interface Window {
    _fbq?: Window['fbq']
    clarity?: (...args: unknown[]) => void
  }
}

const isDev = process.env.NODE_ENV !== 'production'

function logDevError(scope: string, error: unknown): void {
  if (isDev) {
    console.error(`[analytics] ${scope}`, error)
  }
}

let posthogLoading = false
let clarityLoading = false

async function loadPostHog(): Promise<void> {
  if (typeof window === 'undefined' || window.posthog || posthogLoading) {
    return
  }

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) {
    return
  }

  posthogLoading = true

  try {
    // Guarded dynamic import: `posthog-js` is an optional dependency and need
    // not be installed for the build to pass.
    const mod = (await import('posthog-js' as string).catch(() => null)) as PostHogModule | null

    if (!mod) {
      return
    }

    const instance =
      mod.default ?? (typeof mod.init === 'function' ? (mod as PostHogLike) : undefined)
    if (!instance || typeof instance.init !== 'function') {
      return
    }

    instance.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com',
      capture_pageview: true,
      persistence: 'localStorage',
    })

    // Expose the instance so `events.ts#track` can forward events to it.
    window.posthog = instance
  } catch (error) {
    logDevError('posthog init failed', error)
  } finally {
    posthogLoading = false
  }
}

function loadMetaPixel(): void {
  if (typeof window === 'undefined' || window.fbq) {
    return
  }

  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID
  if (!pixelId) {
    return
  }

  try {
    // Standard Meta Pixel bootstrap, typed instead of the vendor's `any` snippet.
    const fbq = ((...args: unknown[]): void => {
      if (fbq.callMethod) {
        fbq.callMethod(...args)
      } else {
        fbq.queue.push(args)
      }
    }) as FbqInstance

    fbq.queue = []
    fbq.loaded = true
    fbq.version = '2.0'
    fbq.push = fbq

    window.fbq = fbq
    window._fbq = window.fbq

    const script = document.createElement('script')
    script.async = true
    script.src = 'https://connect.facebook.net/en_US/fbevents.js'
    const first = document.getElementsByTagName('script')[0]
    first?.parentNode?.insertBefore(script, first)

    window.fbq('init', pixelId)
    window.fbq('track', 'PageView')
  } catch (error) {
    logDevError('meta pixel init failed', error)
  }
}

function loadClarity(): void {
  if (typeof window === 'undefined' || window.clarity || clarityLoading) {
    return
  }

  const clarityId = process.env.NEXT_PUBLIC_CLARITY_ID
  if (!clarityId) {
    return
  }

  clarityLoading = true

  try {
    // Standard Microsoft Clarity bootstrap, typed instead of the vendor's
    // `eval`-based `any` snippet. Equivalent to:
    //   (function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[])
    //     .push(arguments)};t=l.createElement(r);t.async=1;
    //     t.src="https://www.clarity.ms/tag/"+i;
    //     y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    //   })(window, document, 'clarity', 'script', clarityId)
    const clarity = ((...args: unknown[]): void => {
      clarity.q.push(args)
    }) as ClarityInstance
    clarity.q = []

    window.clarity = clarity

    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.clarity.ms/tag/${clarityId}`
    const first = document.getElementsByTagName('script')[0]
    first?.parentNode?.insertBefore(script, first)
  } catch (error) {
    logDevError('clarity init failed', error)
  } finally {
    clarityLoading = false
  }
}

function evaluateConsent(): void {
  try {
    const consent = getConsent()

    if (consent.analytics) {
      void loadPostHog()
      loadClarity()
    }

    if (consent.marketing) {
      loadMetaPixel()
    }
  } catch (error) {
    logDevError('consent evaluation failed', error)
  }
}

export function Analytics() {
  useEffect(() => {
    evaluateConsent()

    const handleConsentChange = () => evaluateConsent()
    window.addEventListener(CONSENT_EVENT, handleConsentChange)
    return () => window.removeEventListener(CONSENT_EVENT, handleConsentChange)
  }, [])

  return null
}
