'use client'

import { useState } from 'react'
import { signIn } from '@/lib/auth-client'

const AUTH_CONTEXT_KEY = 'rgss_auth_context'

type SignInState = 'idle' | 'redirecting' | 'error'

export function SignInCard() {
  const [state, setState] = useState<SignInState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSignIn() {
    try {
      setState('redirecting')

      // Save any URL context to sessionStorage before OAuth redirect
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        const context: Record<string, string> = {}
        for (const key of ['book', 'utm_source', 'utm_campaign', 'utm_medium', 'leadId', 'service']) {
          const value = params.get(key)
          if (value) context[key] = value
        }
        if (Object.keys(context).length > 0) {
          sessionStorage.setItem(AUTH_CONTEXT_KEY, JSON.stringify(context))
        }
      }

      await signIn.social({ provider: 'google' })
    } catch {
      setState('error')
      setErrorMessage('Sign-in failed. Please try again.')
    }
  }

  return (
    <div className="w-full space-y-6 text-center">
      {/* Logo */}
      <div className="flex flex-col items-center gap-2">
        <div className="text-3xl font-bold tracking-tight text-stone-900">
          Royal Glow
        </div>
        <p className="text-sm text-stone-500">Salon & Spa</p>
      </div>

      {/* Heading */}
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-stone-900">
          Sign in to Royal Glow
        </h1>
        <p className="text-sm text-stone-500">
          Continue with your Google account to book appointments and manage your profile.
        </p>
      </div>

      {/* Google Sign-In Button */}
      <button
        type="button"
        onClick={handleSignIn}
        disabled={state === 'redirecting'}
        className="flex w-full items-center justify-center gap-3 rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-medium text-stone-700 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === 'redirecting' ? (
          <>
            <svg className="h-5 w-5 animate-spin text-stone-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Redirecting…</span>
          </>
        ) : (
          <>
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            <span>Continue with Google</span>
          </>
        )}
      </button>

      {/* Error State */}
      {state === 'error' && (
        <div className="space-y-2">
          <p className="text-sm text-red-600">{errorMessage}</p>
          <button
            type="button"
            onClick={() => {
              setState('idle')
              setErrorMessage('')
            }}
            className="text-sm font-medium text-stone-600 underline underline-offset-2 hover:text-stone-900"
          >
            Try again
          </button>
        </div>
      )}

      {/* Legal Links */}
      <p className="text-xs text-stone-400">
        By continuing, you agree to our{' '}
        <a href="/privacy" className="underline underline-offset-2 hover:text-stone-600">
          Privacy Policy
        </a>{' '}
        and{' '}
        <a href="/terms" className="underline underline-offset-2 hover:text-stone-600">
          Terms of Service
        </a>
        .
      </p>
    </div>
  )
}
