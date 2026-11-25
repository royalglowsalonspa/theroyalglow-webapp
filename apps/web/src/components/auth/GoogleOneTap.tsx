/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 07-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GoogleOneTap
 * Scope        : Authentication
 *
 * Description  : Headless component that shows the Google One Tap prompt for
 *                eligible signed-out visitors. Renders nothing
 *                visible; Google injects its own prompt UI (a top card on
 *                desktop, a native bottom sheet on mobile via FedCM).
 *
 * Responsibilities :
 * - Trigger the One Tap prompt once per page load for signed-out users
 * - Preserve booking/UTM context so it survives the credential exchange
 * - Stay silent (no nagging) once dismissed or when already authenticated
 *
 * Features / Functionality :
 * - iOS uses the explicit Google OAuth redirect
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

// An attempted prompt stays terminal until the next page load, including when
// the provider is blocked or the visitor dismisses it.
let promptAttempted = false

function usesIOS() {
  // iPadOS can send a desktop Mac user agent.
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function GoogleOneTap() {
  const { data: session, isPending } = useSession()
  const signedIn = Boolean(session?.user)

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || isPending || signedIn || promptAttempted) {
      return
    }

    // The automatic ITP prompt has thrown inside Google's script on iOS.
    // The existing sign-in button uses the supported redirect flow.
    if (usesIOS()) return

    function requestPrompt() {
      if (document.visibilityState !== 'visible' || promptAttempted) return
      promptAttempted = true
      document.removeEventListener('visibilitychange', requestPrompt)
      preserveAuthContext()

      void oneTap({
        fetchOptions: {
          // Pick up the session cookie written by the One Tap callback.
          onSuccess: () => window.location.reload(),
        },
      }).catch(() => undefined)
    }

    document.addEventListener('visibilitychange', requestPrompt)
    requestPrompt()
    return () => document.removeEventListener('visibilitychange', requestPrompt)
  }, [isPending, signedIn])

  return null
}
