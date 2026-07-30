/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
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
 * - `requireOnboardingPending` keeps this page reachable ONLY for users without a
 *   `customer_profile`, so the form cannot be re-submitted (the API's 409
 *   PROFILE_EXISTS becomes unreachable through the UI) and so the protected-page
 *   gate that redirects HERE can never loop — see @/lib/onboarding-guard.
 ************************************************************/

import { requireOnboardingPending } from '@/lib/onboarding-guard'
import { OnboardingForm } from './onboarding-form'

export const metadata = {
  title: 'Complete Your Profile | Royal Glow Salon & Spa',
  robots: { index: false, follow: false },
}

export default async function OnboardingPage() {
  // Authenticated AND not yet onboarded, or this returns a redirect instead.
  const session = await requireOnboardingPending()

  return <OnboardingForm userName={session.user.name} userEmail={session.user.email} />
}
