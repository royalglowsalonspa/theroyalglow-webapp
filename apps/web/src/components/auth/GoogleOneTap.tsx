/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 07-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GoogleOneTap
 * Scope        : Authentication
 *
 * Description  : Headless component that shows the Google One Tap prompt for
 *                signed-out visitors on every viewport. Renders nothing
 *                visible; Google injects its own prompt UI (a top card on
 *                desktop, a native bottom sheet on mobile via FedCM).
 *
 * Responsibilities :
 * - Trigger the One Tap prompt once per page load for signed-out users
 * - Preserve booking/UTM context so it survives the credential exchange
 * - Filter Google's benign GSI diagnostics out of the dev error overlay
 * - Stay silent (no nagging) once dismissed or when already authenticated
 *
 * Features / Functionality :
 * - Works on mobile + desktop (mobile-first audience) via FedCM
 * - Module-level once-guard survives React StrictMode dev remounts
 * - Visible-tab guard; skips while session loading or user signed in
 *
 * Tech Stack   : React, TypeScript, Better Auth (One Tap client)
 * Layer        : Presentation (Auth)
 *
 * Dependencies : @/lib/auth-client, @/lib/google-signin
 *
 * Notes        :
 * - The prompt is suppressed on auth/admin/staff routes by the caller.
 ************************************************************/

'use client'

import { useEffect } from 'react'
import { oneTap, useSession } from '@/lib/auth-client'
import { preserveAuthContext } from '@/lib/google-signin'

// Module-level guards survive React StrictMode's dev remounts (a component ref
// would not). They ensure the prompt is requested at most once per page load
// and the console filter is installed at most once.
let oneTapRequested = false
let gsiNoiseSilenced = false

/**
 * Google's GSI client (accounts.google.com/gsi/client) logs its own
 * diagnostics through `console.error` with a "[GSI_LOGGER]" prefix — FedCM
 * aborts, transient "NetworkError: Error retrieving a token", and
 * "origin not allowed" while developing locally. None originate in our code
 * and all are non-actionable at runtime, yet Next's dev overlay surfaces every
 * console.error as a blocking "Console Error". We downgrade GSI's own logs to a
 * warning (still visible in the console, never in the overlay) and let all
 * other errors through untouched.
 */
function silenceGsiConsoleNoise() {
  if (gsiNoiseSilenced || typeof window === 'undefined') {
    return
  }
  gsiNoiseSilenced = true
  const original = console.error
  console.error = (...args: unknown[]) => {
    const text = args
      .map((a) => (typeof a === 'string' ? a : ((a as Error)?.message ?? '')))
      .join(' ')
    if (text.includes('[GSI_LOGGER]') || (text.includes('FedCM') && text.includes('Error'))) {
      console.warn(...args)
      return
    }
    original.apply(console, args)
  }
}

export function GoogleOneTap() {
  const { data: session, isPending } = useSession()

  useEffect(() => {
    if (isPending || session?.user || oneTapRequested) {
      return
    }
    // Local dev: skip the One Tap auto-prompt. Google's One Tap library emits
    // benign but noisy `[GSI_LOGGER]` FedCM deprecation warnings, and One Tap
    // only displays when the exact origin (http://localhost:3000) is
    // allow-listed on the OAuth client. Use the explicit "Sign in" button for
    // local testing; One Tap stays enabled in production.
    if (process.env.NODE_ENV !== 'production') {
      return
    }
    // Only prompt on a visible tab (avoids aborted background prompts).
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return
    }
    oneTapRequested = true
    silenceGsiConsoleNoise()

    // Keep booking/UTM context across the One Tap credential exchange.
    preserveAuthContext()

    oneTap({
      fetchOptions: {
        // The One Tap callback sets the session cookie server-side; a hard
        // reload makes the client pick it up so the navbar reflects the login
        // immediately (otherwise the cached useSession stays signed-out).
        onSuccess: () => {
          window.location.reload()
        },
        onError: (ctx) => {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[OneTap] prompt not completed:', ctx?.error)
          }
          // Allow a fresh attempt on a later page load.
          oneTapRequested = false
        },
      },
    }).catch(() => {
      oneTapRequested = false
    })
    // No cleanup cancel(): cancelling a pending FedCM request is itself what
    // triggers the AbortError. We let the prompt resolve naturally instead.
  }, [isPending, session])

  return null
}
