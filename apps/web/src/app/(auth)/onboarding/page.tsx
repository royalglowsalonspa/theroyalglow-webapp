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
 * Dependencies : @/lib/auth-server, next/headers, next/navigation
 *
 * Notes        :
 * - First sign-in redirects here to collect phone, DOB, gender, consents
 ************************************************************/
import { auth } from '@/lib/auth-server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { OnboardingForm } from './onboarding-form'

export const metadata = {
  title: 'Complete Your Profile | Royal Glow Salon & Spa',
  robots: { index: false, follow: false },
}

export default async function OnboardingPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    redirect('/')
  }

  return <OnboardingForm userName={session.user.name} userEmail={session.user.email} />
}
