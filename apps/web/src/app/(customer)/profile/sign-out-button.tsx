/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : SignOutButton
 * Scope        : Customer Pages
 *
 * Description  : Client-side sign-out button that calls Better Auth's signOut
 *                and redirects the user to the homepage on completion.
 *
 * Responsibilities :
 * - Trigger sign-out via Better Auth client SDK
 * - Show loading state while sign-out is in progress
 * - Force-redirect to homepage on success or failure
 *
 * Features / Functionality :
 * - Disabled state during sign-out to prevent double-clicks
 * - aria-busy attribute for screen reader feedback
 * - Graceful fallback redirect even if signOut throws
 *
 * Tech Stack   : React, Better Auth
 * Layer        : Presentation
 *
 * Dependencies : signOut (auth-client), React (useState)
 *
 * Notes        :
 * - Uses window.location.href for a hard redirect to clear all client state
 ************************************************************/

'use client'

import { signOut } from '@/lib/auth-client'
import { useState } from 'react'

export function SignOutButton() {
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut({
        fetchOptions: {
          onSuccess: () => {
            window.location.href = '/'
          },
        },
      })
    } catch {
      // If sign-out fails, force a hard redirect home so the user isn't stuck.
      window.location.href = '/'
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      aria-busy={signingOut}
      className="font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-6 py-3 bg-cloud-gray text-cocoa-dark hover:bg-golden-mist motion-safe:transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {signingOut ? 'Signing out…' : 'Sign Out'}
    </button>
  )
}
