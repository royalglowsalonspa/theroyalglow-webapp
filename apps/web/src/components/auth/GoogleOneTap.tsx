/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 07-06-2026 & Updated - 07-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GoogleOneTap
 * Scope        : Authentication
 *
 * Description  : Headless component that shows the Google One Tap prompt for
 *                signed-out visitors. Renders nothing visible; Google injects
 *                its own prompt UI in the top-right of the viewport.
 *
 * Responsibilities :
 * - Trigger the One Tap prompt once per session for signed-out users
 * - Preserve booking/UTM context so it survives the credential exchange
 * - Stay silent (no nagging) once dismissed or when already authenticated
 *
 * Features / Functionality :
 * - Skips entirely while the session is loading or the user is signed in
 * - Guards against duplicate prompts within the same page session
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

import { oneTap, useSession } from '@/lib/auth-client'
import { preserveAuthContext } from '@/lib/google-signin'
import { useEffect, useRef } from 'react'

export function GoogleOneTap() {
  const { data: session, isPending } = useSession()
  const triggered = useRef(false)

  useEffect(() => {
    if (isPending || session?.user || triggered.current) {
      return
    }
    triggered.current = true

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
          // Surface the credential-exchange failure so a failed "Continue"
          // (e.g. unauthorized JS origin / audience mismatch) is diagnosable,
          // and allow the prompt to be retried.
          if (process.env.NODE_ENV !== 'production') {
            console.error('[OneTap] sign-in failed:', ctx?.error)
          }
          triggered.current = false
        },
      },
    }).catch(() => {
      // Prompt failed to display (not an explicit dismissal). Allow a later
      // retry after navigation rather than spamming the prompt now.
      triggered.current = false
    })
  }, [isPending, session])

  return null
}
