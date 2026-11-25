/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : SignOutButton
 * Scope        : Customer Pages
 *
 * Description  : Client-side sign-out button that calls Better Auth's signOut
 *                and redirects the user to the homepage on completion. Rebuilt
 *                on the shadcn/ui Button primitive with a lucide spinner.
 *
 * Responsibilities :
 * - Trigger sign-out via Better Auth client SDK
 * - Show loading state while sign-out is in progress
 * - Redirect to the homepage when Better Auth confirms sign-out
 *
 * Features / Functionality :
 * - Disabled state during sign-out to prevent double-clicks
 * - aria-busy attribute for screen reader feedback
 * - Retry when the request fails
 *
 * Tech Stack   : React, Better Auth, shadcn/ui, lucide-react
 * Layer        : Presentation
 *
 * Dependencies : signOut (auth-client), React (useState, useRef),
 *                @/components/ui/button, lucide-react
 *
 * Notes        :
 * - Uses window.location.href for a hard redirect to clear all client state
 ************************************************************/

'use client'

import { Loader2, LogOut } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { signOut } from '@/lib/auth-client'

export function SignOutButton() {
  const [status, setStatus] = useState<'ready' | 'signing-out' | 'error'>('ready')
  const attemptInFlight = useRef(false)
  const signingOut = status === 'signing-out'

  async function handleSignOut() {
    if (attemptInFlight.current) return
    attemptInFlight.current = true
    setStatus('signing-out')
    try {
      const { data, error } = await signOut()
      if (error || !data?.success) {
        throw new Error('Sign-out failed')
      }
      window.location.href = '/'
    } catch {
      attemptInFlight.current = false
      setStatus('error')
    }
  }

  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        onClick={handleSignOut}
        disabled={signingOut}
        aria-busy={signingOut}
        className="rounded-full font-ui text-[12px] uppercase tracking-[0.5px] hover:bg-golden-mist"
      >
        {signingOut ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Signing out…
          </>
        ) : (
          <>
            <LogOut aria-hidden="true" />
            Sign Out
          </>
        )}
      </Button>
      {status === 'error' && (
        <p role="alert" className="mt-2 font-sans text-sm text-error">
          Could not sign out. Please try again.
        </p>
      )}
    </div>
  )
}
