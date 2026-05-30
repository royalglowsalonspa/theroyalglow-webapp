'use client'

import { useState } from 'react'
import { signOut } from '@/lib/auth-client'

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
