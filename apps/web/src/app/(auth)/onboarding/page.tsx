/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 27-09-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : OnboardingPage
 * Scope        : Authentication UI
 *
 * Description  : Server-rendered onboarding page that validates session
 *                and renders the profile completion form.
 *
 * Responsibilities :
 * - Validate user session (redirect to / if absent)
 * - Bounce users who already have a customer_profile back to / (see Notes)
 * - Pass user name/email to OnboardingForm
 *
 * Features / Functionality :
 * - Session-gated access
 * - Pre-fills name and email from OAuth session
 * - noindex metadata
 *
 * Tech Stack   : Next.js 16 (App Router), Better Auth (server)
 * Layer        : Presentation (Page)
 *
 * Dependencies : @/lib/onboarding-guard
 *
 * Notes        :
 * - First sign-in redirects here to collect phone, DOB, gender, consents
 * - Book Now also redirects here, as `/onboarding?book=1&…`, when the signed-in
 *   account has no profile (requireProfileBeforeBooking). The booking and
 *   acquisition context in that query string is handed to the form, which
 *   reopens the booking dialog afterwards.
 * - `requireOnboardingPending` keeps this page reachable ONLY for users without a
 *   `customer_profile`, so the form cannot be re-submitted (the API's 409
 *   PROFILE_EXISTS becomes unreachable through the UI) and so the protected-page
 *   gate that redirects HERE can never loop — see @/lib/onboarding-guard.
 ************************************************************/

import { requireOnboardingPending } from '@/lib/onboarding-guard'
import { readBookingContext } from '@/lib/onboarding-prompt'
import { OnboardingForm } from './onboarding-form'

export const metadata = {
  title: 'Complete Your Profile | Royal Glow Salon & Spa',
  robots: { index: false, follow: false },
}

type OnboardingPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const params = await searchParams

  // Authenticated AND not yet onboarded, or this returns a redirect instead.
  const session = await requireOnboardingPending(params)

  return (
    <OnboardingForm
      userName={session.user.name}
      userEmail={session.user.email}
      bookingContext={readBookingContext(params)}
    />
  )
}
