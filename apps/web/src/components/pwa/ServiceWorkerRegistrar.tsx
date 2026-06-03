/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ServiceWorkerRegistrar
 * Scope        : PWA
 *
 * Description  : Registers the service worker (/sw.js) on window load event.
 *                Production-only, SSR-safe, no-op when unavailable.
 *
 * Responsibilities :
 * - Register /sw.js service worker in production environment
 * - No-op in development and where service workers are unavailable
 * - Render no visible UI
 *
 * Features / Functionality :
 * - Production-only SW registration
 * - Deferred to window load event for performance
 * - SSR-safe (all window/navigator access in useEffect)
 *
 * Tech Stack   : React, TypeScript
 * Layer        : Frontend
 *
 * Dependencies : None
 *
 * Notes        : None
 ************************************************************/

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
