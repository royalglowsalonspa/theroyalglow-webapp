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
 * - First-time registrations are sent to /onboarding via newUserCallbackURL
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
import { ONBOARDING_PATH } from '@/lib/onboarding-prompt'

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
 * Where a FIRST-TIME registration lands, so the profile-completion form is the
 * first thing a new customer sees. Taken from the dependency-free
 * `@/lib/onboarding-prompt` (never `@/lib/onboarding-guard`, which pulls in the
 * DB client and must not reach a client bundle).
 */
export const NEW_USER_CALLBACK_URL = ONBOARDING_PATH

/**
 * Record that the customer was mid-booking when they were sent to /onboarding,
 * so the booking dialog reopens once the profile row exists.
 *
 * Needed for the ALREADY-SIGNED-IN path: a customer who skipped onboarding and
 * later hits Submit is bounced by the API's 403 ONBOARDING_REQUIRED, with no
 * OAuth round trip to carry `?book=1` — so the intent is written here instead of
 * by preserveAuthContext(). Merges into the existing context rather than
 * replacing it, to keep any UTM/lead attribution already captured.
 */
export function markBookingIntentForOnboarding(): void {
  if (typeof window === 'undefined') {
    return
  }
  let context: Record<string, string> = {}
  const stored = sessionStorage.getItem(AUTH_CONTEXT_KEY)
  if (stored) {
    try {
      const parsed: unknown = JSON.parse(stored)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        context = parsed as Record<string, string>
      }
    } catch {
      // Corrupt payload: start clean rather than throwing away the intent.
    }
  }
  context.book = '1'
  sessionStorage.setItem(AUTH_CONTEXT_KEY, JSON.stringify(context))
}

/**
 * Launch Google OAuth directly. Preserves context first, then hands off to
 * Better Auth. Throws on failure so the caller can surface an error state.
 *
 * `newUserCallbackURL` is what actually routes a brand-new customer into
 * onboarding. Better Auth's OAuth callback picks the target with
 * `isRegister ? newUserURL || callbackURL : callbackURL`, so a first sign-in
 * goes to /onboarding while a returning user still lands on `callbackURL`
 * (or the default origin root) and never sees the form.
 *
 * Without this, a new user landed on `/` — which deliberately mounts no
 * onboarding gate, to keep public pages free of a DB round-trip — so nothing
 * ever prompted them and the profile row was never created.
 */
export async function startGoogleSignIn(callbackURL?: string): Promise<void> {
  preserveAuthContext()
  await signIn.social({
    provider: 'google',
    newUserCallbackURL: NEW_USER_CALLBACK_URL,
    ...(callbackURL ? { callbackURL } : {}),
  })
}
