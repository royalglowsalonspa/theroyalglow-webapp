/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 07-06-2026 & Updated - 07-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : google-signin
 * Scope        : Authentication
 *
 * Description  : Shared client helper that launches the Google OAuth flow
 *                directly (no intermediate /sign-in page) while preserving
 *                booking and UTM context across the redirect.
 *
 * Responsibilities :
 * - Persist URL context (book, utm_*, leadId, service) to sessionStorage
 * - Trigger Better Auth's Google social sign-in
 *
 * Features / Functionality :
 * - Single source of truth for "Sign in with Google" used by the navbar,
 *   mobile nav, and any future CTA
 * - Optional callbackURL so a CTA can return the user to a specific page
 *
 * Tech Stack   : TypeScript, Better Auth (client)
 * Layer        : Frontend
 *
 * Dependencies : @/lib/auth-client
 *
 * Notes        :
 * - sessionStorage key: rgss_auth_context (read by the onboarding flow)
 ************************************************************/

import { signIn } from '@/lib/auth-client'

// deepcode ignore HardcodedNonCryptoSecret: sessionStorage key name, not a secret
const AUTH_CONTEXT_KEY = 'rgss_auth_context'

const CONTEXT_PARAMS = [
  'book',
  'utm_source',
  'utm_campaign',
  'utm_medium',
  'leadId',
  'service',
] as const

/**
 * Save any booking/UTM context from the current URL so it survives the
 * OAuth round-trip. No-ops on the server and when there is nothing to keep.
 */
export function preserveAuthContext(): void {
  if (typeof window === 'undefined') {
    return
  }
  const params = new URLSearchParams(window.location.search)
  const context: Record<string, string> = {}
  for (const key of CONTEXT_PARAMS) {
    const value = params.get(key)
    if (value) {
      context[key] = value
    }
  }
  if (Object.keys(context).length > 0) {
    sessionStorage.setItem(AUTH_CONTEXT_KEY, JSON.stringify(context))
  }
}

/**
 * Launch Google OAuth directly. Preserves context first, then hands off to
 * Better Auth. Throws on failure so the caller can surface an error state.
 */
export async function startGoogleSignIn(callbackURL?: string): Promise<void> {
  preserveAuthContext()
  await signIn.social({
    provider: 'google',
    ...(callbackURL ? { callbackURL } : {}),
  })
}
