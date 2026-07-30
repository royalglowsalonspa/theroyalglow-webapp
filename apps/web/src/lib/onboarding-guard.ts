/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 09-06-2026 & Updated - 09-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : onboarding-guard
 * Scope        : Authentication — Profile-completion routing (server-side)
 *
 * Description  : Server-side routing gate that sends a first-time authenticated
 *                user with NO `customer_profile` row to /onboarding, and sends a
 *                user who ALREADY has one away from /onboarding. This is the
 *                profile-completion half of the auth gate; the SESSION half
 *                (cookie presence) stays in the edge middleware.
 *
 * Responsibilities :
 * - requireOnboardedSession(): protected surfaces → /onboarding when no profile
 * - requireOnboardingPending(): /onboarding → / when a profile already exists
 * - Resolve the session once and probe the profile with a single cheap query
 *
 * Features / Functionality :
 * - Single source of truth for the "is this user onboarded?" routing decision
 * - Mirrors the middleware's unauthenticated contract (redirect to `/`, never to
 *   a `/sign-in` page — none exists; Google OAuth is launched from the homepage)
 *
 * Tech Stack   : Next.js 16 (App Router, RSC), Better Auth, Drizzle ORM
 * Layer        : Presentation support (server-only routing gate)
 *
 * Dependencies : @rgss/db/queries (hasCustomerProfile), @/lib/auth-server,
 *                next/headers, next/navigation
 *
 * Notes        :
 * - WHY NOT MIDDLEWARE: `apps/web/src/middleware.ts` runs on the Edge/Workers
 *   runtime where Better Auth's `auth-server` (kysely) cannot be imported, so
 *   the `customer_profile` lookup cannot run there. It therefore runs here, in
 *   server components, where the full Node runtime and the DB client exist.
 *
 * - NO REDIRECT LOOP: both guards branch on the SAME single fact,
 *   `hasCustomerProfile(userId)`, in mutually exclusive directions:
 *       profile MISSING  → /onboarding is ALLOWED,  protected pages redirect TO it
 *       profile PRESENT  → /onboarding redirects to /, protected pages ALLOWED
 *   `requireOnboardedSession` is mounted ONLY on protected customer surfaces and
 *   NEVER under `(auth)`; `requireOnboardingPending` is used ONLY by the
 *   /onboarding page. No state can satisfy both redirects, so no cycle exists.
 *
 * - PUBLIC-PAGE COST: these helpers are mounted in the per-segment layouts of
 *   /profile, /bookings, /membership and /gems (plus the /onboarding page) — NOT
 *   in `(customer)/layout.tsx`, which is shared with the homepage, /services,
 *   /blog, /about, /contact and /faq. Genuinely public pages therefore keep
 *   their zero-DB-round-trip render path.
 ************************************************************/

import { hasCustomerProfile } from '@rgss/db/queries'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth-server'

/** Where a user with an incomplete profile must complete it. */
export const ONBOARDING_PATH = '/onboarding'

/**
 * Where everyone else goes. Doubles as the unauthenticated target, matching the
 * middleware contract (Google One Tap + the "Sign in" button live on the
 * homepage; there is deliberately no /sign-in page).
 */
export const HOME_PATH = '/'

/**
 * Gate for PROTECTED customer surfaces (/profile, /bookings, /membership,
 * /gems). Resolves the session and guarantees the caller is onboarded:
 *
 * - no session            → redirect to `/`
 * - session, no profile   → redirect to `/onboarding`
 * - session, has profile  → returns the session
 */
export async function requireOnboardedSession() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect(HOME_PATH)
  }

  const onboarded = await hasCustomerProfile(session.user.id)
  if (!onboarded) {
    redirect(ONBOARDING_PATH)
  }

  return session
}

/**
 * Inverse gate for the /onboarding page itself. Keeps the page reachable for the
 * users who need it and un-sittable for everyone else, so the onboarding form
 * can never be re-submitted (the API's 409 PROFILE_EXISTS becomes unreachable
 * through the UI):
 *
 * - no session            → redirect to `/`
 * - session, has profile  → redirect to `/`
 * - session, no profile   → returns the session (onboarding is ALLOWED)
 */
export async function requireOnboardingPending() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect(HOME_PATH)
  }

  const onboarded = await hasCustomerProfile(session.user.id)
  if (onboarded) {
    redirect(HOME_PATH)
  }

  return session
}
