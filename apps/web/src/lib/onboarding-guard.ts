/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 09-06-2026 & Updated - 27-09-2026
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
 * - requireOnboardingPending(): /onboarding → / (or back to the booking) when a
 *   profile already exists
 * - requireProfileBeforeBooking(): Book Now (`/?book=1`) → /onboarding first
 *   when the signed-in account has no profile
 * - repromptPendingOnboarding(): homepage → /onboarding at most once per 24h
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
 *                @/lib/onboarding-prompt, next/headers, next/navigation
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
 *   `repromptPendingOnboarding` and `requireProfileBeforeBooking` follow the
 *   same rule: they only ever redirect a profile-MISSING account TO
 *   /onboarding, which that state allows. `requireOnboardingPending` sends a
 *   profile-PRESENT account from `/onboarding?book=1` back to `/?book=1`, which
 *   that state allows. The middleware also sets the prompted cookie as
 *   /onboarding is served, so going back to `/` within 24h does not redirect
 *   again.
 *
 * - PUBLIC-PAGE COST: these helpers are mounted in the per-segment layouts of
 *   /profile, /bookings, /membership and /gems (plus the /onboarding page) — NOT
 *   in `(customer)/layout.tsx`, which is shared with the homepage, /services,
 *   /blog, /about, /contact and /faq. Genuinely public pages therefore keep
 *   their zero-DB-round-trip render path. The exceptions are on the homepage.
 *   `repromptPendingOnboarding` checks the prompted cookie, the session and the
 *   role first, so only a signed-in customer who has not been prompted in the
 *   last 24h pays for its single indexed `SELECT 1`. `requireProfileBeforeBooking`
 *   runs only when the URL carries `?book=1` and someone is signed in.
 ************************************************************/

import { hasCustomerProfile } from '@rgss/db/queries'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth-server'
import {
  hasBookingIntent,
  ONBOARDING_PATH,
  ONBOARDING_PROMPTED_COOKIE,
  onboardingPathForBooking,
  readBookingContext,
} from '@/lib/onboarding-prompt'
import { buildPostOnboardingDestination } from '@/lib/post-onboarding-destination'

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
 * - session, has profile  → redirect to `/`, or to `/?book=1` when the
 *                           onboarding URL carries booking intent (the profile
 *                           was completed in another tab, say), so the booking
 *                           still opens
 * - session, no profile   → returns the session (onboarding is ALLOWED)
 */
export async function requireOnboardingPending(
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect(HOME_PATH)
  }

  const onboarded = await hasCustomerProfile(session.user.id)
  if (onboarded) {
    redirect(buildPostOnboardingDestination(readBookingContext(searchParams)))
  }

  return session
}

/**
 * Booking gate for the HOMEPAGE, where every Book Now link and booking deep
 * link lands (`/?book=1`). A signed-in account without a completed profile is
 * sent to /onboarding BEFORE the booking dialog opens. Without this it could
 * fill in the whole booking and only then be refused, when POST /api/bookings
 * answers 403 ONBOARDING_REQUIRED. That 403 stays as the backstop.
 *
 * - no booking intent in the URL → returns (no session lookup)
 * - nobody signed in             → returns; the dialog opens, and its last step
 *                                  signs the visitor in (new customers are
 *                                  onboarded straight after Google sign-in)
 * - session, has profile         → returns; the dialog opens
 * - session, no profile          → redirect to /onboarding, with the booking and
 *                                  acquisition context in its query string
 *                                  (onboardingPathForBooking), so the form can
 *                                  reopen the dialog and attribute the profile
 *
 * Unlike the 24h re-prompt it applies to every role and ignores the prompted
 * cookie: POST /api/bookings requires a profile from every account, so tapping
 * Book Now always asks for a missing one.
 */
export async function requireProfileBeforeBooking(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<void> {
  if (!hasBookingIntent(searchParams)) {
    return
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return
  }

  if (await hasCustomerProfile(session.user.id)) {
    return
  }

  redirect(onboardingPathForBooking(searchParams))
}

/**
 * Gentle re-prompt for the HOMEPAGE only. A signed-in customer who has not
 * completed onboarding is sent to /onboarding at most once every 24 hours.
 *
 * This is deliberately NOT a hard gate. Skipping onboarding is allowed: the
 * customer can edit the URL back to `/` and keep browsing. The hard requirement
 * is booking: requireProfileBeforeBooking sends the customer to /onboarding when
 * they tap Book Now, and POST /api/bookings answers 403 ONBOARDING_REQUIRED as
 * the backstop, because a booking is the one thing that must never exist
 * without a phone number, date of birth and gender.
 *
 * Returns without redirecting when:
 * - the URL carries booking intent (`?book=1`). requireProfileBeforeBooking,
 *   which the homepage runs first, handles that case and keeps the booking
 *   context in the onboarding URL.
 * - the prompted cookie is present, meaning the form was shown in the last 24h.
 *   The middleware sets it whenever /onboarding is served.
 * - nobody is signed in, or the account is staff rather than a customer.
 * - the customer already has a profile.
 *
 * The checks run cheapest first, so anonymous visitors and recently prompted
 * customers never reach the database.
 */
export async function repromptPendingOnboarding(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<void> {
  if (hasBookingIntent(searchParams)) {
    return
  }

  const cookieStore = await cookies()
  if (cookieStore.has(ONBOARDING_PROMPTED_COOKIE)) {
    return
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return
  }

  // Staff and owners browse the public site too. Never push them into the
  // customer onboarding form.
  const role = (session.user as { role?: string | null }).role ?? 'customer'
  if (role !== 'customer') {
    return
  }

  if (await hasCustomerProfile(session.user.id)) {
    return
  }

  redirect(ONBOARDING_PATH)
}
