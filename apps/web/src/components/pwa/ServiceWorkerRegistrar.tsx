'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker (`/sw.js`) on the `window` load event.
 * Production-only, and a no-op where service workers are unavailable.
 * All `window`/`navigator` access is inside the effect so it stays SSR-safe.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      return
    }

    if (!('serviceWorker' in navigator)) {
      return
    }

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    window.addEventListener('load', register)

    return () => {
      window.removeEventListener('load', register)
    }
  }, [])

  return null
}
